// Client hub authentication. The login handler is attached even if the
// Supabase CDN/config is unavailable, preventing a silent native form reload.
(function initialiseClientAccess(){
  const loginScreen = document.querySelector("#loginScreen");
  const hubShell = document.querySelector("#hubShell");
  const loginForm = document.querySelector("#loginForm");
  const loginMessage = document.querySelector("#loginMessage");
  const loginSubmit = document.querySelector("#loginSubmit");
  const signOutButton = document.querySelector("#signOutButton");
  const adminPanel = document.querySelector("#adminPanel");
  const config = window.REFRAME_SUPABASE_CONFIG;
  const showMessage = (message, isError = true) => {
    if (!loginMessage) return;
    loginMessage.textContent = message;
    loginMessage.dataset.state = isError ? "error" : "success";
  };

  let client = null;
  let clientInitError = null;
  try {
    if (window.supabase && config?.url && config?.publishableKey) {
      client = window.supabase.createClient(config.url, config.publishableKey);
      window.reframeSupabaseClient = client;
    }
  } catch (error) {
    clientInitError = error;
    console.error("Reframe Life sign-in service could not initialise:", error);
  }

  async function loadClientDashboard(userId) {
    const dashboard = document.querySelector("#clientDashboard");
    const status = document.querySelector("#dashboardStatus");
    const programme = document.querySelector("#dashboardProgramme");
    const detail = document.querySelector("#dashboardProgrammeDetail");
    if (!dashboard || !programme || !detail) return;
    dashboard.hidden = false;
    try {
      const { data, error } = await client
        .from("client_purchases")
        .select("product_key,payment_status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const latestPurchase = (data || [])[0];
      const nextTitle = document.querySelector("#dashboardNextTitle");
      const nextCopy = document.querySelector("#dashboardNextCopy");
      const nextLink = document.querySelector("#dashboardNextLink");
      let onboarding = null;
      let readiness = null;
      if (latestPurchase) {
        const { data: submitted, error: onboardingError } = await client.from("client_onboarding")
          .select("id,submitted_at").eq("purchase_id", latestPurchase.id).maybeSingle();
        if (onboardingError) throw onboardingError;
        onboarding = submitted;
        if (onboarding) {
          const { data: ready, error: readinessError } = await client.from("client_programme_readiness")
            .select("is_ready").eq("purchase_id", latestPurchase.id).maybeSingle();
          if (readinessError) throw readinessError;
          readiness = !!ready?.is_ready;
        }
      }
      if (nextTitle && nextCopy && nextLink) {
        if (!onboarding) {
          nextTitle.textContent = "Your next step";
          nextCopy.textContent = "Tell me a little more about yourself so I can shape your programme and support around what matters to you.";
          nextLink.hidden = false;
          nextLink.textContent = "Complete your questionnaire";
          nextLink.href = "onboarding.html";
        } else if (!readiness) {
          nextTitle.textContent = "Your programme is taking shape";
          nextCopy.textContent = "Thank you for sharing your answers. I've got your details and am putting your personalised support together. I'll let you know when everything is ready.";
          nextLink.hidden = true;
        } else {
          nextTitle.textContent = "It's time to get started!";
          nextCopy.textContent = "You've got your plan, you've got your support, and you've got everything you need to begin. Take it one step at a time, believe in yourself and go smash those goals!";
          nextLink.hidden = true;
        }
      }
      const labels = {
        personalised_programme: "Personalised Training Programme",
        coaching_4_week: "Four-Week Coaching",
        coaching_8_week: "Eight-Week Coaching",
        coaching_12_week: "Twelve-Week Coaching",
        coaching_6_month: "Six-Month Ongoing Coaching"
      };
      const now = Date.now();
      const durations = {
        coaching_4_week: 4 * 7 * 24 * 60 * 60 * 1000,
        coaching_8_week: 8 * 7 * 24 * 60 * 60 * 1000,
        coaching_12_week: 12 * 7 * 24 * 60 * 60 * 1000
      };
      const active = (data || []).find(item => {
        if (item.product_key === "coaching_6_month") return item.payment_status === "active";
        const duration = durations[item.product_key];
        if (!duration || item.payment_status !== "paid" || !item.created_at) return false;
        const purchasedAt = new Date(item.created_at).getTime();
        return Number.isFinite(purchasedAt) && now < purchasedAt + duration;
      });
      if (active) {
        programme.textContent = labels[active.product_key] || "Your coaching programme";
        detail.textContent = active.product_key === "coaching_6_month"
          ? "Your ongoing coaching subscription is active."
          : "Your coaching access is active. Your programme resources are ready when you are.";
        if (status) status.textContent = "YOUR COACHING IS ACTIVE";
      } else {
        const personalised = (data || []).find(item =>
          item.product_key === "personalised_programme" && item.payment_status === "paid"
        );
        programme.textContent = personalised
          ? labels.personalised_programme
          : "Your Reframe Life space";
        detail.textContent = personalised
          ? "Your one-off personalised programme purchase is recorded here. Coaching resources are available with an eligible coaching package."
          : "Your account is ready. If you have recently purchased coaching, please contact us if your programme isn't showing.";
        if (status) status.textContent = "YOUR ACCOUNT";
      }
    } catch (error) {
      console.error("Could not load client dashboard:", error);
      programme.textContent = "Your Reframe Life space";
      detail.textContent = "We couldn't load your programme details just now. You can still explore the resources available to your account.";
      if (status) status.textContent = "WELCOME";
    }
  }

  async function loadClientCheckins(userId) {
    const section = document.querySelector("#my-progress");
    const form = document.querySelector("#clientCheckinForm");
    const message = document.querySelector("#checkinMessage");
    const history = document.querySelector("#checkinHistory");
    if (!section || !form || !history) return;
    try {
      const { data: purchases, error: purchaseError } = await client
        .from("client_purchases")
        .select("product_key,payment_status,created_at")
        .eq("user_id", userId);
      if (purchaseError) throw purchaseError;
      const now = Date.now();
      const durations = { coaching_4_week: 28, coaching_8_week: 56, coaching_12_week: 84 };
      const eligible = (purchases || []).some(item => {
        if (item.product_key === "coaching_6_month") return item.payment_status === "active";
        const days = durations[item.product_key];
        if (!days || item.payment_status !== "paid" || !item.created_at) return false;
        const purchased = new Date(item.created_at).getTime();
        return Number.isFinite(purchased) && now < purchased + days * 86400000;
      });
      const checkinHeading = section.querySelector(".section-heading");
      if (!eligible) {
        // Keep saved progress reviews accessible, while hiding the weekly
        // check-in heading, form and history from clients without active coaching.
        if (checkinHeading) checkinHeading.hidden = true;
        form.hidden = true;
        const historyPanel = history.closest(".checkin-history");
        if (historyPanel) historyPanel.hidden = true;
        return;
      }
      const { data: programmeSchedule, error: scheduleError } = await client.from("client_programme_schedules").select("programme_start_date").eq("user_id", userId).maybeSingle();
      if (scheduleError) throw scheduleError;
      const programmeStart = programmeSchedule?.programme_start_date || null;
      const visibleHistoryPanel = history.closest(".checkin-history");
      if (visibleHistoryPanel) visibleHistoryPanel.hidden = false;
      section.hidden = false;
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const localDate = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
      const weekInput = document.querySelector("#checkinWeek");
      const currentWeekStart = localDate(monday);
      const todayString = localDate(today);
      const isSunday = today.getDay() === 0;
      const programmeHasStarted = !!programmeStart && todayString >= programmeStart;
      const checkinDueToday = isSunday && programmeHasStarted;
      if (weekInput) { weekInput.value = currentWeekStart; weekInput.readOnly = true; }
      let hasSubmittedThisWeek = false;
      const setCheckinAvailability = submitted => {
        hasSubmittedThisWeek = submitted;
        const showForm = checkinDueToday && !submitted;
        form.hidden = !showForm;
        if (checkinHeading) checkinHeading.hidden = !showForm;
        form.querySelectorAll("input, select, textarea, button[type='submit']").forEach(control => { control.disabled = submitted || !checkinDueToday; });
        if (message && submitted) message.textContent = "You've already submitted this week's check-in. Your next check-in will appear next Sunday.";
        else if (message && isSunday && !programmeStart) message.textContent = "Your coach will add your programme start date before your check-ins begin.";
        else if (message && isSunday && !programmeHasStarted) message.textContent = "Your weekly check-ins will begin on your programme start date.";
        else if (message && !isSunday) message.textContent = "";
      };
      async function refreshHistory() {
        const { data, error } = await client.from("client_checkins")
          .select("week_start,energy,mood,confidence,consistency,wins,support_needed,coach_feedback,feedback_updated_at,created_at")
          .eq("user_id", userId).order("week_start", { ascending: false }).limit(8);
        if (error) throw error;
        history.replaceChildren();
        const submittedForCurrentWeek = (data || []).some(item => item.week_start === currentWeekStart);
        setCheckinAvailability(submittedForCurrentWeek);
        if (!data?.length) {
          const p=document.createElement("p"); p.textContent="Your check-ins will appear here as you complete them."; history.append(p); return;
        }
        data.forEach(item => {
          const article=document.createElement("article"); article.className="checkin-history-card";
          const heading=document.createElement("h4");
          const date=new Date(item.week_start+"T12:00:00");
          heading.textContent="Week commencing "+date.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
          const ratings=document.createElement("p"); ratings.className="checkin-history-ratings";
          ratings.textContent="Energy "+item.energy+"/5 · Mood "+item.mood+"/5 · Confidence "+item.confidence+"/5 · Consistency "+item.consistency+"/5";
          article.append(heading,ratings);
          if(item.wins){const wins=document.createElement("p");wins.textContent="Proud of: "+item.wins;article.append(wins);}
          if(item.support_needed){const support=document.createElement("p");support.textContent="Support wanted: "+item.support_needed;article.append(support);}
          if(item.coach_feedback){
            const feedback=document.createElement("div");feedback.className="checkin-coach-feedback";
            const feedbackTitle=document.createElement("strong");feedbackTitle.textContent="A note from your coach";
            const feedbackText=document.createElement("p");feedbackText.textContent=item.coach_feedback;
            feedback.append(feedbackTitle,feedbackText);
            if(item.feedback_updated_at){const when=document.createElement("small");when.textContent="Shared "+new Date(item.feedback_updated_at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});feedback.append(when);}
            article.append(feedback);
          }
          history.append(article);
        });
        const latest=data[0];
        if (latest && weekInput.value === latest.week_start) {
          ["Energy","Mood","Confidence","Consistency"].forEach(key => {
            const el=document.querySelector("#checkin"+key);
            if(el) el.value=String(latest[key.toLowerCase()]);
          });
          document.querySelector("#checkinWins").value=latest.wins || "";
          document.querySelector("#checkinSupport").value=latest.support_needed || "";
        }
      }
      await refreshHistory();

      // Keep coach replies current when a client returns to the Client Hub.
      const historyPanel = history.closest(".checkin-history");
      if (historyPanel && !historyPanel.querySelector(".checkin-refresh")) {
        const refreshButton = document.createElement("button");
        refreshButton.type = "button";
        refreshButton.className = "checkin-refresh";
        refreshButton.textContent = "Refresh check-ins";
        refreshButton.addEventListener("click", async () => {
          refreshButton.disabled = true;
          refreshButton.textContent = "Refreshing…";
          try {
            await refreshHistory();
            refreshButton.textContent = "Check-ins updated";
          } catch (error) {
            console.error("Could not refresh client check-ins:", error);
            refreshButton.textContent = "Couldn't refresh — try again";
          } finally {
            refreshButton.disabled = false;
          }
        });
        historyPanel.insertBefore(refreshButton, history);
      }
      const refreshWhenVisible = () => {
        if (document.visibilityState === "visible") {
          refreshHistory().catch(error => console.error("Could not refresh client check-ins:", error));
        }
      };
      window.addEventListener("focus", refreshWhenVisible);
      document.addEventListener("visibilitychange", refreshWhenVisible);

      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (hasSubmittedThisWeek) {
          if (message) message.textContent = "You've already submitted your check-in for this week. Your next check-in will be available from next Monday.";
          return;
        }
        const submit=document.querySelector("#checkinSubmit");
        if(submit){submit.disabled=true;submit.textContent="Saving…";}
        if(message) message.textContent="";
        try {
          const payload={
            user_id:userId,
            week_start:weekInput.value,
            energy:Number(document.querySelector("#checkinEnergy").value),
            mood:Number(document.querySelector("#checkinMood").value),
            confidence:Number(document.querySelector("#checkinConfidence").value),
            consistency:Number(document.querySelector("#checkinConsistency").value),
            wins:document.querySelector("#checkinWins").value.trim(),
            support_needed:document.querySelector("#checkinSupport").value.trim()
          };
          const {error}=await client.from("client_checkins").upsert(payload,{onConflict:"user_id,week_start"});
          if(error) throw error;
          setCheckinAvailability(true);
          if(message) message.textContent="Your check-in has been saved. Thank you for taking a moment for yourself. Your next check-in will be available from next Monday.";
          await refreshHistory();
        } catch(error) {
          console.error("Could not save client check-in:",error);
          if(message) message.textContent="We couldn't save your check-in just now. Please try again.";
        } finally {
          if(submit) {
            submit.textContent = hasSubmittedThisWeek ? "Check-in submitted" : "Save my check-in";
            submit.disabled = hasSubmittedThisWeek;
          }
        }
      });
    } catch(error) {
      console.error("Could not load client check-ins:",error);
      section.hidden=false;
      history.textContent="We couldn't load your check-ins just now. Please refresh and try again.";
      if(message) message.textContent="Check-in storage needs to be set up before you can save your answers.";
    }
  }

  async function loadClientProgressReviews(userId) {
    const section=document.querySelector("#clientProgressReviews"),list=document.querySelector("#clientProgressReviewList");
    if(!section||!list)return;section.hidden=false;
    const progressSection=document.querySelector("#my-progress");if(progressSection)progressSection.hidden=false;
    const progressNav=document.querySelector("#sidebarProgress");if(progressNav)progressNav.hidden=false;
    async function refreshReviews(){
      const {data:reviews,error}=await client.from("client_progress_reviews").select("period_start,period_end,progress_summary,wins,challenges,next_goals,coach_feedback,updated_at").eq("user_id",userId).order("period_start",{ascending:false}).limit(12);if(error)throw error;
      const {data:reflections,error:reflectionError}=await client.from("client_progress_reflections").select("period_start,what_went_well,proud_of,challenging,next_focus,updated_at").eq("user_id",userId);if(reflectionError)throw reflectionError;
      const {data:schedule,error:scheduleError}=await client.from("client_programme_schedules").select("programme_start_date").eq("user_id",userId).maybeSingle();if(scheduleError)throw scheduleError;
      const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"),isSunday=now.getDay()===0;
      const byPeriod=new Map((reflections||[]).map(x=>[x.period_start,x]));list.replaceChildren();
      if(!reviews?.length){list.textContent="Your four-week reviews will appear here when your coach shares them.";return;}
      reviews.forEach(r=>{
        const reflection=byPeriod.get(r.period_start)||{};
        const isDue=isSunday && !!schedule?.programme_start_date && today>=r.period_end && today>=schedule.programme_start_date;
        if(!isDue && !reflection.updated_at)return;
        const card=document.createElement("article");card.className="checkin-history-card progress-review-card";
        const fmt=d=>new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
        const toggle=document.createElement("button");toggle.type="button";toggle.className="progress-review-toggle";toggle.setAttribute("aria-expanded","false");
        const heading=document.createElement("span");heading.className="progress-review-date";heading.textContent=fmt(r.period_start)+" – "+fmt(r.period_end);
        const action=document.createElement("span");action.className="progress-review-action";action.textContent="Read review +";toggle.append(heading,action);
        const body=document.createElement("div");body.className="progress-review-body";body.hidden=true;
        [["Overall progress",r.progress_summary],["Wins and positive changes",r.wins],["Challenges",r.challenges],["Goals for the next four weeks",r.next_goals]].forEach(([label,value])=>{if(value){const p=document.createElement("p"),strong=document.createElement("strong");strong.textContent=label+": ";p.append(strong,document.createTextNode(value));body.append(p);}});
        if(r.coach_feedback){const box=document.createElement("div");box.className="checkin-coach-feedback";const strong=document.createElement("strong");strong.textContent="A note from your coach";const p=document.createElement("p");p.textContent=r.coach_feedback;box.append(strong,p);body.append(box);}
        const form=document.createElement("form");form.className="progress-client-reflection";
        const title=document.createElement("h4");title.textContent="Your four-week reflection";form.append(title);
        const fields=[["what_went_well","What has gone well over the last four weeks?"],["proud_of","What are you most proud of?"],["challenging","What has felt challenging, or where would you like support?"],["next_focus","What would you like to focus on over the next four weeks?"]],inputs={};
        fields.forEach(([key,label])=>{const wrap=document.createElement("label");wrap.textContent=label;const area=document.createElement("textarea");area.rows=3;area.maxLength=3000;area.placeholder="Write as much or as little as feels useful…";area.value=reflection[key]||"";wrap.append(area);form.append(wrap);inputs[key]=area;});
        const save=document.createElement("button");save.type="submit";save.className="admin-save";save.textContent=reflection.updated_at?"Update my reflection":"Save my reflection";
        const msg=document.createElement("p");msg.className="progress-reflection-message";msg.setAttribute("role","status");form.append(save,msg);
        form.addEventListener("submit",async event=>{event.preventDefault();save.disabled=true;save.textContent="Saving…";msg.textContent="";
          try{const payload={user_id:userId,period_start:r.period_start,what_went_well:inputs.what_went_well.value.trim(),proud_of:inputs.proud_of.value.trim(),challenging:inputs.challenging.value.trim(),next_focus:inputs.next_focus.value.trim(),updated_at:new Date().toISOString()};
            const {error:saveError}=await client.from("client_progress_reflections").upsert(payload,{onConflict:"user_id,period_start"});if(saveError)throw saveError;msg.textContent="Your reflection has been saved. Thank you for taking a moment for yourself.";save.textContent="Update my reflection";
          }catch(error){console.error("Could not save client reflection:",error);msg.textContent="We couldn't save your reflection just now. Please try again.";save.textContent="Save my reflection";}finally{save.disabled=false;}
        });
        body.append(form);
        if(r.updated_at){const updated=document.createElement("small");updated.textContent="Coach review updated "+new Date(r.updated_at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});body.append(updated);}
        toggle.addEventListener("click",()=>{const open=toggle.getAttribute("aria-expanded")==="true";toggle.setAttribute("aria-expanded",String(!open));body.hidden=open;action.textContent=open?"Read review +":"Close review −";});
        card.append(toggle,body);list.append(card);
      });
    }
    if(!section.querySelector(".progress-review-refresh")){const b=document.createElement("button");b.type="button";b.className="progress-review-refresh";b.textContent="Refresh reviews";b.addEventListener("click",async()=>{b.disabled=true;b.textContent="Refreshing…";try{await refreshReviews();b.textContent="Reviews updated";}catch(e){console.error(e);b.textContent="Couldn't refresh — try again";}finally{b.disabled=false;}});section.insertBefore(b,list);}
    try{await refreshReviews();}catch(error){console.error("Could not load progress reviews:",error);list.textContent="We couldn't load your four-week reviews just now. Please refresh or contact your coach if this continues.";}
    const refreshWhenVisible=()=>{if(document.visibilityState==="visible")refreshReviews().catch(error=>console.error("Could not refresh progress reviews:",error));};window.addEventListener("focus",refreshWhenVisible);document.addEventListener("visibilitychange",refreshWhenVisible);
  }

  async function checkAccess(session) {
    if (!session?.user) {
      hubShell.hidden = true;
      loginScreen.hidden = false;
      return false;
    }
    const { data, error } = await client
      .from("client_access")
      .select("status")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error || data?.status !== "active") {
      await client.auth.signOut();
      hubShell.hidden = true;
      loginScreen.hidden = false;
      showMessage("We couldn't verify active client access for this account. Please contact Reframe Life if you think this is a mistake.");
      return false;
    }
    loginScreen.hidden = true;
    hubShell.hidden = false;
    const { data: adminRecord } = await client.from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (adminPanel) adminPanel.hidden = true; // Navigation controls when the private admin view is shown.
    const adminNav=document.querySelector("#sidebarAdmin"); if(adminNav)adminNav.hidden=!adminRecord;

    if (adminRecord) {
      // Keep the admin account focused on running the business, not the client experience.
      document.body.classList.add("hub-admin-mode");
      ["[data-section='home']","#sidebarProgress",".sidebar-nav a[href='onboarding.html']",
       ".sidebar-view-switch"].forEach(selector=>{
        document.querySelectorAll(selector).forEach(item=>item.hidden=true);
      });
      if (adminPanel) adminPanel.hidden=false;
      if (window.showClientHubSection) window.showClientHubSection("adminPanel");
    } else {
      // Client-only dashboard, questionnaire and progress tools stay on client accounts.
      const progressSection=document.querySelector("#my-progress");
      if(progressSection)progressSection.hidden=false;
      const progressNav=document.querySelector("#sidebarProgress");
      if(progressNav)progressNav.hidden=false;
      await loadClientDashboard(session.user.id);
      await loadClientCheckins(session.user.id);
      const progressNavAfterCheckins=document.querySelector("#sidebarProgress");
      if(progressNavAfterCheckins)progressNavAfterCheckins.hidden=document.querySelector("#my-progress")?.hidden ?? true;
      await loadClientProgressReviews(session.user.id);
    }
    await loadPublishedRecipes({ isAdmin: !!adminRecord, userId: session.user.id });
    if (adminRecord && window.loadAdminRecipes) await window.loadAdminRecipes();
    if (adminRecord && window.loadAdminOnboarding) await window.loadAdminOnboarding();
    if (adminRecord && window.loadAdminCheckins) await window.loadAdminCheckins();
    if (adminRecord && window.loadAdminProgressReviews) await window.loadAdminProgressReviews();
    if (adminRecord && window.loadAdminProgrammeReadiness) await window.loadAdminProgrammeReadiness();
    if (adminRecord && window.loadAdminClientRetention) await window.loadAdminClientRetention();
    return true;
  }

  // Always prevent the browser's default form navigation, even if auth is offline.
  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (loginForm && !loginForm.reportValidity()) return;
    if (!client) {
      showMessage(clientInitError
        ? "The sign-in service couldn't start. Please contact Reframe Life so we can check the connection."
        : "The sign-in service hasn't loaded. Please refresh the page and try again.");
      return;
    }
    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.textContent = "Signing in…";
    }
    showMessage("");
    try {
      const email = document.querySelector("#loginEmail").value.trim();
      const password = document.querySelector("#loginPassword").value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Reframe Life sign-in error:", error);
        showMessage("We couldn't sign you in. Please check your details or try again shortly.");
      } else {
        await checkAccess(data.session);
      }
    } catch (error) {
      console.error("Reframe Life sign-in could not complete:", error);
      showMessage("The sign-in service didn't respond. Please wait a moment and try again.");
    } finally {
      if (loginSubmit) {
        loginSubmit.disabled = false;
        loginSubmit.innerHTML = 'Sign in <span>↗</span>';
      }
    }
  });

  signOutButton?.addEventListener("click", async () => {
    if (!client) return;
    try {
      await client.auth.signOut();
      hubShell.hidden = true;
      loginScreen.hidden = false;
      document.querySelector("#loginPassword").value = "";
      showMessage("You have been signed out.", false);
    } catch (error) {
      console.error("Reframe Life sign-out error:", error);
      showMessage("We couldn't complete sign-out. Please refresh the page.");
    }
  });

  if (!client) {
    showMessage("The sign-in service hasn't loaded. Please refresh the page and try again.");
    return;
  }

  client.auth.getSession()
    .then(({ data: { session } }) => checkAccess(session))
    .catch(error => {
      console.error("Reframe Life session restore error:", error);
      showMessage("We couldn't restore your previous session. Please try signing in below.");
    });
})();

let recipes = {
  berry: {category:"BREAKFAST",title:"Berry yoghurt breakfast bowl",description:"A fresh, flexible bowl for slow mornings or busy starts.",ingredients:["200g plain Greek-style yoghurt","A handful of mixed berries","30g granola or toasted oats","1 tsp nut butter or seeds (optional)"],method:["Spoon the yoghurt into a bowl.","Top with berries and granola.","Finish with nut butter or seeds, if you like."]},
  fajita: {category:"LUNCH",title:"Chicken fajita rice bowl",description:"A colourful, build-your-own bowl with plenty of flavour.",ingredients:["Chicken breast, sliced","Cooked rice","1 red pepper, sliced","½ red onion, sliced","Fajita seasoning","Lime and fresh coriander"],method:["Season the chicken and vegetables.","Cook in a hot pan until the chicken is thoroughly cooked and the vegetables are tender.","Serve over rice with lime and coriander."]},
  salmon: {category:"DINNER",title:"Lemon salmon orzo",description:"A comforting one-pan inspired dinner with greens and a little zing.",ingredients:["Salmon fillets","Orzo","Vegetable stock","A handful of spinach","Lemon zest and juice","Black pepper"],method:["Cook the orzo in stock, stirring regularly.","Add spinach towards the end and allow it to wilt.","Cook the salmon separately until safely cooked through, then serve with the orzo, lemon and black pepper."]},
  oats: {category:"BREAKFAST",title:"Apple & cinnamon overnight oats",description:"A make-ahead breakfast that can be adapted to what you have in the fridge.",ingredients:["50g rolled oats","120ml milk of choice","½ apple, grated","A pinch of cinnamon","A spoonful of yoghurt"],method:["Mix the oats, milk, apple and cinnamon in a jar.","Cover and refrigerate overnight.","Stir, add yoghurt and a splash of milk if needed, then enjoy."]},
  tray: {category:"DINNER",title:"Sweet potato & chickpea traybake",description:"A colourful, low-fuss traybake with warming spices.",ingredients:["1 sweet potato, cubed","1 tin chickpeas, drained","1 red onion, cut into wedges","1 tsp smoked paprika","Olive oil","Yoghurt and herbs to serve"],method:["Heat the oven to 200°C (180°C fan).","Toss the sweet potato, chickpeas and onion with paprika and a little oil.","Roast for 25–30 minutes, turning once, until tender and golden. Serve with yoghurt and herbs."]},
  bites: {category:"SNACKS & SWEET",title:"Chocolate banana yoghurt bites",description:"A simple freezer treat for when you fancy something sweet.",ingredients:["1 banana","A few spoonfuls of thick yoghurt","Melted dark chocolate","Optional chopped nuts or coconut"],method:["Slice the banana and arrange on a lined tray.","Add a small spoonful of yoghurt to each slice and freeze until firm.","Drizzle with melted chocolate and return to the freezer until set."]}
};

async function loadPublishedRecipes({ isAdmin = false, userId = null } = {}){
  const grid = document.querySelector("#recipeGrid");
  const count = document.querySelector("#recipeCount");
  const empty = document.querySelector("#emptyState");
  if (!grid) return;
  grid.replaceChildren();
  if (count) count.textContent = "LOADING";
  const tools = document.querySelector(".recipe-tools");
  const note = document.querySelector(".content-note");
  const lockedMessage = document.querySelector("#recipeAccessMessage");
  let hasRecipeAccess = isAdmin;
  if (!isAdmin) {
    const { data: purchases, error: purchaseError } = await window.reframeSupabaseClient
      .from("client_purchases")
      .select("product_key,payment_status,created_at")
      .eq("user_id", userId);
    if (purchaseError) {
      if (count) count.textContent = "RECIPES";
      if (empty) { empty.hidden = false; empty.textContent = "We couldn't check your Recipe Bank access just now. Please refresh and try again."; }
      return;
    }
    const now = Date.now();
    const durations = {
      coaching_4_week: 4 * 7 * 24 * 60 * 60 * 1000,
      coaching_8_week: 8 * 7 * 24 * 60 * 60 * 1000,
      coaching_12_week: 12 * 7 * 24 * 60 * 60 * 1000
    };
    hasRecipeAccess = (purchases || []).some(purchase => {
      if (purchase.product_key === "coaching_6_month") return purchase.payment_status === "active";
      const duration = durations[purchase.product_key];
      if (!duration || purchase.payment_status !== "paid" || !purchase.created_at) return false;
      const purchasedAt = new Date(purchase.created_at).getTime();
      return Number.isFinite(purchasedAt) && now < purchasedAt + duration;
    });
  }
  if (!hasRecipeAccess) {
    if (tools) tools.hidden = true;
    grid.hidden = true;
    if (note) note.hidden = true;
    if (count) count.textContent = "COACHING ACCESS";
    if (empty) empty.hidden = true;
    let message = lockedMessage;
    if (!message) {
      message = document.createElement("div");
      message.id = "recipeAccessMessage";
      message.className = "empty-state";
      message.setAttribute("role", "status");
      grid.parentNode.insertBefore(message, grid);
    }
    message.hidden = false;
    message.textContent = "The Reframe Kitchen is included with our coaching packages. If you believe you should have access, please contact Reframe Life and we'll be happy to help.";
    return;
  }
  if (tools) tools.hidden = false;
  grid.hidden = false;
  if (note) note.hidden = false;
  if (lockedMessage) lockedMessage.hidden = true;
  const { data, error } = await window.reframeSupabaseClient
    .from("recipes")
    .select("id,title,description,category,ingredients,instructions,image_url,prep_minutes,cook_minutes,calories,protein,carbohydrates,fat")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (error) {
    if (count) count.textContent = "RECIPES";
    if (empty) { empty.hidden = false; empty.textContent = "We couldn't load the recipes just now. Please refresh and try again."; }
    return;
  }
  recipes = {};
  for (const item of (data || [])) {
    const key = String(item.id);
    recipes[key] = {
      category: (item.category || "RECIPE").toUpperCase(),
      title: item.title,
      description: item.description || "",
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      method: Array.isArray(item.instructions) ? item.instructions : [],
      prep_minutes: item.prep_minutes,
      cook_minutes: item.cook_minutes,
      calories: item.calories,
      protein: item.protein,
      carbohydrates: item.carbohydrates,
      fat: item.fat
    };
    const card = document.createElement("article");
    const category = (item.category || "other").toLowerCase();
    card.className = "recipe-card";
    card.dataset.category = category;
    card.dataset.search = [item.title, item.description, ...(recipes[key].ingredients)].join(" ").toLowerCase();
    const art = document.createElement("div");
    art.className = "recipe-art art-berry";
    if (item.image_url) {
      const { data: signedImage } = await window.reframeSupabaseClient.storage.from("client-resources").createSignedUrl(item.image_url, 3600);
      if (signedImage?.signedUrl) art.style.backgroundImage = 'url("' + signedImage.signedUrl.replace(/"/g, "%22") + '")';
      art.style.backgroundSize = "cover";
      art.style.backgroundPosition = "center";
    } else {
      const label = document.createElement("span");
      label.className = "art-label";
      label.textContent = "FROM THE REFRAME KITCHEN";
      art.append(label);
      const mark = document.createElement("span");
      mark.className = "food-mark";
      mark.textContent = "✦";
      art.append(mark);
    }
    const info = document.createElement("div");
    info.className = "recipe-info";
    const meta = document.createElement("div");
    meta.className = "recipe-meta";
    const categoryLabel = document.createElement("span");
    categoryLabel.textContent = (item.category || "RECIPE").toUpperCase();
    const duration = document.createElement("span");
    const total = (Number(item.prep_minutes) || 0) + (Number(item.cook_minutes) || 0);
    duration.textContent = total ? total + " MIN" : "";
    meta.append(categoryLabel, duration);
    const heading = document.createElement("h3");
    heading.textContent = item.title;
    const description = document.createElement("p");
    description.textContent = item.description || "";
    const open = document.createElement("button");
    open.className = "recipe-open";
    open.type = "button";
    open.dataset.recipe = key;
    open.textContent = "View recipe ↗";
    info.append(meta, heading, description, open);
    card.append(art, info);
    grid.append(card);
  }
  if (count) count.textContent = String((data || []).length).padStart(2, "0") + ((data || []).length === 1 ? " RECIPE" : " RECIPES");
  if (empty) {
    empty.hidden = (data || []).length !== 0;
    if (!(data || []).length) empty.textContent = "Your recipe library is ready for its first published recipe. Add one in Supabase and it will appear here.";
  }
  filterRecipes();
}

const search = document.querySelector("#recipeSearch");
const filters = [...document.querySelectorAll(".filter")];
let activeFilter = "all";
function filterRecipes(){
  const cards = [...document.querySelectorAll("#recipeGrid .recipe-card")];
  const term = (search?.value || "").trim().toLowerCase();
  let visible = 0;
  cards.forEach(card=>{
    const categoryMatch = activeFilter === "all" || card.dataset.category === activeFilter;
    const searchMatch = !term || (card.dataset.search + " " + card.textContent).toLowerCase().includes(term);
    const show = categoryMatch && searchMatch;
    card.hidden = !show;
    if(show) visible++;
  });
  document.querySelector("#recipeCount").textContent = String(visible).padStart(2,"0") + (visible === 1 ? " RECIPE" : " RECIPES");
  document.querySelector("#emptyState").hidden = visible !== 0;
}
search?.addEventListener("input",filterRecipes);
filters.forEach(button=>button.addEventListener("click",()=>{
  activeFilter = button.dataset.filter;
  filters.forEach(item=>{
    const active = item === button;
    item.classList.toggle("active",active);
    item.setAttribute("aria-pressed",String(active));
  });
  filterRecipes();
}));
const dialog = document.querySelector("#recipeDialog");
document.querySelector("#recipeGrid")?.addEventListener("click", event=>{
  const button = event.target.closest(".recipe-open");
  if (!button) return;
  const recipe = recipes[button.dataset.recipe];
  if(!recipe || !dialog) return;
  document.querySelector("#dialogCategory").textContent = recipe.category;
  document.querySelector("#dialogTitle").textContent = recipe.title;
  document.querySelector("#dialogDescription").textContent = recipe.description;
  document.querySelector("#dialogIngredients").replaceChildren(...recipe.ingredients.map(item=>{const li=document.createElement("li");li.textContent=item;return li;}));
  document.querySelector("#dialogMethod").replaceChildren(...recipe.method.map(item=>{const li=document.createElement("li");li.textContent=item;return li;}));
  const nutrition = [recipe.calories ? recipe.calories + " kcal" : "", recipe.protein ? "Protein " + recipe.protein + "g" : "", recipe.carbohydrates ? "Carbs " + recipe.carbohydrates + "g" : "", recipe.fat ? "Fat " + recipe.fat + "g" : ""].filter(Boolean).join(" · ");
  document.querySelector("#dialogDescription").textContent = [recipe.description, nutrition].filter(Boolean).join("  ");
  dialog.showModal();
});
document.querySelector("#dialogClose")?.addEventListener("click",()=>dialog.close());
dialog?.addEventListener("click",event=>{if(event.target===dialog) dialog.close();});

/* Admin-only recipe management. Admin status is verified against the protected admin_users table. */
(function initialiseRecipeManager(){
  const client = window.reframeSupabaseClient;
  const panel = document.querySelector("#adminPanel");
  const form = document.querySelector("#recipeAdminForm");
  if (!client || !panel || !form) return;
  const byId = id => document.getElementById(id);
  const message = text => { byId("adminMessage").textContent = text; };
  const lines = value => value.split("\n").map(x => x.trim()).filter(Boolean);
  async function uploadPhoto(file) {
    if (!file) return null;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error("Please choose a JPG, PNG or WebP image under 5MB.");
    }
    const { data: userData } = await client.auth.getUser();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = userData.user.id + "/" + Date.now() + "-" + safeName;
    const { error } = await client.storage.from("client-resources").upload(path, file, { upsert:false, contentType:file.type });
    if (error) throw error;
    return path;
  }
  async function loadAdminRecipes(){
    const list = byId("adminRecipeList");
    list.textContent = "Loading recipes…";
    const { data, error } = await client.from("recipes")
      .select("id,title,category,is_published,description,ingredients,instructions,prep_minutes,cook_minutes,calories,protein,carbohydrates,fat,image_url")
      .order("created_at",{ascending:false});
    if (error) { list.textContent = "Couldn't load recipes: " + error.message; return; }
    list.replaceChildren();
    (data || []).forEach(recipe => {
      const row = document.createElement("div"); row.className = "admin-recipe-row";
      const details = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = recipe.title;
      const status = document.createElement("small"); status.textContent = (recipe.category || "Other") + " · " + (recipe.is_published ? "Published" : "Unpublished");
      details.append(title,status);
      const actions = document.createElement("div"); actions.className = "admin-row-actions";
      const edit = document.createElement("button"); edit.type="button"; edit.className="admin-row-button"; edit.textContent="Edit";
      edit.addEventListener("click",()=>editRecipe(recipe));
      const remove = document.createElement("button"); remove.type="button"; remove.className="admin-row-button"; remove.textContent="Delete";
      remove.addEventListener("click",async()=>{
        if (!window.confirm("Delete “" + recipe.title + "”? This cannot be undone.")) return;
        const { error: deleteError } = await client.from("recipes").delete().eq("id",recipe.id);
        if (deleteError) message("Couldn't delete recipe: " + deleteError.message);
        else { message("Recipe deleted."); await loadAdminRecipes(); await loadPublishedRecipes(); }
      });
      actions.append(edit,remove); row.append(details,actions); list.append(row);
    });
    if (!data?.length) list.textContent = "No recipes yet. Add your first recipe above.";
  }
  function editRecipe(r){
    byId("adminRecipeId").value=r.id;
    byId("adminTitle").value=r.title || "";
    byId("adminCategory").value=r.category || "breakfast";
    byId("adminDescription").value=r.description || "";
    byId("adminIngredients").value=(r.ingredients || []).join("\n");
    byId("adminInstructions").value=(r.instructions || []).join("\n");
    byId("adminPrep").value=r.prep_minutes ?? "";
    byId("adminCook").value=r.cook_minutes ?? "";
    byId("adminCalories").value=r.calories ?? "";
    byId("adminProtein").value=r.protein ?? "";
    byId("adminCarbs").value=r.carbohydrates ?? "";
    byId("adminFat").value=r.fat ?? "";
    byId("adminPublished").checked=!!r.is_published;
    byId("adminCancel").hidden=false;
    byId("adminSave").textContent="Update recipe";
    form.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function resetForm(){
    form.reset(); byId("adminRecipeId").value="";
    byId("adminCancel").hidden=true; byId("adminSave").textContent="Save recipe";
  }
  byId("adminCancel").addEventListener("click",()=>{resetForm();message("");});
  form.addEventListener("submit",async event=>{
    event.preventDefault(); byId("adminSave").disabled=true; message("Saving…");
    try {
      const id=byId("adminRecipeId").value;
      const payload={
        title:byId("adminTitle").value.trim(),
        category:byId("adminCategory").value,
        description:byId("adminDescription").value.trim(),
        ingredients:lines(byId("adminIngredients").value),
        instructions:lines(byId("adminInstructions").value),
        prep_minutes:byId("adminPrep").value ? Number(byId("adminPrep").value) : null,
        cook_minutes:byId("adminCook").value ? Number(byId("adminCook").value) : null,
        calories:byId("adminCalories").value ? Number(byId("adminCalories").value) : null,
        protein:byId("adminProtein").value ? Number(byId("adminProtein").value) : null,
        carbohydrates:byId("adminCarbs").value ? Number(byId("adminCarbs").value) : null,
        fat:byId("adminFat").value ? Number(byId("adminFat").value) : null,
        is_published:byId("adminPublished").checked
      };
      const file=byId("adminImage").files[0];
      if(file) payload.image_url=await uploadPhoto(file);
      const result=id
        ? await client.from("recipes").update(payload).eq("id",id)
        : await client.from("recipes").insert(payload);
      if(result.error) throw result.error;
      message(id ? "Recipe updated." : "Recipe added.");
      resetForm(); await loadAdminRecipes(); await loadPublishedRecipes();
    } catch(error) { message("Couldn't save: " + (error.message || "Please try again.")); }
    finally { byId("adminSave").disabled=false; }
  });
  window.loadAdminRecipes=loadAdminRecipes;
})();

/* Client Hub navigation: focused sections or a full-page scroll view. */
(function(){
 const links=[...document.querySelectorAll(".sidebar-link[data-section]")];
 const homeItems=[
  document.querySelector("#home"),
  document.querySelector("#clientDashboard"),
  document.querySelector(".quick-links"),
  document.querySelector("#coming-soon")
 ].filter(Boolean);
 const progress=document.querySelector("#my-progress");
 const recipes=document.querySelector("#recipes");
 const resources=document.querySelector("#guides");
 const guideCard=resources?.querySelector(".lower-card:not(#planning)");
 const planningCard=document.querySelector("#planning");
 const admin=document.querySelector("#adminPanel");
 const viewAllButton=document.querySelector("#hubViewAll");
 const focusedButton=document.querySelector("#hubFocusedView");
 const destinations={
  home:homeItems,
  "my-progress":[progress],
  recipes:[recipes],
  guides:[resources],
  planning:[resources],
  adminPanel:[admin]
 };
 function setMode(all){
  document.body.classList.toggle("hub-view-all",all);
  if(viewAllButton)viewAllButton.setAttribute("aria-pressed",String(all));
  if(focusedButton)focusedButton.setAttribute("aria-pressed",String(!all));
  if(all){
   [...homeItems,progress,recipes,resources].filter(Boolean).forEach(item=>item.hidden=false);
   if(guideCard)guideCard.hidden=false;
   if(planningCard)planningCard.hidden=false;
   // Never expose private admin tools to a non-admin account.
   const adminNav=document.querySelector("#sidebarAdmin");
   if(admin)admin.hidden=!!adminNav?.hidden;
   links.forEach(link=>link.classList.remove("active"));
   window.scrollTo({top:0,behavior:"smooth"});
  }else{
   show("home");
  }
 }
 function show(name){
  const chosen=destinations[name]||homeItems;
  [...homeItems,progress,recipes,resources,admin].filter(Boolean).forEach(item=>{
   item.hidden=!chosen.includes(item);
  });
  if(resources){
   if(guideCard)guideCard.hidden=name==="planning";
   if(planningCard)planningCard.hidden=name==="guides";
  }
  links.forEach(link=>link.classList.toggle("active",link.dataset.section===name));
  if(name==="home"&&document.querySelector(".quick-links"))document.querySelector(".quick-links").hidden=false;
  document.body.classList.remove("hub-view-all");
  if(viewAllButton)viewAllButton.setAttribute("aria-pressed","false");
  if(focusedButton)focusedButton.setAttribute("aria-pressed","true");
  window.scrollTo({top:0,behavior:"smooth"});
 }
 links.forEach(link=>link.addEventListener("click",event=>{
  event.preventDefault();
  const name=link.dataset.section;
  if(name==="my-progress"&&link.hidden)return;
  setMode(false);
  show(name);
 }));
 viewAllButton?.addEventListener("click",()=>setMode(true));
 focusedButton?.addEventListener("click",()=>setMode(false));
 window.showClientHubSection=show;
 show("home");
})();

/* Admin display names: keep UUIDs as database keys, but show people-friendly names in admin tools. */
window.reframeGetClientNames = async function(userIds){
  const client=window.reframeSupabaseClient;
  const ids=[...new Set((userIds||[]).filter(Boolean))];
  const result=new Map();
  if(!client||!ids.length)return result;
  const {data,error}=await client.from('client_onboarding').select('user_id,responses,submitted_at').in('user_id',ids).order('submitted_at',{ascending:false});
  if(error)throw error;
  (data||[]).forEach(item=>{if(!result.has(item.user_id)){const name=typeof item.responses?.full_name==='string'&&item.responses.full_name.trim()?item.responses.full_name.trim():(typeof item.responses?.name==='string'?item.responses.name.trim():'');result.set(item.user_id,name||'Client');}});
  ids.forEach(id=>{if(!result.has(id))result.set(id,'Client');});
  return result;
};
/* Admin-only coaching end dates for the six-month retention process. */
(function initialiseClientRetentionAdmin(){
  const client=window.reframeSupabaseClient;
  const root=document.querySelector("#clientRetentionAdminList");
  const status=document.querySelector("#clientRetentionAdminMessage");
  const refresh=document.querySelector("#refreshClientRetentionAdmin");
  if(!client||!root||!status)return;

  async function load(){
    status.textContent="Loading client accounts and retention dates…";
    root.replaceChildren();
    if(refresh)refresh.disabled=true;
    try{
      const [{data:accessRows,error:accessError},{data:forms,error:formsError},{data:retentionRows,error:retentionError}]=await Promise.all([
        client.from("client_access").select("user_id,status"),
        client.from("client_onboarding").select("user_id,responses,submitted_at").order("submitted_at",{ascending:false}),
        client.rpc("get_client_retention_schedule")
      ]);
      if(accessError)throw accessError;
      if(formsError)throw formsError;
      if(retentionError)throw retentionError;

      const clients=new Map();
      (accessRows||[]).forEach(item=>{
        if(item.user_id&&!clients.has(item.user_id))clients.set(item.user_id,{user_id:item.user_id,status:item.status||"unknown"});
      });
      if(!clients.size){
        status.textContent="No client accounts found yet.";
        return;
      }
      const names=await window.reframeGetClientNames([...clients.keys()]);
      const dates=new Map((retentionRows||[]).map(item=>[item.user_id,item.coaching_ended_at]));
      status.textContent=clients.size+" client account"+(clients.size===1?"":"s")+" found. Only record a date once coaching has actually ended.";

      [...clients.values()].forEach(item=>{
        const row=document.createElement("article");row.className="onboarding-submission";
        const details=document.createElement("div");details.className="submission-details";
        const heading=document.createElement("strong");heading.textContent=names.get(item.user_id)||"Client";
        const meta=document.createElement("small");meta.textContent="Access status: "+item.status;
        const label=document.createElement("label");label.className="submission-answer";
        const title=document.createElement("strong");title.textContent="Actual coaching end date";
        const input=document.createElement("input");input.type="date";
        const existing=dates.get(item.user_id);
        if(existing)input.value=String(existing).slice(0,10);
        const button=document.createElement("button");button.type="button";button.className="admin-save";
        button.textContent=existing?"Update end date":"Record end date";
        const message=document.createElement("p");message.className="admin-status";message.setAttribute("role","status");
        const note=document.createElement("small");note.textContent="The six-month retention period starts from this date. Do not enter a date for a pause or an ongoing programme.";
        button.addEventListener("click",async()=>{
          if(!input.value){message.textContent="Please choose the date coaching actually ended.";return;}
          if(!window.confirm("Record "+input.value+" as the date this client's coaching ended? This starts their six-month retention period."))return;
          button.disabled=true;message.textContent="Saving end date…";
          try{
            const endedAt=new Date(input.value+"T00:00:00.000Z").toISOString();
            const {error:saveError}=await client.rpc("record_client_coaching_end",{
              p_user_id:item.user_id,
              p_coaching_ended_at:endedAt
            });
            if(saveError)throw saveError;
            message.textContent="Coaching end date saved. The six-month retention period is now recorded.";
            button.textContent="Update end date";
            dates.set(item.user_id,endedAt);
          }catch(error){
            console.error("Could not record coaching end date:",error);
            message.textContent="We couldn't save this date. Please check your admin access and try again.";
          }finally{button.disabled=false;}
        });
        label.append(title,input);
        details.append(heading,meta,label,note,button,message);
        row.append(details);root.append(row);
      });
    }catch(error){
      console.error("Could not load client retention dates:",error);
      status.textContent="We couldn't load the retention panel. Please check admin access and the retention database setup.";
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener("click",load);
  window.loadAdminClientRetention=load;
})();

/* Admin control for the point at which a client's personalised programme is ready. */
(function initialiseProgrammeReadiness(){
  const client=window.reframeSupabaseClient;
  const list=document.querySelector("#programmeReadinessList");
  const status=document.querySelector("#programmeReadinessMessage");
  const refresh=document.querySelector("#refreshProgrammeReadiness");
  if(!client||!list||!status)return;
  const labels={personalised_programme:"Personalised Training Programme",coaching_4_week:"Four-Week Coaching",coaching_8_week:"Eight-Week Coaching",coaching_12_week:"Twelve-Week Coaching",coaching_6_month:"Six-Month Ongoing Coaching"};
  async function load(){
    status.textContent="Loading submitted questionnaires…";list.replaceChildren();if(refresh)refresh.disabled=true;
    try{
      const {data:forms,error}=await client.from("client_onboarding")
        .select("purchase_id,user_id,product_key,responses,submitted_at")
        .order("submitted_at",{ascending:false});
      if(error)throw error;
      if(!forms?.length){status.textContent="No submitted questionnaires yet.";return;}
      const ids=[...new Set(forms.map(x=>x.user_id).filter(Boolean))];
      const {data:access,error:accessError}=await client.from("client_access").select("user_id,status").in("user_id",ids);
      if(accessError)throw accessError;
      const active=new Set((access||[]).filter(x=>x.status==="active").map(x=>x.user_id));
      const visible=forms.filter(x=>active.has(x.user_id));
      if(!visible.length){status.textContent="No submitted questionnaires for active client accounts.";return;}
      const displayNames=await window.reframeGetClientNames(ids);
      status.textContent=visible.length+" submitted programme"+(visible.length===1?"":"s")+" to review.";
      for(const item of visible){
        const {data:ready,error:readyError}=await client.from("client_programme_readiness")
          .select("is_ready").eq("purchase_id",item.purchase_id).maybeSingle();
        if(readyError)throw readyError;
        const row=document.createElement("article");row.className="onboarding-submission";
        const details=document.createElement("div");details.className="submission-details";
        const heading=document.createElement("strong");heading.textContent=displayNames.get(item.user_id)||item.responses?.name||"Client";
        const packageName=document.createElement("p");packageName.textContent=labels[item.product_key]||"Reframe Life programme";
        const submitted=document.createElement("small");submitted.textContent="Questionnaire submitted "+new Date(item.submitted_at).toLocaleDateString("en-GB");
        const {data:schedule,error:scheduleError}=await client.from("client_programme_schedules").select("programme_start_date").eq("user_id",item.user_id).maybeSingle();
        if(scheduleError)throw scheduleError;
        if(item.product_key!=="personalised_programme"){
          const startWrap=document.createElement("label");startWrap.className="submission-answer";
          const startTitle=document.createElement("strong");startTitle.textContent="Programme start date";
          const startInput=document.createElement("input");startInput.type="date";startInput.value=schedule?.programme_start_date||"";
          const saveStart=document.createElement("button");saveStart.type="button";saveStart.className="admin-save";saveStart.textContent=schedule?.programme_start_date?"Update start date":"Save start date";
          const startMessage=document.createElement("small");startMessage.setAttribute("role","status");
          saveStart.addEventListener("click",async()=>{
            if(!startInput.value){startMessage.textContent="Please choose the day the client actually begins.";return;}
            saveStart.disabled=true;startMessage.textContent="Saving…";
            try{
              const {error:saveError}=await client.from("client_programme_schedules").upsert({user_id:item.user_id,programme_start_date:startInput.value,updated_at:new Date().toISOString()},{onConflict:"user_id"});
              if(saveError)throw saveError;
              startMessage.textContent="Start date saved. Weekly and four-week timings will use this date.";
              saveStart.textContent="Update start date";
            }catch(error){console.error("Could not save programme start date:",error);startMessage.textContent="We couldn't save the date. Please try again.";}
            finally{saveStart.disabled=false;}
          });
          startWrap.append(startTitle,startInput,saveStart,startMessage);details.append(startWrap);
        }
        const control=document.createElement("label");control.className="admin-publish";
        const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=!!ready?.is_ready;
        const label=document.createElement("span");label.textContent="Programme prepared and shared with client";
        const message=document.createElement("p");message.className="admin-status";message.setAttribute("role","status");
        checkbox.addEventListener("change",async()=>{
          checkbox.disabled=true;message.textContent="Saving…";
          try{
            const {error:saveError}=await client.from("client_programme_readiness").upsert({
              purchase_id:item.purchase_id,user_id:item.user_id,is_ready:checkbox.checked,updated_at:new Date().toISOString()
            },{onConflict:"purchase_id"});
            if(saveError)throw saveError;
            message.textContent=checkbox.checked?"Marked as ready. The client will now see their encouragement message.":"Marked as not yet ready.";
          }catch(error){console.error("Could not update programme readiness:",error);checkbox.checked=!checkbox.checked;message.textContent="We couldn't save that change. Please try again.";}
          finally{checkbox.disabled=false;}
        });
        control.append(checkbox,label);details.append(heading,packageName,submitted,control,message);row.append(details);list.append(row);
      }
    }catch(error){console.error("Could not load programme readiness:",error);status.textContent="We couldn't load programme readiness. Please check administrator access and try again.";}
    finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener("click",load);
  window.loadAdminProgrammeReadiness=load;
})();


/* Build the admin workspace as separate expandable cards. */
(function organiseAdminWorkspace(){
  function build(){
    const panel=document.querySelector("#adminPanel");
    if(!panel || panel.dataset.workspaceOrganised==="true")return;
    const heading=panel.querySelector(".admin-heading");
    if(heading){
      const title=heading.querySelector("h2");
      if(title)title.innerHTML='Your admin <em>workspace.</em>';
      const intro=heading.querySelector(".section-intro");
      if(intro)intro.textContent="Everything you need to look after Reframe Life, gathered into simple sections. Open only what you need.";
    }
    const recipeForm=panel.querySelector("#recipeAdminForm");
    const recipeList=panel.querySelector(".admin-list-wrap:not(.checkin-admin-wrap):not(.progress-review-admin-wrap):not(.programme-readiness-wrap):not(.client-retention-admin-wrap):not(.onboarding-admin-wrap)");
    const groups=[
      {title:"Recipes & resources",nodes:[recipeForm,recipeList]},
      {title:"Weekly client check-ins",selector:".checkin-admin-wrap",button:"Load check-ins"},
      {title:"Four-week progress reviews",selector:".progress-review-admin-wrap",button:"Load reviews"},
      {title:"Programme preparation",selector:".programme-readiness-wrap",button:"Load clients"},
      {title:"Client questionnaires",selector:".onboarding-admin-wrap",button:"Load submissions"},
      {title:"Coaching end dates & data retention",selector:".client-retention-admin-wrap",button:"Load client dates"}
    ];
    groups.forEach((group,index)=>{
      const nodes=(group.nodes||[panel.querySelector(group.selector)]).filter(Boolean);
      if(!nodes.length || nodes.some(node=>node.closest("details.admin-tool-group")))return;
      const anchor=nodes[0];
      const details=document.createElement("details");
      details.className="admin-tool-group";
      details.open=false;
      const summary=document.createElement("summary");
      const label=document.createElement("span");
      label.textContent=group.title;
      const hint=document.createElement("span");
      hint.className="admin-tool-hint";
      hint.textContent="Open section";
      summary.append(label,hint);
      details.append(summary);
      anchor.parentNode.insertBefore(details,anchor);
      nodes.forEach(node=>details.append(node));
      if(group.button){
        const refresh=details.querySelector(".admin-submissions-heading button");
        if(refresh)refresh.textContent=group.button;
      }
    });
    panel.dataset.workspaceOrganised="true";
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",build,{once:true});
  else build();
})();
