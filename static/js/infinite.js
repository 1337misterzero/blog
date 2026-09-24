document.addEventListener("DOMContentLoaded",()=>{
  const feed=document.querySelector("#post-feed");
  const sentinel=document.querySelector("#load-more");
  if(!feed||!sentinel)return;

  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(entry=>entry.isIntersecting))return;

    const hidden=[...feed.querySelectorAll(".post-hidden")];
    hidden.slice(0,4).forEach((post,index)=>{
      post.classList.remove("post-hidden");
      post.style.animationDelay=(index*55)+"ms";
    });

    if(!feed.querySelector(".post-hidden"))observer.disconnect();
  },{rootMargin:"720px 0px"});

  observer.observe(sentinel);
});