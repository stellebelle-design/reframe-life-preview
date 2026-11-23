/* Central admin task centre. All task access is independently protected by Supabase RLS. */
(function(){
 const db=window.reframeSupabaseClient,root=document.querySelector("#adminTaskList"),completedRoot=document.querySelector("#adminCompletedTaskList");
 const summary=document.querySelector("#adminTaskSummary"),status=document.querySelector("#adminTaskMessage"),dialog=document.querySelector("#adminTaskDialog"),form=document.querySelector("#adminTaskForm");
 if(!db||!root||!dialog||!form)return;
 const $=id=>document.getElementById(id);
 const clientSelect=$("adminTaskClient"),titleInput=$("adminTaskTitle"),categoryInput=$("adminTaskCategory"),dueInput=$("adminTaskDue"),detailsInput=$("adminTaskDetails"),idInput=$("adminTaskId"),save=$("saveAdminTask");
 let clientNames=new Map();
 const dateLabel=value=>value?new Date(value+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"No due date";
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
 async function loadClients(){
  const {data,error}=await db.from("client_access").select("user_id,status").eq("status","active");
  if(error)throw error;
  clientNames=await window.reframeGetClientNames((data||[]).map(x=>x.user_id));
  clientSelect.replaceChildren(new Option("General task — no client",""));
  [...clientNames.entries()].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([id,name])=>clientSelect.add(new Option(name,id)));
 }
 function openEditor(task){
  form.reset();idInput.value=task?.id||"";titleInput.value=task?.title||"";categoryInput.value=task?.category||"Other";
  clientSelect.value=task?.user_id||"";dueInput.value=task?.due_date||"";detailsInput.value=task?.details||"";
  $("adminTaskDialogTitle").textContent=task?"Edit task":"Add a task";$("adminTaskFormMessage").textContent="";
  if(!dialog.open)dialog.showModal();titleInput.focus();
 }
 function renderTask(task,done=false){
  const row=el("article","admin-task-row"+(done?" is-completed":""));row.dataset.overdue=!done&&task.due_date&&task.due_date<today()?"true":"false";
  const check=el("input","admin-task-check");check.type="checkbox";check.checked=done;check.setAttribute("aria-label",done?"Reopen task":"Mark task complete");
  check.addEventListener("change",()=>updateStatus(task,check.checked?"completed":"open"));
  const main=el("div","admin-task-main");main.append(el("strong",null,task.title));
  const meta=el("div","admin-task-meta");meta.append(el("span",null,task.category||"Task"),el("span",null,task.user_id?(clientNames.get(task.user_id)||"Client"):"General"));
  const due=el("span",!done&&task.due_date&&task.due_date<today()?"admin-task-due-overdue":"",task.due_date?(task.due_date<today()&&!done?"Overdue · ":"Due · ")+dateLabel(task.due_date):"No due date");meta.append(due);main.append(meta);
  if(task.details)main.append(el("p","admin-task-notes",task.details));
  const actions=el("div","admin-task-actions");
  if(task.category==="Progress review"){
   const openReview=el("button",null,"Open review");openReview.type="button";
   openReview.addEventListener("click",async()=>{
    openReview.disabled=true;openReview.textContent="Opening…";
    try{
     if(typeof window.openAdminProgressReviewForTask!=="function")throw new Error("The review workspace is not available.");
     await window.openAdminProgressReviewForTask(task.source_key,task.user_id);
    }catch(error){console.error("Could not open progress review from task:",error);status.textContent="Couldn't open the progress review. Open Four-week progress reviews below instead.";}
    finally{openReview.disabled=false;openReview.textContent="Open review";}
   });
   actions.append(openReview);
  }
  const edit=el("button",null,"Edit");edit.type="button";edit.addEventListener("click",()=>openEditor(task));
  const remove=el("button",null,"Delete");remove.type="button";remove.addEventListener("click",async()=>{if(!confirm("Delete this task?"))return;const {error}=await db.from("admin_tasks").delete().eq("id",task.id);if(error){status.textContent="Couldn't delete this task. Please try again.";return;}await load();});
  actions.append(edit,remove);row.append(check,main,actions);return row;
 }
 async function updateStatus(task,next){
  if(task.task_type==="workflow"&&task.source_key?.startsWith("communication:")){
   const communicationId=task.source_key.slice("communication:".length);
   const {error:communicationError}=await db.from("client_communication_tasks").update({status:next==="completed"?"sent":"pending",sent_at:next==="completed"?new Date().toISOString():null}).eq("id",communicationId);
   if(communicationError){status.textContent="Could not update the communication tracker. Please try again.";await load();return;}
  }
  const patch={status:next,completed_at:next==="completed"?new Date().toISOString():null,updated_at:new Date().toISOString()};
  const {error}=await db.from("admin_tasks").update(patch).eq("id",task.id);
  if(error){status.textContent="Couldn't update that task. Please refresh and try again.";await load();return;}await load();
 }
 async function load(){
  status.textContent="";root.replaceChildren();completedRoot.replaceChildren();summary.textContent="Loading your tasks…";
  try{
   const {data,error}=await db.from("admin_tasks").select("id,task_type,source_key,title,category,details,user_id,due_date,status,created_at,completed_at").order("created_at",{ascending:false});
   if(error)throw error;
   const tasks=data||[],open=tasks.filter(x=>x.status==="open"),done=tasks.filter(x=>x.status==="completed");
   open.sort((a,b)=>(a.due_date||"9999").localeCompare(b.due_date||"9999")||b.created_at.localeCompare(a.created_at));
   done.sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||""));
   summary.textContent=open.length?open.length+" task"+(open.length===1?"":"s")+" to do"+(open.some(x=>x.due_date&&x.due_date<today())?" · includes overdue tasks":""):"You're all caught up — no outstanding tasks.";
   const total=tasks.length,percent=total?Math.round((done.length/total)*100):0;
   const progress=$("adminTaskProgress"),progressLabel=$("adminTaskProgressLabel"),progressPercent=$("adminTaskProgressPercent");
   if(progress)progress.value=percent;
   if(progressLabel)progressLabel.textContent=total?done.length+" of "+total+" tasks completed":"Your progress will appear as you add tasks";
   if(progressPercent)progressPercent.textContent=percent+"%";
   if(open.length)open.forEach(x=>root.append(renderTask(x)));else root.append(el("p","communication-empty","Nothing outstanding. Add a task whenever something needs doing."));
   done.forEach(x=>completedRoot.append(renderTask(x,true)));$("adminCompletedCount").textContent="("+done.length+")";
  }catch(error){console.error("Could not load admin tasks:",error);summary.textContent="We couldn't load your tasks. Please check the task-centre database setup and admin access.";}
 }
 $("openAdminTaskEditor").addEventListener("click",()=>openEditor());
 $("closeAdminTaskEditor").addEventListener("click",()=>dialog.close());
 $("cancelAdminTaskEditor").addEventListener("click",()=>dialog.close());
 dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
 form.addEventListener("submit",async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  save.disabled=true;save.textContent="Saving…";$("adminTaskFormMessage").textContent="";
  const payload={title:titleInput.value.trim(),category:categoryInput.value,details:detailsInput.value.trim(),user_id:clientSelect.value||null,due_date:dueInput.value||null,updated_at:new Date().toISOString()};
  try{
   const result=idInput.value?await db.from("admin_tasks").update(payload).eq("id",idInput.value):await db.from("admin_tasks").insert(payload);
   if(result.error)throw result.error;
   dialog.close();await load();
  }catch(error){console.error("Could not save admin task:",error);$("adminTaskFormMessage").textContent="We couldn't save that task. Please try again.";}
  finally{save.disabled=false;save.textContent="Save task";}
 });
 $("adminCompletedCount").textContent="(0)";
 async function syncWorkflowTasks(){
  const todayDate= new Date();
  const todayKey=[todayDate.getFullYear(),String(todayDate.getMonth()+1).padStart(2,"0"),String(todayDate.getDate()).padStart(2,"0")].join("-");
  const {data:forms,error:formsError}=await db.from("client_onboarding").select("id,user_id,purchase_id,product_key,submitted_at");
  if(formsError)throw formsError;
  const {data:readiness,error:readinessError}=await db.from("client_programme_readiness").select("purchase_id,is_ready");
  if(readinessError)throw readinessError;
  const readyPurchases=new Set((readiness||[]).filter(x=>x.is_ready).map(x=>x.purchase_id));
  const desired=new Map();
  (forms||[]).forEach(form=>{
   if(!readyPurchases.has(form.purchase_id)){
    const key="programme-preparation:"+form.id;
    desired.set(key,{source_key:key,title:"Prepare "+(clientNames.get(form.user_id)||"client")+"'s programme",category:"Programme preparation",details:"A client questionnaire has been submitted. Review their answers and prepare their personalised programme.",user_id:form.user_id,due_date:null});
   }
  });

  const {data:access,error:accessError}=await db.from("client_access").select("user_id,status").eq("status","active");
  if(accessError)throw accessError;
  const activeIds=[...new Set((access||[]).map(x=>x.user_id).filter(Boolean))];
  const [{data:schedules,error:scheduleError},{data:reviews,error:reviewError},{data:reflections,error:reflectionError},{data:checkins,error:checkinError}]=await Promise.all([
   db.from("client_programme_schedules").select("user_id,programme_start_date"),
   db.from("client_progress_reviews").select("user_id,period_start,period_end,reflection_reviewed_at"),
   db.from("client_progress_reflections").select("user_id,period_start"),
   db.from("client_checkins").select("id,user_id,week_start,coach_feedback")
  ]);
  if(scheduleError)throw scheduleError;if(reviewError)throw reviewError;if(reflectionError)throw reflectionError;if(checkinError)throw checkinError;

  const dateOnly=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const periodEndFor=start=>{
   const end=new Date(start+"T12:00:00");end.setDate(end.getDate()+27);
   while(end.getDay()!==0)end.setDate(end.getDate()+1);
   return dateOnly(end);
  };
  activeIds.forEach(uid=>{
   const clientReviews=(reviews||[]).filter(x=>x.user_id===uid).sort((a,b)=>b.period_start.localeCompare(a.period_start));
   const latest=clientReviews[0];
   if(latest){
    const reflection=(reflections||[]).find(x=>x.user_id===uid&&x.period_start===latest.period_start);
    if(reflection&&!latest.reflection_reviewed_at){
     const key="progress-reflection:"+uid+":"+latest.period_start;
     desired.set(key,{source_key:key,title:"Review "+(clientNames.get(uid)||"client")+"'s reflection",category:"Progress review",details:"Their four-week reflection has arrived. Read their answers and mark the review as completed in Four-week progress reviews.",user_id:uid,due_date:todayKey});
     return;
    }
    if(!reflection)return; // The client still needs to submit their reflection.
    if(!latest.reflection_reviewed_at)return;
   }
   const start=latest?.period_end?(()=>{const d=new Date(latest.period_end+"T12:00:00");d.setDate(d.getDate()+1);return dateOnly(d);})():(schedules||[]).find(x=>x.user_id===uid)?.programme_start_date;
   if(!start)return;
   const due=periodEndFor(start);
   if(todayKey>=due){
    const hasCheckins=(checkins||[]).some(x=>x.user_id===uid&&x.week_start>=start&&x.week_start<=due);
    const key="progress-review-due:"+uid+":"+start;
    desired.set(key,{source_key:key,title:(hasCheckins?"Prepare ":"Check ")+(clientNames.get(uid)||"client")+"'s four-week review",category:"Progress review",details:hasCheckins?"Weekly check-ins are available for this review period. Prepare and share the four-week progress review.":"The four-week review period has ended. Check in with the client and prepare their progress review.",user_id:uid,due_date:due});
   }
  });

  (checkins||[]).forEach(item=>{
   if(!String(item.coach_feedback||"").trim()){
    const key="weekly-checkin-feedback:"+item.id;
    desired.set(key,{source_key:key,title:"Respond to "+(clientNames.get(item.user_id)||"client")+"'s weekly check-in",category:"Client follow-up",details:"A weekly check-in is waiting for your supportive feedback. Open Weekly client check-ins, review their answers and save your response.",user_id:item.user_id,due_date:todayKey});
   }
  });

  const {data:communications,error:communicationsError}=await db.from("client_communication_tasks").select("id,user_id,communication_type,details,created_at").eq("status","pending");
  if(communicationsError)throw communicationsError;
  (communications||[]).forEach(item=>{
   const key="communication:"+item.id;
   desired.set(key,{source_key:key,title:"Send "+item.communication_type.toLowerCase()+" to "+(clientNames.get(item.user_id)||"client"),category:"Communication",details:item.details||"A client message is waiting to be sent. Mark it as sent once you have sent it.",user_id:item.user_id,due_date:null});
  });

  const {data:existing,error:existingError}=await db.from("admin_tasks").select("id,source_key,status").eq("task_type","workflow");
  if(existingError)throw existingError;
  for(const [key,task] of desired){
   const prior=(existing||[]).find(row=>row.source_key===key);
   if(prior){
    // If the underlying client action is still outstanding, never leave its
    // workflow reminder completed. Reopen it and refresh its details.
    const {error}=await db.from("admin_tasks").update({
     ...task,
     task_type:"workflow",
     status:"open",
     completed_at:null,
     updated_at:new Date().toISOString()
    }).eq("id",prior.id);
    if(error)throw error;
   }else{
    const {error}=await db.from("admin_tasks").insert({...task,task_type:"workflow"});
    if(error)throw error;
   }
  }
  const obsolete=(existing||[]).filter(task=>task.source_key&&!desired.has(task.source_key)&&task.status==="open");
  for(const task of obsolete){
   const {error}=await db.from("admin_tasks").update({status:"completed",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",task.id);
   if(error)throw error;
  }
 }
 window.loadAdminTasks=async()=>{
  await loadClients();
  try{await syncWorkflowTasks();}
  catch(error){console.error("Could not sync workflow tasks:",error);status.textContent="Your saved tasks are available, but automatic workflow reminders could not refresh. Please check the admin task setup."; }
  await load();
 };
})();
