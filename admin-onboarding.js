/* Admin-only viewer for client onboarding submissions.
   Supabase RLS independently restricts this query to verified admin_users. */
(function(){
  const client=window.reframeSupabaseClient;
  const list=document.querySelector("#onboardingAdminList");
  const status=document.querySelector("#onboardingAdminMessage");
  const refresh=document.querySelector("#refreshOnboarding");
  if(!client||!list||!status)return;
  const names={
    personalised_programme:"Personalised Training Programme",
    coaching_4_week:"Four-Week Coaching",
    coaching_8_week:"Eight-Week Coaching",
    coaching_12_week:"Twelve-Week Coaching",
    coaching_6_month:"Six-Month Ongoing Coaching"
  };
  const label=key=>String(key).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  function answerRow(key,value){
    const row=document.createElement("div");row.className="submission-answer";
    const heading=document.createElement("strong");heading.textContent=label(key);
    const answer=document.createElement("span");
    answer.textContent=Array.isArray(value)?value.join(", "):(value===null||value===undefined||value===""?"—":String(value));
    row.append(heading,answer);return row;
  }
  async function load(){
    status.textContent="Loading client questionnaires…";list.replaceChildren();
    if(refresh)refresh.disabled=true;
    try{
      // This loader is only exposed by Client Hub after its own admin_users check succeeds.
      // Avoid repeating a broader admin query here because RLS may only reveal the current admin row.
      const {data,error}=await client.from("client_onboarding")
        .select("id,purchase_id,user_id,product_key,responses,health_responses,health_information_consent,health_information_consented_at,submitted_at")
        .order("submitted_at",{ascending:false});
      if(error)throw error;
      if(!data?.length){status.textContent="No client questionnaires have been submitted yet.";return;}
      const clientNames=await window.reframeGetClientNames(data.map(item=>item.user_id));
      status.textContent=data.length+" questionnaire submission"+(data.length===1?"":"s")+" found.";
      data.forEach(item=>{
        const details=document.createElement("details");details.className="onboarding-submission";
        const summary=document.createElement("summary");
        const info=document.createElement("div");
        const title=document.createElement("strong");title.textContent=names[item.product_key]||"Client questionnaire";
        const person=document.createElement("small");person.textContent=(clientNames.get(item.user_id)||item.responses?.name||"Client")+
          " · "+new Date(item.submitted_at).toLocaleString();
        info.append(title,person);
        const tag=document.createElement("small");tag.textContent="VIEW RESPONSES";
        summary.append(info,tag);details.append(summary);
        const body=document.createElement("div");body.className="submission-details";
        const answers=item.responses&&typeof item.responses==="object"?item.responses:{};
        Object.entries(answers).forEach(([key,value])=>body.append(answerRow(key,value)));
        if(!Object.keys(answers).length){const empty=document.createElement("p");empty.textContent="No general responses recorded.";body.append(empty);}
        const health=document.createElement("section");health.className="submission-health";
        const healthTitle=document.createElement("h4");healthTitle.textContent="Health & injury information";
        const healthText=document.createElement("p");
        const healthDetails=item.health_responses?.details||"No health or injury information provided.";
        healthText.textContent=healthDetails;
        const consent=document.createElement("p");consent.className="submission-meta";
        consent.textContent=item.health_information_consent
          ?"Explicit consent recorded"+(item.health_information_consented_at?" · "+new Date(item.health_information_consented_at).toLocaleString():"")
          :"No health-information consent recorded.";
        health.append(healthTitle,healthText,consent);body.append(health);
        const meta=document.createElement("p");meta.className="submission-meta";
        meta.textContent="Purchase reference: "+item.purchase_id;
        body.append(meta);
        const programmeActions=document.createElement("div");programmeActions.className="admin-actions";
        programmeActions.style.cssText="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px";
        const startProgramme=document.createElement("button");startProgramme.type="button";startProgramme.className="admin-save";
        startProgramme.textContent="Start building their programme";
        const programmeStatus=document.createElement("p");programmeStatus.className="admin-status";
        programmeStatus.setAttribute("role","status");programmeStatus.setAttribute("aria-live","polite");
        startProgramme.addEventListener("click",async()=>{
          startProgramme.disabled=true;startProgramme.textContent="Creating client copy…";programmeStatus.textContent="";
          try{
            const {data:copyData,error:copyError}=await client.functions.invoke("google-drive-oauth",{body:{action:"create-client-copy",onboarding_id:item.id}});
            if(copyError){
              let detail=copyError.message||"The programme copy could not be created.";
              try{const response=copyError.context;if(response&&typeof response.clone==="function"){const payload=await response.clone().text();if(payload.trim())detail=payload;}}catch(_){}
              throw new Error(detail);
            }
            if(copyData?.error)throw new Error(copyData.error);
            if(!copyData?.file?.url)throw new Error("Google created the copy but did not return its link.");
            const link=document.createElement("a");link.href=copyData.file.url;link.target="_blank";link.rel="noopener noreferrer";
            link.textContent="Open "+copyData.file.name;
            programmeStatus.textContent=copyData.existing?"A programme copy already exists for this questionnaire: ":"Your client's separate programme copy is ready: ";
            programmeStatus.append(link);
            startProgramme.textContent="Open programme copy";
            startProgramme.onclick=()=>window.open(copyData.file.url,"_blank","noopener");
          }catch(error){
            console.error("Could not create client programme copy:",error);
            programmeStatus.textContent=error.message||"We couldn't create the client programme copy. Please try again.";
            startProgramme.textContent="Try again";
          }finally{startProgramme.disabled=false;}
        });
        programmeActions.append(startProgramme,programmeStatus);body.append(programmeActions);
        details.append(body);list.append(details);
      });
    }catch(error){
      console.error("Could not load client questionnaires:",error);
      status.textContent="We couldn't load the submissions. Please check administrator access and try again.";
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener("click",load);
  window.loadAdminOnboarding=load;
})();

/* Admin-only weekly check-in viewer. Database RLS controls access independently. */
(function(){
  const client=window.reframeSupabaseClient;
  const list=document.querySelector("#checkinAdminList");
  const status=document.querySelector("#checkinAdminMessage");
  const refresh=document.querySelector("#refreshCheckins");
  if(!client||!list||!status)return;
  async function load(){
    status.textContent="Loading weekly check-ins…";list.replaceChildren();
    if(refresh)refresh.disabled=true;
    try{
      const {data,error}=await client.from("client_checkins")
        .select("id,user_id,week_start,energy,mood,confidence,consistency,wins,support_needed,coach_feedback,created_at")
        .order("week_start",{ascending:false}).limit(100);
      if(error)throw error;
      if(!data?.length){status.textContent="No weekly check-ins have been submitted yet.";return;}
      const clientNames=await window.reframeGetClientNames(data.map(item=>item.user_id));
      status.textContent=data.length+" check-in"+(data.length===1?"":"s")+" found.";
      data.forEach(item=>{
        const details=document.createElement("details");details.className="onboarding-submission";
        const summary=document.createElement("summary");
        const info=document.createElement("div");
        const title=document.createElement("strong");
        const date=new Date(item.week_start+"T12:00:00");
        title.textContent="Week commencing "+date.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
        const person=document.createElement("small");person.textContent=clientNames.get(item.user_id)||"Client";
        info.append(title,person);
        const tag=document.createElement("small");tag.textContent="VIEW CHECK-IN";
        summary.append(info,tag);details.append(summary);
        const body=document.createElement("div");body.className="submission-details";
        const ratings=document.createElement("p");ratings.className="checkin-history-ratings";
        ratings.textContent="Energy: "+item.energy+"/5 · Mood: "+item.mood+"/5 · Confidence: "+item.confidence+"/5 · Consistency: "+item.consistency+"/5";
        body.append(ratings);
        const addAnswer=(heading,value)=>{
          const p=document.createElement("p");p.className="checkin-admin-answer";
          const strong=document.createElement("strong");strong.textContent=heading+": ";
          p.append(strong,document.createTextNode(value||"Not provided"));body.append(p);
        };
        addAnswer("Proud of this week",item.wins);
        addAnswer("Support requested",item.support_needed);
        const feedbackLabel=document.createElement("label");feedbackLabel.className="checkin-feedback-label";
        feedbackLabel.textContent="Your feedback for this client";
        const feedbackInput=document.createElement("textarea");feedbackInput.rows=4;feedbackInput.maxLength=3000;
        feedbackInput.value=item.coach_feedback||"";
        feedbackInput.placeholder="Write supportive, personal feedback and guidance…";
        const save=document.createElement("button");save.type="button";save.className="admin-save";save.textContent="Save feedback";
        const feedbackStatus=document.createElement("p");feedbackStatus.className="admin-status";feedbackStatus.setAttribute("role","status");
        save.addEventListener("click",async()=>{
          save.disabled=true;save.textContent="Saving…";feedbackStatus.textContent="";
          try{
            const {error:updateError}=await client.from("client_checkins")
              .update({coach_feedback:feedbackInput.value.trim(),feedback_updated_at:new Date().toISOString()})
              .eq("id",item.id);
            if(updateError)throw updateError;
            feedbackStatus.textContent="Feedback saved. The client can now see it in their Client Hub.";
            save.textContent="Update feedback";
          }catch(error){
            console.error("Could not save coach feedback:",error);
            feedbackStatus.textContent="We could not save this feedback. Please try again.";
            save.textContent="Save feedback";
          }finally{save.disabled=false;}
        });
        body.append(feedbackLabel,feedbackInput,save,feedbackStatus);
        details.append(body);list.append(details);
      });
    }catch(error){
      console.error("Could not load weekly check-ins:",error);
      status.textContent="We couldn't load check-ins. Please check the table and administrator permissions.";
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener("click",load);
  window.loadAdminCheckins=load;
})();

/* Four-week progress reviews: admin editor, with client visibility protected by database RLS. */
(function(){
 const client=window.reframeSupabaseClient,root=document.querySelector("#progressReviewAdmin"),status=document.querySelector("#progressReviewAdminMessage"),refresh=document.querySelector("#refreshProgressReviews");
 if(!client||!root||!status)return;
 let checkins=[];
 const dateOnly=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
 const displayDate=s=>new Date(s+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
 const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
 async function load(){
  status.textContent="Loading clients and recent check-ins…";root.replaceChildren();if(refresh)refresh.disabled=true;
  try{
   const {data,error}=await client.from("client_checkins").select("user_id,week_start,energy,mood,confidence,consistency,wins,support_needed").order("week_start",{ascending:false}).limit(500);
   if(error)throw error;checkins=data||[];
   const {data:accessRows,error:accessError}=await client.from("client_access").select("user_id,status").eq("status","active");
   if(accessError)throw accessError;
   const {data:reviewRows,error:reviewsError}=await client.from("client_progress_reviews").select("user_id,period_start,period_end").order("period_start",{ascending:false});
   if(reviewsError)throw reviewsError;
   const {data:scheduleRows,error:scheduleError}=await client.from("client_programme_schedules").select("user_id,programme_start_date");
   if(scheduleError)throw scheduleError;
   const {data:reflectionRows,error:reflectionError}=await client.from("client_progress_reflections").select("user_id,period_start,what_went_well,proud_of,challenging,next_focus,updated_at");
   if(reflectionError)throw reflectionError;
   const ids=[...new Set([...checkins.map(x=>x.user_id),...(accessRows||[]).map(x=>x.user_id),...(reviewRows||[]).map(x=>x.user_id),...(scheduleRows||[]).map(x=>x.user_id)].filter(Boolean))];
   if(!ids.length){status.textContent="No client accounts found yet.";return;}
   const clientNames=await window.reframeGetClientNames(ids);
   status.textContent=ids.length+" client account"+(ids.length===1?"":"s")+" available.";
   const controls=make("div","progress-review-controls");const clientLabel=make("label",null,"Choose client");const select=make("select");
   ids.forEach(id=>{const option=make("option",null,clientNames.get(id)||"Client");option.value=id;select.append(option);});clientLabel.append(select);
   const periodLabel=make("label",null,"Review period starts");const start=make("input");start.type="date";periodLabel.append(start);controls.append(clientLabel,periodLabel);root.append(controls);
   const panel=make("div");root.append(panel);
   function defaultStart(uid){
    const saved=(reviewRows||[]).filter(x=>x.user_id===uid).sort((a,b)=>b.period_start.localeCompare(a.period_start));
    if(saved.length&&saved[0].period_end){const next=new Date(saved[0].period_end+"T12:00:00");next.setDate(next.getDate()+1);return dateOnly(next);}
    const schedule=(scheduleRows||[]).find(x=>x.user_id===uid);
    return schedule?.programme_start_date||"";
   }
   start.value=defaultStart(select.value);
   async function showClient(){
    const uid=select.value,rows=checkins.filter(x=>x.user_id===uid).slice(0,4);
    if(!start.value)start.value=defaultStart(uid);
    if(!start.value){panel.replaceChildren(make("p","admin-status","Add this client's actual programme start date in the Programme readiness section before creating their first four-week review."));return;}
    const {data:existing,error:reviewError}=await client.from("client_progress_reviews").select("*").eq("user_id",uid).eq("period_start",start.value).maybeSingle();
    if(reviewError)throw reviewError;panel.replaceChildren();
    const savedForClient=(reviewRows||[]).filter(item=>item.user_id===uid).sort((a,b)=>b.period_start.localeCompare(a.period_start));
    const reflection=(reflectionRows||[]).find(item=>item.user_id===uid&&item.period_start===start.value);
    if(reflection){
     const box=make("div","progress-client-reflection-admin");box.append(make("h4",null,"Client’s four-week reflection"));
     [["What went well",reflection.what_went_well],["What they are proud of",reflection.proud_of],["Challenges or support requested",reflection.challenging],["Next focus",reflection.next_focus]].forEach(([label,value])=>{if(value){const p=make("p");p.append(make("strong",null,label+": "),document.createTextNode(value));box.append(p);}});
     if(reflection.updated_at)box.append(make("small",null,"Submitted "+new Date(reflection.updated_at).toLocaleString()));panel.append(box);
    }
    if(savedForClient.length){
     const savedList=make("div","progress-review-saved-list");
     savedList.append(make("h4",null,"Your saved reviews — choose one to edit"));
     savedForClient.forEach(item=>{
      const edit=make("button","admin-save","Edit review · "+displayDate(item.period_start));edit.type="button";
      edit.addEventListener("click",()=>{start.value=item.period_start;showClient().catch(error=>{console.error(error);status.textContent="Couldn’t load this review.";});});
      savedList.append(edit);
     });
     panel.append(savedList);
    }
    const history=make("div","progress-review-checkins");history.append(make("h4",null,"Recent weekly check-ins"));
    if(!rows.length)history.append(make("p",null,"No check-ins found for this client."));
    rows.forEach(item=>{const line=make("div","progress-review-checkin");line.append(make("strong",null,displayDate(item.week_start)+" · "),document.createTextNode("Energy "+item.energy+"/5 · Mood "+item.mood+"/5 · Confidence "+item.confidence+"/5 · Consistency "+item.consistency+"/5"));if(item.wins)line.append(make("p",null,"Proud of: "+item.wins));if(item.support_needed)line.append(make("p",null,"Support wanted: "+item.support_needed));history.append(line);});
    const form=make("form","progress-review-form");const endDate=new Date(start.value+"T12:00:00");endDate.setDate(endDate.getDate()+27);while(endDate.getDay()!==0)endDate.setDate(endDate.getDate()+1);
    const fields=[["progress_summary","Overall progress","What has changed over the last four weeks?"],["wins","Wins and positive changes","Celebrate progress beyond the scales too."],["challenges","Challenges or support needed","What has felt difficult or needs attention?"],["next_goals","Goals for the next four weeks","Agree realistic, meaningful next steps."],["coach_feedback","Your feedback for the client","Write your personal review and encouragement."]];
    const inputs={};fields.forEach(([key,label,placeholder])=>{const wrap=make("label",null,label);const area=make("textarea");area.rows=3;area.maxLength=5000;area.placeholder=placeholder;area.value=existing?.[key]||"";wrap.append(area);form.append(wrap);inputs[key]=area;});
    form.append(make("p","submission-meta","Review period: "+displayDate(start.value)+" – "+displayDate(dateOnly(endDate))));
    const save=make("button","admin-save","Save four-week review");save.type="submit";const msg=make("p",null,"");msg.id="progressReviewSaveMessage";msg.setAttribute("role","status");form.append(save,msg);panel.append(history,form);
    form.addEventListener("submit",async event=>{event.preventDefault();save.disabled=true;save.textContent="Saving…";msg.textContent="";
     try{const payload={user_id:uid,period_start:start.value,period_end:dateOnly(endDate),progress_summary:inputs.progress_summary.value.trim(),wins:inputs.wins.value.trim(),challenges:inputs.challenges.value.trim(),next_goals:inputs.next_goals.value.trim(),coach_feedback:inputs.coach_feedback.value.trim(),updated_at:new Date().toISOString()};
      const {error:saveError}=await client.from("client_progress_reviews").upsert(payload,{onConflict:"user_id,period_start"});if(saveError)throw saveError;msg.textContent="Four-week review saved. The client can now see it in their Client Hub.";save.textContent="Update four-week review";
     }catch(error){console.error("Could not save progress review:",error);msg.textContent="We couldn’t save the review. Please try again.";save.textContent="Save four-week review";}finally{save.disabled=false;}
    });
   }
   select.addEventListener("change",()=>{start.value=defaultStart(select.value);showClient().catch(error=>{console.error(error);status.textContent="Couldn’t load this client’s review.";});});
   start.addEventListener("change",()=>showClient().catch(error=>{console.error(error);status.textContent="Couldn’t load this review period."; }));
   await showClient();
  }catch(error){console.error("Could not load progress review admin:",error);status.textContent="We couldn’t load progress reviews. Please check admin access and try again.";}
  finally{if(refresh)refresh.disabled=false;}
 }
 refresh?.addEventListener("click",load);window.loadAdminProgressReviews=load;
})();
