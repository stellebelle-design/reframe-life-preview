import Stripe from "npm:stripe@latest";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: "2026-03-25.dahlia" as never })
  : null;
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function asId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function recordCheckout(session: Stripe.Checkout.Session) {
  if (!supabase) throw new Error("Supabase service configuration is missing.");

  const userId = session.metadata?.supabase_user_id || session.client_reference_id;
  const productKey = session.metadata?.product_key;
  const allowedProducts = [
    "personalised_programme",
    "coaching_4_week",
    "coaching_8_week",
    "coaching_12_week",
    "coaching_6_month",
  ];

  if (!userId || !productKey || !allowedProducts.includes(productKey)) {
    throw new Error("Checkout session is missing valid client or product metadata.");
  }

  // Delayed payment methods are recorded only after Stripe confirms payment.
  if (session.payment_status !== "paid") {
    console.log("Checkout session is not paid yet; awaiting a successful payment event.", session.id);
    return;
  }

  const subscriptionId = asId(session.subscription);
  let status: "paid" | "active" = "paid";

  if (session.mode === "subscription") {
    if (!stripe || !subscriptionId) {
      throw new Error("Subscription checkout is missing its Stripe subscription.");
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      console.log("Subscription is not active; purchase access not activated.", subscriptionId, subscription.status);
      return;
    }
    status = "active";
  }

  const paymentIntentId = asId(session.payment_intent);
  const { error } = await supabase.from("client_purchases").upsert({
    user_id: userId,
    stripe_checkout_session_id: session.id,
    stripe_subscription_id: subscriptionId,
    stripe_payment_intent_id: paymentIntentId,
    product_key: productKey,
    payment_status: status,
  }, { onConflict: "stripe_checkout_session_id" });

  if (error) throw error;
}

async function updateSubscription(subscription: Stripe.Subscription) {
  if (!supabase) throw new Error("Supabase service configuration is missing.");
  const active = subscription.status === "active" || subscription.status === "trialing";
  const { error } = await supabase
    .from("client_purchases")
    .update({ payment_status: active ? "active" : "inactive" })
    .eq("stripe_subscription_id", subscription.id);
  if (error) throw error;
}

async function markRefunded(charge: Stripe.Charge) {
  if (!supabase) throw new Error("Supabase service configuration is missing.");
  if (!charge.refunded) return; // Do not revoke access for a partial refund.
  const paymentIntentId = asId(charge.payment_intent);
  if (!paymentIntentId) return;
  const { error } = await supabase
    .from("client_purchases")
    .update({ payment_status: "refunded" })
    .eq("stripe_payment_intent_id", paymentIntentId);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!stripe || !webhookSecret || !supabase) {
    console.error("Stripe webhook environment variables are incomplete.");
    return new Response("Webhook is not configured.", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature.", { status: 400 });

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return new Response("Invalid Stripe signature.", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await recordCheckout(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await updateSubscription(event.data.object as Stripe.Subscription);
        break;
      case "charge.refunded":
        await markRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        console.log("Ignoring Stripe event:", event.type);
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", event.id, event.type, error);
    // A non-2xx response asks Stripe to retry delivery.
    return new Response("Webhook processing failed.", { status: 500 });
  }
});
