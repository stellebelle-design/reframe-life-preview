/* Admin-only client communication task tracker. RLS is enforced by Supabase. */
(function initialiseClientCommunications(){
  const client=window.reframeSupabaseClient;
  const status=document.querySelector("#clientCommunicationsMessage");
  const refresh=document.querySelector("#refreshClientCommunications");
  const form=document.querySelector("#clientCommunicationForm");
  const clientSelect=document.querySelector("#communicationClient");
  const typeSelect=document.querySelector("#communicationType");
  const detailsInput=document.querySelector("#communicationDetails");
  const saveButton=document.querySelector("#saveCommunicationTask");
  const formMessage=document.querySelector("#communicationFormMessage");
  if(!client||!status||!form||!clientSelect)return;

  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const dateLabel=value=>value?new Date(value).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):"";
  let clientNames=new Map();

  async function loadClients(){
    const {data,error}=await client.from("client_access").select("user_id,status").order("user_id");
    if(error)throw error;
    const active=(data||[]).filter(item=>item.user_id&&item.status==="active");
    clientNames=await window.reframeGetClientNames(active.map(item=>item.user_id));
    const previous=clientSelect.value;
    clientSelect.replaceChildren(make("option",null,"Choose a client"));
    active.forEach(item=>{
      const option=make("option",null,clientNames.get(item.user_id)||"Client");
      option.value=item.user_id;clientSelect.append(option);
    });
    if(active.some(item=>item.user_id===previous))clientSelect.value=previous;
  }

  function renderTask(item){
    const card=make("article","communication-task");
    const top=make("div","communication-task-top");
    const info=make("div","communication-task-info");
    info.append(make("strong",null,clientNames.get(item.user_id)||"Client"));
    info.append(make("span","communication-task-type",item.communication_type));
    top.append(info,make("span","communication-task-status",item.status==="sent"?"SENT":"TO DO"));
    card.append(top);
    if(item.details)card.append(make("p","communication-task-details",item.details));
    const meta=make("small","communication-task-date",
      item.status==="sent"?"Sent "+dateLabel(item.sent_at):"Added "+dateLabel(item.created_at));
    card.append(meta);
    const actions=make("div","communication-task-actions");
    const toggle=make("button","admin-row-button",item.status==="sent"?"Reopen task":"Mark as sent");
    toggle.type="button";
    toggle.addEventListener("click",async()=>{
      toggle.disabled=true;toggle.textContent="Saving…";
      try{
        const next=item.status==="sent"?"pending":"sent";
        const {error}=await client.from("client_communication_tasks")
          .update({status:next,sent_at:next==="sent"?new Date().toISOString():null})
          .eq("id",item.id);
        if(error)throw error;
        await load();
      }catch(error){
        console.error("Could not update communication task:",error);
        status.textContent="We couldn't update that message. Please try again.";
        toggle.disabled=false;toggle.textContent=item.status==="sent"?"Reopen task":"Mark as sent";
      }
    });
    const remove=make("button","admin-cancel","Delete");
    remove.type="button";
    remove.addEventListener("click",async()=>{
      if(!window.confirm("Delete this communication task?"))return;
      remove.disabled=true;
      try{
        const {error}=await client.from("client_communication_tasks").delete().eq("id",item.id);
        if(error)throw error;
        await load();
      }catch(error){
        console.error("Could not delete communication task:",error);
        status.textContent="We couldn't delete that task. Please try again.";
        remove.disabled=false;
      }
    });
    actions.append(toggle,remove);card.append(actions);
    return card;
  }

  async function load(){
    status.textContent="Refreshing communication summary…";
    if(refresh)refresh.disabled=true;
    try{
      await loadClients();
      const {data,error}=await client.from("client_communication_tasks").select("id,status").order("created_at",{ascending:false});
      if(error)throw error;
      const items=data||[];
      const pending=items.filter(item=>item.status==="pending").length;
      const sent=items.filter(item=>item.status==="sent").length;
      status.textContent=pending+" outstanding message"+(pending===1?"":"s")+" · "+sent+" sent. Outstanding messages appear in My Tasks above.";
    }catch(error){
      console.error("Could not load communication summary:",error);
      status.textContent="We couldn't load the communications summary. Please check the database setup and admin access.";
    }finally{if(refresh)refresh.disabled=false;}
  }

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    formMessage.textContent="";
    if(!clientSelect.value){formMessage.textContent="Please choose a client.";return;}
    saveButton.disabled=true;saveButton.textContent="Adding…";
    try{
      const {error}=await client.from("client_communication_tasks").insert({
        user_id:clientSelect.value,
        communication_type:typeSelect.value,
        details:detailsInput.value.trim()
      });
      if(error)throw error;
      detailsInput.value="";
      formMessage.textContent="Message task added — it will appear in My Tasks above.";
      if(typeof window.loadAdminTasks==="function")await window.loadAdminTasks();
      await load();
    }catch(error){
      console.error("Could not add communication task:",error);
      formMessage.textContent="We couldn't add that task. Please check the database setup and try again.";
    }finally{saveButton.disabled=false;saveButton.textContent="Add to to-do list";}
  });
  window.openAdminCommunicationForTask=async(sourceKey,userId,task)=>{
    const root=document.querySelector("#adminCommunications");
    if(!root)throw new Error("Communications section is unavailable.");
    const group=root.closest("details.admin-tool-group");if(group)group.open=true;
    await loadClients();
    if(userId)clientSelect.value=userId;
    const title=String(task?.title||"");
    const type=[...typeSelect.options].map(option=>option.value).find(value=>title.toLowerCase().includes(value.toLowerCase()));
    if(type)typeSelect.value=type;
    detailsInput.value=task?.details||"";
    root.scrollIntoView({behavior:"smooth",block:"start"});
    detailsInput.focus({preventScroll:true});
  };
  refresh?.addEventListener("click",load);
  window.loadAdminCommunications=load;
})();
