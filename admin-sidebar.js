(function(){
 const toggle=document.getElementById("adminMenuToggle"),menu=document.getElementById("adminSideMenu"),backdrop=document.getElementById("adminMenuBackdrop"),close=document.getElementById("adminMenuClose");
 if(!toggle||!menu||!backdrop||!close)return;
 function openMenu(){menu.classList.add("is-open");menu.setAttribute("aria-hidden","false");menu.removeAttribute("inert");backdrop.hidden=false;toggle.setAttribute("aria-expanded","true");toggle.setAttribute("aria-label","Close workspace menu");close.focus();document.body.style.overflow="hidden";}
 function closeMenu(){menu.classList.remove("is-open");menu.setAttribute("aria-hidden","true");menu.setAttribute("inert","");backdrop.hidden=true;toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-label","Open workspace menu");document.body.style.overflow="";toggle.focus();}
 toggle.addEventListener("click",()=>toggle.getAttribute("aria-expanded")==="true"?closeMenu():openMenu());
 close.addEventListener("click",closeMenu);backdrop.addEventListener("click",closeMenu);
 menu.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeMenu));
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&toggle.getAttribute("aria-expanded")==="true")closeMenu();});
})();