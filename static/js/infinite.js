document.addEventListener("DOMContentLoaded",()=>{
  const feed=document.querySelector("#post-feed");
  const sentinel=document.querySelector("#load-more");

  let nextUrl=feed?.dataset.next || "";
  let loading=false;
  let observer=null;

  const createPostView=()=>{
    let view=document.querySelector("#post-view");

    if(!view){
      view=document.createElement("section");
      view.id="post-view";
      view.className="feed wrap";
      view.hidden=true;
      document.querySelector("main")?.appendChild(view);
    }

    return view;
  };

  const closePost=({updateHistory=true}={})=>{
    const view=document.querySelector("#post-view");

    if(view){
      view.hidden=true;
      view.innerHTML="";
    }

    if(feed){
      feed.hidden=false;
    }

    document.body.classList.remove("post-open");

    if(updateHistory && location.pathname !== "/blog/"){
      history.pushState({}, "", "/blog/");
    }

    window.scrollTo({top:0,behavior:"instant"});
  };

  const openPost=async(url,{updateHistory=true}={})=>{
    const view=createPostView();

    view.innerHTML='<div class="post-loading">loading...</div>';
    view.hidden=false;

    if(feed){
      feed.hidden=true;
    }

    document.body.classList.add("post-open");

    try{
      const response=await fetch(url,{headers:{Accept:"text/html"}});

      if(!response.ok){
        throw new Error("post request failed");
      }

      const html=await response.text();
      const doc=new DOMParser().parseFromString(html,"text/html");
      const post=doc.querySelector("#post-reader");

      if(!post){
        throw new Error("post not found");
      }

      view.innerHTML="";
      view.appendChild(post.cloneNode(true));

      if(updateHistory){
        history.pushState({post:url},"",url);
      }

      window.scrollTo({top:0,behavior:"instant"});
    }catch(error){
      view.innerHTML='<div class="post post-reader"><a class="back post-back" href="/blog/">← voltar</a><div class="empty">Unable to load post.</div></div>';
    }
  };

  const handleClick=event=>{
    const link=event.target.closest(".post-title a, .post-back");

    if(!link){
      return;
    }

    const href=link.getAttribute("href");

    if(!href){
      return;
    }

    if(link.classList.contains("post-back") || new URL(href,location.href).pathname === "/blog/"){
      event.preventDefault();
      closePost();
      return;
    }

    if(link.closest("#post-feed") && new URL(href,location.href).origin === location.origin){
      event.preventDefault();
      openPost(new URL(href,location.href).href);
    }
  };

  document.addEventListener("click",handleClick);

  window.addEventListener("popstate",()=>{
    if(location.pathname.startsWith("/blog/posts/")){
      openPost(location.href,{updateHistory:false});
    }else{
      closePost({updateHistory:false});
    }
  });

  if(feed && sentinel){
    const loadNext=async()=>{
      if(!nextUrl || loading){
        return;
      }

      loading=true;

      try{
        const response=await fetch(nextUrl,{headers:{Accept:"text/html"}});

        if(!response.ok){
          throw new Error("pagination failed");
        }

        const html=await response.text();
        const doc=new DOMParser().parseFromString(html,"text/html");
        const nextFeed=doc.querySelector("#post-feed");

        if(!nextFeed){
          throw new Error("feed not found");
        }

        nextFeed.querySelectorAll(".post").forEach(post=>{
          feed.insertBefore(post,sentinel);
        });

        nextUrl=nextFeed.dataset.next || "";

        if(!nextUrl && observer){
          observer.disconnect();
          sentinel.remove();
        }
      }catch(error){
        if(observer){
          observer.disconnect();
        }
      }finally{
        loading=false;
      }
    };

    observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        loadNext();
      }
    },{rootMargin:"900px 0px"});

    observer.observe(sentinel);
  }

  if(location.pathname.startsWith("/blog/posts/")){
    openPost(location.href,{updateHistory:false});
  }
});
