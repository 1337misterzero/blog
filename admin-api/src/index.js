const enc = new TextEncoder();

const cors = env => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Vary": "Origin"
});

const reply = (data, status=200, env) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    ...cors(env)
  }
});

function b64(bytes){
  let s="";
  for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s);
}

function ub64(s){
  const bin=atob(s);
  return Uint8Array.from(bin,c=>c.charCodeAt(0));
}

async function sign(value, secret){
  const key=await crypto.subtle.importKey(
    "raw",enc.encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,["sign"]
  );
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(value))));
}

async function session(env){
  const body=b64(enc.encode(JSON.stringify({
    sub:"zero-admin",
    exp:Math.floor(Date.now()/1000)+8*60*60
  })));
  return body+"."+await sign(body,env.ADMIN_SESSION_SECRET);
}

async function auth(request,env){
  const h=request.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer "))return false;
  const token=h.slice(7), parts=token.split(".");
  if(parts.length!==2)return false;
  const [body,sig]=parts;
  if(await sign(body,env.ADMIN_SESSION_SECRET)!==sig)return false;
  try{
    const p=JSON.parse(new TextDecoder().decode(ub64(body)));
    return p.sub==="zero-admin" && p.exp>Math.floor(Date.now()/1000);
  }catch{return false}
}

function githubPath(path){
  return "/repos/1337misterzero/blog/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref=main";
}

async function gh(path,env,options={}){
  const r=await fetch("https://api.github.com"+path,{
    ...options,
    headers:{
      Accept:"application/vnd.github+json",
      Authorization:"Bearer "+env.GITHUB_TOKEN,
      "X-GitHub-Api-Version":"2026-03-10",
      ...(options.headers||{})
    }
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.message||("GitHub API "+r.status));
  return d;
}

function decode(data){
  return new TextDecoder().decode(ub64(String(data.content).replace(/\n/g,"")));
}

function allowed(path){
  return !!path &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !path.includes("\\") &&
    (
      path==="hugo.toml" ||
      /^content\//.test(path) ||
      /^layouts\//.test(path) ||
      /^static\/(css|js|admin)\//.test(path)
    );
}

async function walk(path,env,out){
  const items=await gh(
    "/repos/1337misterzero/blog/contents/"+path+"?ref=main",
    env
  );
  for(const item of items){
    if(item.type==="dir"){
      await walk(item.path,env,out);
    }else if(allowed(item.path) && !/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|svg)$/i.test(item.path)){
      out.push(item.path);
    }
  }
}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});

    const url=new URL(request.url);

    if(url.pathname==="/login" && request.method==="POST"){
      const body=await request.json().catch(()=>({}));
      if(body.password!==env.ADMIN_PASSWORD)return reply({error:"Invalid password."},401,env);
      return reply({ok:true,token:await session(env)},200,env);
    }

    if(!(await auth(request,env)))return reply({error:"Unauthorized."},401,env);

    if(url.pathname==="/api/posts" && request.method==="GET"){
      const items=await gh("/repos/1337misterzero/blog/contents/content/posts?ref=main",env);
      const posts=[];
      for(const item of items.filter(x=>x.type==="file"&&x.name.endsWith(".md"))){
        const file=await gh(githubPath(item.path),env);
        const raw=decode(file);
        const fm=raw.match(/^---\n([\s\S]*?)\n---/);
        const title=fm?.[1]?.match(/^title:\s*["']?(.*?)["']?$/m)?.[1]||item.name.replace(/\.md$/,"");
        const date=fm?.[1]?.match(/^date:\s*(.+)$/m)?.[1]||"";
        posts.push({path:item.path,title,date,sha:file.sha});
      }
      posts.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      return reply({posts},200,env);
    }

    if(url.pathname==="/api/files" && request.method==="GET"){
      const files=["hugo.toml"];
      await walk("content",env,files);
      await walk("layouts",env,files);
      await walk("static/css",env,files);
      await walk("static/js",env,files);
      await walk("static/admin",env,files);
      return reply({files:[...new Set(files)].sort()},200,env);
    }

    if(url.pathname==="/api/file" && request.method==="GET"){
      const path=url.searchParams.get("path")||"";
      if(!allowed(path))return reply({error:"Path not allowed."},400,env);
      const file=await gh(githubPath(path),env);
      return reply({path,sha:file.sha,content:decode(file)},200,env);
    }

    if(url.pathname==="/api/file" && request.method==="PUT"){
      const body=await request.json().catch(()=>({}));
      const path=String(body.path||"");
      if(!allowed(path))return reply({error:"Path not allowed."},400,env);
      if(String(body.content||"").length>1024*1024)return reply({error:"File too large."},413,env);

      let current=null;
      try{current=await gh(githubPath(path),env)}catch{}

      if(current && body.sha && current.sha!==body.sha){
        return reply({error:"File changed on GitHub. Reload before saving."},409,env);
      }

      const content64=b64(enc.encode(String(body.content||"")));
      const result=await gh("/repos/1337misterzero/blog/contents/"+path,{
        ...env,
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          message:String(body.message||"update "+path),
          content:content64,
          sha:current?.sha,
          branch:"main"
        })
      });

      return reply({ok:true,commit:result.commit.sha,sha:result.content.sha,path},200,env);
    }

    if(url.pathname==="/api/file" && request.method==="DELETE"){
      const body=await request.json().catch(()=>({}));
      const path=String(body.path||"");
      if(!allowed(path))return reply({error:"Path not allowed."},400,env);
      const result=await gh("/repos/1337misterzero/blog/contents/"+path,env,{
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          message:String(body.message||"delete "+path),
          sha:String(body.sha||""),
          branch:"main"
        })
      });
      return reply({ok:true,commit:result.commit.sha},200,env);
    }

    return reply({error:"Not found."},404,env);
  }
};
