/* Admin-only coaching end-date and six-month retention tracker. */
(function(){
 const db=window.reframeSupabaseClient,root=document.getElementById("clientRetentionAdminList"),message=document.getElementById("clientRetentionAdminMessage"),refresh=document.getElementById("refreshClientRetentionAdmin");
 if(!db||!root||!message)return;
 const isoDate=v=>{if(!v)return "";const d=new Date(v);return [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,"0"),String(d.getUTCDate()).padStart(2,"0")].join("-");};
 const showDate=v=>new Date(v+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
 const plusSix=v=>{const [y,m,d]=v.split("-").map(Number),n=m-1+6,yy=y+Math.floor(n/12),mm=n%12+1,last=new Date(Date.UTC(yy,mm,0)).getUTCDate();return [yy,String(mm).padStart(2,"0"),String(Math.min(d,last)).padStart(2,"0")].join("-");};
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
 async function load(){
  if(refresh)refresh.disabled=true;message.textContent="Loading coaching end dates…";root.replaceChildren();
  try{
   const [a,s]=await Promise.all([db.from("client_access").select("user_id,status"),db.rpc("get_client_retention_schedule")]);
   if(a.error)throw a.error;if(s.error)throw s.error;
   const accounts=(a.data||[]).filter(x=>x.user_id);if(!accounts.length){message.textContent="There are no client accounts to show yet.";return;}
   const names=await window.reframeGetClientNames(accounts.map(x=>x.user_id)),dates=new Map((s.data||[]).map(x=>[x.user_id,x.coaching_ended_at]));
   message.textContent="Record the actual coaching end date. The six-month secure-deletion due date is calculated automatically.";
   accounts.map(x=>({id:x.user_id,name:names.get(x.user_id)||"Client",status:x.status||"unknown",ended:dates.get(x.user_id)||""})).sort((x,y)=>x.name.localeCompare(y.name)).forEach(c=>{
    const card=el("details","onboarding-submission retention-client-card"),summary=el("summary"),info=el("div");
    info.append(el("strong","",c.name),el("small","",String(c.status).replace(/_/g," ")));
    const tag=el("small","",c.ended?"END DATE RECORDED":"RECORD END DATE");summary.append(info,tag);card.append(summary);
    const body=el("div","submission-body"),form=el("form","retention-date-form"),label=el("label","","Actual coaching end date"),input=el("input");
    input.type="date";input.required=true;input.max=isoDate(new Date().toISOString());input.value=isoDate(c.ended);label.append(input);
    const due=el("p","retention-due-date"),feedback=el("p","admin-status"),save=el("button","admin-save","Save end date");save.type="submit";
    const updateDue=()=>due.textContent=input.value?"Six-month secure deletion date: "+showDate(plusSix(input.value)):"Choose the date coaching actually ended to calculate the six-month date.";
    updateDue();input.addEventListener("change",updateDue);form.append(label,due,save,feedback);
    if(c.ended)body.append(el("p","retention-saved-date","Coaching ended: "+showDate(isoDate(c.ended))+" · Secure deletion due: "+showDate(plusSix(isoDate(c.ended)))));
    form.addEventListener("submit",async e=>{e.preventDefault();if(!input.value)return;save.disabled=true;feedback.textContent="Saving…";
     const {error}=await db.rpc("record_client_coaching_end",{p_user_id:c.id,p_coaching_ended_at:input.value+"T00:00:00Z"});
     if(error){console.error("Could not save coaching end date:",error);feedback.textContent="We couldn't save this date. Please refresh and try again.";save.disabled=false;return;}
     c.ended=input.value+"T00:00:00Z";tag.textContent="END DATE RECORDED";feedback.textContent="Saved. Secure deletion due: "+showDate(plusSix(input.value))+".";save.disabled=false;
    });
    body.append(form);card.append(body);root.append(card);
   });
  }catch(e){console.error("Could not load client retention dates:",e);message.textContent="The retention tracker couldn't load. Its database setup may still need to be applied in Supabase.";}
  finally{if(refresh)refresh.disabled=false;}
 }
 refresh?.addEventListener("click",load);window.loadClientRetentionAdmin=load;
})();
