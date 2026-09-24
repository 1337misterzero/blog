import { init } from "https://unpkg.com/@waline/client@v3/dist/waline.js";

document.addEventListener("DOMContentLoaded",()=>{
  const el=document.querySelector("#waline");
  const offline=document.querySelector("#discussion-offline");

  if(!el){
    return;
  }

  const serverURL=el.dataset.server || "";

  if(!serverURL){
    if(offline) offline.hidden=false;
    return;
  }

  if(offline) offline.hidden=true;

  init({
    el,
    serverURL,
    path:el.dataset.path || window.location.pathname,
    lang:"en",
    login:"enable",
    requiredMeta:[],
    pageSize:10,
    meta:["nick","mail","link"],
    copyright:false,
    emoji:["https://unpkg.com/@waline/emojis@1.2.0/weibo/index.json"],
    reaction:false
  });
});
