document.addEventListener("DOMContentLoaded",()=>{
  const feed=document.querySelector("#post-feed");
  const sentinel=document.querySelector("#load-more");

  if(!feed || !sentinel) return;

  let nextUrl=feed.dataset.next || "";
  let loading=false;

  const loadNext=async()=>{
    if(!nextUrl || loading) return;

    loading=true;

    try{
      const response=await fetch(nextUrl,{
        headers:{Accept:"text/html"}
      });

      if(!response.ok) throw new Error("pagination failed");

      const html=await response.text();
      const doc=new DOMParser().parseFromString(html,"text/html");

      const nextFeed=doc.querySelector("#post-feed");
      if(!nextFeed) throw new Error("feed not found");

      nextFeed.querySelectorAll(".post").forEach(post=>{
        feed.insertBefore(post,sentinel);
      });

      nextUrl=nextFeed.dataset.next || "";

      if(!nextUrl){
        observer.disconnect();
        sentinel.remove();
      }
    }catch(error){
      observer.disconnect();
    }finally{
      loading=false;
    }
  };

  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)) loadNext();
  },{
    rootMargin:"900px 0px"
  });

  observer.observe(sentinel);
});