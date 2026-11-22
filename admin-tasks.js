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
  const actions=el("div","admin-task-actions");const edit=el("button",null,"Edit");edit.type="button";edit.addEventListener("click",()=>openEditor(task));
  const remove=el("button",null,"Delete");remove.type="button";remove.addEventListener("click",async()=>{if(!confirm("Delete this task?"))return;const {error}=await db.from("admin_tasks").delete().eq("id",task.id);if(error){status.textContent="Couldn't delete this task. Please try again.";return;}await load();});
  actions.append(edit,remove);row.append(check,main,actions);return row;
 }
 async function updateStatus(task,next){
  const patch={status:next,completed_at:next==="completed"?new Date().toISOString():null,updated_at:new Date().toISOString()};
  const {error}=await db.from("admin_tasks").update(patch).eq("id",task.id);
  if(error){status.textContent="Couldn't update that task. Please refresh and try again.";await load();return;}await load();
 }
 async function load(){
  status.textContent="";root.replaceChildren();completedRoot.replaceChildren();summary.textContent="Loading your tasks…";
  try{
   const {data,error}=await db.from("admin_tasks").select("id,task_type,title,category,details,user_id,due_date,status,created_at,completed_at").order("created_at",{ascending:false});
   if(error)throw error;
   const tasks=data||[],open=tasks.filter(x=>x.status==="open"),done=tasks.filter(x=>x.status==="completed");
   open.sort((a,b)=>(a.due_date||"9999").localeCompare(b.due_date||"9999")||b.created_at.localeCompare(a.created_at));
   done.sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||""));
   summary.textContent=open.length?open.length+" task"+(open.length===1?"":"s")+" to do"+(open.some(x=>x.due_date&&x.due_date<today())?" · includes overdue tasks":""):"You're all caught up — no outstanding tasks.";
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
 window.loadAdminTasks=async()=>{await loadClients();await load();};
})();
