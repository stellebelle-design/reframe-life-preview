/* Admin-only business snapshot. Uses the same protected Supabase client as the admin workspace. */
(function(){
 const db=window.reframeSupabaseClient;
 const root=document.querySelector("#adminOverview");
 const grid=document.querySelector("#adminOverviewGrid");
 const refresh=document.querySelector("#refreshAdminOverview");
 const updated=document.querySelector("#adminOverviewUpdated");
 if(!db||!root||!grid)return;
 const today=()=>{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
 };
 const cards=[
  {key:"active",label:"Active clients",hint:"Clients with active hub access",href:"#adminCoachingOverview"},
  {key:"new",label:"New questionnaires",hint:"Submitted in the last 30 days",href:"#adminQuestionnaires"},
  {key:"prep",label:"Programmes to prepare",hint:"Questionnaires not yet marked ready",href:"#adminProgrammeReadiness"},
  {key:"reviews",label:"Reviews awaiting you",hint:"Client reflections ready to read",href:"#adminProgressReviews"},
  {key:"checkins",label:"Check-ins awaiting feedback",hint:"Weekly check-ins needing your reply",href:"#adminWeeklyCheckins"},
  {key:"tasks",label:"Open tasks",hint:"Everything still on your to-do list",href:"#adminTaskCentre"}
 ];
 function render(values){
  grid.replaceChildren();
  cards.forEach(item=>{
   const a=document.createElement("a");a.className="admin-overview-card";a.href=item.href;
   const value=document.createElement("strong");value.textContent=values[item.key]??"—";
   const label=document.createElement("span");label.textContent=item.label;
   const hint=document.createElement("small");hint.textContent=item.hint;
   a.append(value,label,hint);grid.append(a);
  });
 }
 async function load(){
  refresh.disabled=true;refresh.textContent="Refreshing…";
  grid.replaceChildren();
  const loading=document.createElement("p");loading.className="admin-status";loading.textContent="Updating your overview…";grid.append(loading);
  try{
   const queries=await Promise.all([
    db.from("client_access").select("user_id").eq("status","active"),
    db.from("client_onboarding").select("purchase_id,submitted_at"),
    db.from("client_programme_readiness").select("purchase_id,is_ready"),
    db.from("client_progress_reviews").select("user_id,period_start,reflection_reviewed_at"),
    db.from("client_progress_reflections").select("user_id,period_start"),
    db.from("client_checkins").select("id,coach_feedback"),
    db.from("admin_tasks").select("id,status").eq("status","open")
   ]);
   const [active,onboarding,readiness,reviews,reflections,checkins,tasks]=queries;
   const errors=queries.filter(q=>q.error);
   const values={};
   if(!active.error)values.active=active.data?.length||0;
   if(!onboarding.error){
    const cutoff=Date.now()-30*86400000;
    values.new=(onboarding.data||[]).filter(x=>x.submitted_at&&new Date(x.submitted_at).getTime()>=cutoff).length;
   }
   if(!onboarding.error&&!readiness.error){
    const ready=new Set((readiness.data||[]).filter(x=>x.is_ready).map(x=>x.purchase_id));
    values.prep=(onboarding.data||[]).filter(x=>!ready.has(x.purchase_id)).length;
   }
   if(!reviews.error&&!reflections.error){
    const reviewed=new Set((reviews.data||[]).filter(x=>x.reflection_reviewed_at).map(x=>x.user_id+":"+x.period_start));
    values.reviews=(reflections.data||[]).filter(x=>!reviewed.has(x.user_id+":"+x.period_start)).length;
   }
   if(!checkins.error)values.checkins=(checkins.data||[]).filter(x=>!String(x.coach_feedback||"").trim()).length;
   if(!tasks.error)values.tasks=tasks.data?.length||0;
   render(values);
   if(errors.length){
    updated.textContent="Some figures couldn't be refreshed. Please try again; unavailable figures are shown as —.";
   }else{
    updated.textContent="Updated "+new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})+". Select any card to jump to that section.";
   }
  }catch(error){
   console.error("Could not load admin overview:",error);
   grid.replaceChildren();
   const message=document.createElement("p");message.className="admin-status";message.textContent="We couldn't load the overview just now. Please refresh and try again.";grid.append(message);
   updated.textContent="";
  }finally{refresh.disabled=false;refresh.textContent="Refresh overview";}
 }
 refresh.addEventListener("click",load);
 window.loadAdminOverview=load;
})();