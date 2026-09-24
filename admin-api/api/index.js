const crypto = require("crypto");

const REPO = "1337misterzero/blog";
const BRANCH = "main";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin"
  };
}

function send(res, status, data, publicOrigin) {
  res.status(status);
  for (const [k,v] of Object.entries({
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    ...cors(publicOrigin || "")
  })) res.setHeader(k,v);
  res.end(JSON.stringify(data));
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function tokenFor(exp) {
  const body = b64url(JSON.stringify({sub:"zero-admin",exp}));
  const sig = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(body).digest("base64url");
  return body+"."+sig;
}

function validToken(token) {
  if (!token?.startsWith("Bearer ")) return false;
  const raw=token.slice(7);
  const parts=raw.split(".");
  if(parts.length!==2)return false;
  const [body,sig]=parts;
  const expected=crypto.createHmac("sha256",process.env.ADMIN_SESSION_SECRET).update(body).digest("base64url");
  if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;
  try{
    const p=JSON.parse(Buffer.from(body,"base64url").toString());
    return p.sub==="zero-admin" && p.exp>Math.floor(Date.now()/1000);
  }catch{return false}
}

function allowed(path) {
  if(!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  return path==="hugo.toml" || /^(content|layouts)\//.test(path) || /^static\/(css|js|admin)\//.test(path);
}

function ghHeaders() {
  return {
    "Accept":"application/vnd.github+json",
    "Authorization":"Bearer "+process.env.GITHUB_TOKEN,
    "X-GitHub-Api-Version":"2026-03-10"
  };
}

async function gh(path, init={}) {
  const r=await fetch("https://api.github.com"+path,{
    ...init,
    headers:{...ghHeaders(),...(init.headers||{})}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.message||("GitHub API "+r.status));
  return data;
}

function decodeGitHubContent(content) {
  return Buffer.from(String(content).replace(/\n/g,""),"base64").toString("utf8");
}

function encodeGitHubContent(content) {
  return Buffer.from(content,"utf8").toString("base64");
}

async function handle(req,res) {
  const origin=req.headers.origin || "";
  if(origin && origin!==process.env.ALLOWED_ORIGIN){
    return send(res,403,{error:"Origin not allowed."},process.env.ALLOWED_ORIGIN);
  }
  const publicOrigin=process.env.ALLOWED_ORIGIN;
  if(req.method==="OPTIONS"){
    res.status(204);
    for(const [k,v] of Object.entries(cors(origin)))res.setHeader(k,v);
    return res.end();
  }

  const url=new URL(req.url,"https://admin.invalid");
  const route=url.searchParams.get("route") || url.pathname;

  if(route==="/login" && req.method==="POST"){
    if(req.body?.password!==process.env.ADMIN_PASSWORD)return send(res,401,{error:"Invalid password."},publicOrigin);
    return send(res,200,{ok:true,token:tokenFor(Math.floor(Date.now()/1000)+8*60*60)},publicOrigin);
  }

  if(!validToken(req.headers.authorization))return send(res,401,{error:"Unauthorized."},publicOrigin);

  if(route==="/api/posts" && req.method==="GET"){
    const items=await gh("/repos/"+REPO+"/contents/content/posts?ref="+BRANCH);
    const posts=[];
    for(const item of items.filter(x=>x.type==="file"&&x.name.endsWith(".md"))){
      const file=await gh("/repos/"+REPO+"/contents/"+item.path+"?ref="+BRANCH);
      const raw=decodeGitHubContent(file.content);
      const fm=raw.match(/^---\n([\s\S]*?)\n---/);
      const block=fm?.[1]||"";
      const title=(block.match(/^title:\s*["']?(.*?)["']?$/m)||[])[1]||item.name.replace(/\.md$/,"");
      const date=(block.match(/^date:\s*(.+)$/m)||[])[1]||"";
      posts.push({path:item.path,title,date,sha:file.sha});
    }
    posts.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return send(res,200,{posts},publicOrigin);
  }

  if(route==="/api/files" && req.method==="GET"){
    const files=["hugo.toml"];
    const walk=async path=>{
      const items=await gh("/repos/"+REPO+"/contents/"+path+"?ref="+BRANCH);
      for(const item of items){
        if(item.type==="dir") await walk(item.path);
        else if(allowed(item.path)&&!/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|svg)$/i.test(item.path)) files.push(item.path);
      }
    };
    for(const root of ["content","layouts","static/css","static/js","static/admin"])await walk(root);
    return send(res,200,{files:[...new Set(files)].sort()},publicOrigin);
  }

  if(route==="/api/file" && req.method==="GET"){
    const path=url.searchParams.get("path")||"";
    if(!allowed(path))return send(res,400,{error:"Path not allowed."},publicOrigin);
    const file=await gh("/repos/"+REPO+"/contents/"+path+"?ref="+BRANCH);
    return send(res,200,{path:file.path,sha:file.sha,content:decodeGitHubContent(file.content)},publicOrigin);
  }

  if(route==="/api/file" && req.method==="PUT"){
    const body=req.body||{};
    const path=String(body.path||"");
    const content=String(body.content??"");
    if(!allowed(path))return send(res,400,{error:"Path not allowed."},publicOrigin);
    if(Buffer.byteLength(content,"utf8")>1024*1024)return send(res,413,{error:"File too large."},publicOrigin);

    let current=null;
    try{current=await gh("/repos/"+REPO+"/contents/"+path+"?ref="+BRANCH)}catch{}
    if(current && body.sha && current.sha!==body.sha)return send(res,409,{error:"File changed on GitHub. Reload before saving."},publicOrigin);

    const result=await gh("/repos/"+REPO+"/contents/"+path,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        message:String(body.message||"update "+path),
        content:encodeGitHubContent(content),
        sha:current?.sha,
        branch:BRANCH
      })
    });
    return send(res,200,{ok:true,commit:result.commit.sha,sha:result.content.sha,path},publicOrigin);
  }

  if(route==="/api/file" && req.method==="DELETE"){
    const body=req.body||{};
    const path=String(body.path||"");
    if(!allowed(path)||!body.sha)return send(res,400,{error:"Invalid path or SHA."},publicOrigin);
    const result=await gh("/repos/"+REPO+"/contents/"+path,{
      method:"DELETE",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        message:String(body.message||"delete "+path),
        sha:String(body.sha),
        branch:BRANCH
      })
    });
    return send(res,200,{ok:true,commit:result.commit.sha},publicOrigin);
  }

  return send(res,404,{error:"Not found."},publicOrigin);
}

module.exports = async (req,res)=>{
  try { await handle(req,res); }
  catch (e) {
    const publicOrigin=process.env.ALLOWED_ORIGIN || "";
    return send(res,500,{error:e.message||"Internal error."},publicOrigin);
  }
};
