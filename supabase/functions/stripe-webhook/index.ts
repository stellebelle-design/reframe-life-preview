import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseUrl = Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(stripeKey, {
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Keep general client access active if the client has
// at least one paid or active purchase.
async function syncClientAccess(userId: string) {
  const { data, error } = await supabase
    .from("client_purchases")
    .select("payment_status")
    .eq("user_id", userId);

  if (error) throw error;

  const hasAccess = (data ?? []).some(
    (purchase) =>
      purchase.payment_status === "paid" ||
      purchase.payment_status === "active"
  );

  const { error: accessError } = await supabase
    .from("client_access")
    .upsert(
      {
        user_id: userId,
        status: hasAccess ? "active" : "inactive",
      },
      { onConflict: "user_id" }
    );

  if (accessError) throw accessError;
}

// Update the coaching purchase when Stripe reports
// a subscription status change.
async function updateSubscription(subscription: Stripe.Subscription) {
  const { data: purchase, error: lookupError } = await supabase
    .from("client_purchases")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (!purchase) {
    throw new Error(
      `No purchase found for subscription ${subscription.id}`
    );
  }

  // Keep access during Stripe's payment retry period.
  // Remove coaching access once the subscription is no
  // longer active, trialing or past_due.
  const purchaseStatus: "active" | "inactive" =
    ["active", "trialing", "past_due"].includes(subscription.status)
      ? "active"
      : "inactive";

  const { error: updateError } = await supabase
    .from("client_purchases")
    .update({ payment_status: purchaseStatus })
    .eq("stripe_subscription_id", subscription.id);

  if (updateError) throw updateError;

  // This preserves general access if another paid
  // purchase exists for the same client.
  await syncClientAccess(purchase.user_id);

  console.log(
    "Subscription updated:",
    subscription.id,
    purchaseStatus
  );
}

// Revoke a purchase only after Stripe confirms a full refund.
// Partial refunds do not automatically remove client access.
async function handleRefund(charge: Stripe.Charge) {
  if (!charge.refunded) return;

  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.warn("Refunded charge has no PaymentIntent:", charge.id);
    return;
  }

  const { data: purchase, error: lookupError } = await supabase
    .from("client_purchases")
    .select("user_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (!purchase) {
    // Throw so Stripe retries if the checkout event has not
    // yet created the purchase row.
    throw new Error(
      `No purchase found for refunded PaymentIntent ${paymentIntentId}`
    );
  }

  const { error: updateError } = await supabase
    .from("client_purchases")
    .update({ payment_status: "refunded" })
    .eq("stripe_payment_intent_id", paymentIntentId);

  if (updateError) throw updateError;

  await syncClientAccess(purchase.user_id);
  console.log("Full refund recorded:", paymentIntentId);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();

    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    // Successful one-off payments and completed subscriptions.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== "paid") {
        return new Response("Payment not completed", { status: 200 });
      }

      const userId =
        session.metadata?.supabase_user_id ||
        session.client_reference_id;

      const productKey = session.metadata?.product_key;

      const validProducts = [
        "personalised_programme",
        "coaching_4_week",
        "coaching_8_week",
        "coaching_12_week",
        "coaching_6_month",
      ];

      if (!userId || !productKey || !validProducts.includes(productKey)) {
        console.error("Missing or invalid purchase metadata");
        return new Response("Invalid purchase metadata", { status: 400 });
      }

      let subscriptionId: string | null = null;
      let paymentIntentId: string | null = null;
      let purchaseStatus: "paid" | "active" = "paid";

      if (typeof session.payment_intent === "string") {
        paymentIntentId = session.payment_intent;
      } else if (session.payment_intent?.id) {
        paymentIntentId = session.payment_intent.id;
      }

      if (session.mode === "subscription" && session.subscription) {
        subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );

        if (
          subscription.status !== "active" &&
          subscription.status !== "trialing"
        ) {
          return new Response("Subscription is not active", {
            status: 200,
          });
        }

        purchaseStatus = "active";
      }

      const { error: purchaseError } = await supabase
        .from("client_purchases")
        .upsert(
          {
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_subscription_id: subscriptionId,
            stripe_payment_intent_id: paymentIntentId,
            product_key: productKey,
            payment_status: purchaseStatus,
          },
          { onConflict: "stripe_checkout_session_id" }
        );

      if (purchaseError) throw purchaseError;

      await syncClientAccess(userId);

      console.log("Purchase recorded successfully:", session.id);
    }

    // Stripe reports subscription status changes here.
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscription(subscription);
    }

    // Stripe reports a subscription that has ended here.
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscription(subscription);
    }

    // Handle completed full refunds; partial refunds retain access.
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      await handleRefund(charge);
    }

    // Record failed payment attempts in the logs.
    // Stripe can retry the payment; access is not removed
    // just because of the first failed attempt.
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;

      console.warn(
        "Subscription invoice payment failed:",
        invoice.id
      );
    }

    return new Response("Webhook received", { status: 200 });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
