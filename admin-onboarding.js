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
      status.textContent=data.length+" questionnaire submission"+(data.length===1?"":"s")+" found.";
      data.forEach(item=>{
        const details=document.createElement("details");details.className="onboarding-submission";
        const summary=document.createElement("summary");
        const info=document.createElement("div");
        const title=document.createElement("strong");title.textContent=names[item.product_key]||"Client questionnaire";
        const person=document.createElement("small");person.textContent=(item.responses?.name||"Client")+
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
        meta.textContent="Client account ID: "+item.user_id+" · Purchase reference: "+item.purchase_id;
        body.append(meta);details.append(body);list.append(details);
      });
    }catch(error){
      console.error("Could not load client questionnaires:",error);
      status.textContent="We couldn't load the submissions. Please check administrator access and try again.";
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener("click",load);
  window.loadAdminOnboarding=load;
})();