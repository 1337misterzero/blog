document.addEventListener("DOMContentLoaded",()=>{
  const host=document.querySelector(".utterances-host");
  if(!host)return;

  const script=document.createElement("script");
  script.src="https://utteranc.es/client.js";
  script.async=true;
  script.crossOrigin="anonymous";
  script.setAttribute("repo","1337misterzero/blog");
  script.setAttribute("issue-term","pathname");
  script.setAttribute("theme","github-dark");
  host.appendChild(script);
});
