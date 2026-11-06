import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {validateRig} from './validation.mjs';
import {capabilities,createArtJob,getArtJob} from './art-service.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url)), PROJECTS=path.join(ROOT,'projects');
const PORT=Number(process.env.YOUXING_PORT||8796), MAX=48*1024*1024;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.wasm':'application/wasm','.ttf':'font/ttf','.svg':'image/svg+xml'};
const locks=new Set();
function project(id){if(!/^[a-zA-Z0-9_-]{1,90}$/.test(id))throw Error('工程编号无效');return path.join(PROJECTS,id);}
async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function atomic(file,data){const tmp=file+'.tmp-'+randomUUID();await fs.writeFile(tmp,JSON.stringify(data,null,2));await fs.rename(tmp,file);}
function python(args,input){if(args[0]==='save'&&input?.rig){const errors=validateRig(input.rig);if(errors.length)return Promise.reject(Error('参数无效：'+errors[0]));}return new Promise((resolve,reject)=>{const p=spawn(process.env.YOUXING_PYTHON||'python3',[path.join(ROOT,'tools/pipeline.py'),...args],{cwd:ROOT});let out='',err='';const timer=setTimeout(()=>p.kill(),180000);p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('exit',code=>{clearTimeout(timer);if(code!==0)return reject(Error((err||out||'处理超时，请缩小图片后重试').slice(-2000)));try{resolve(JSON.parse(out.trim().split('\n').at(-1)));}catch{resolve({ok:true});}});p.stdin.end(input?JSON.stringify(input):'');});}
function runArt(cmd,args){return new Promise((resolve,reject)=>{const child=spawn(process.env.YOUXING_PYTHON||'python3',[path.join(ROOT,'tools/art.py'),cmd,...args],{cwd:ROOT});let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('exit',n=>{if(n)return reject(Error(err.slice(-1600)));try{resolve(JSON.parse(out.trim().split('\n').at(-1)));}catch{reject(Error('绘制返回无效'));}});});}
async function body(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>MAX)throw Error('文件过大，请使用小于 32 MB 的素材');chunks.push(c);}return Buffer.concat(chunks);}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function serve(res,file){let stat;try{stat=await fs.stat(file);}catch{return send(res,404,{error:'文件不存在'});}if(!stat.isFile())return send(res,404,{error:'文件不存在'});res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Length':stat.size,'X-Content-Type-Options':'nosniff'});res.end(await fs.readFile(file));}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),p=decodeURIComponent(url.pathname);
 if(req.method!=='GET'&&req.headers.origin&&!['http://127.0.0.1:'+PORT,'http://localhost:'+PORT].includes(req.headers.origin))return send(res,403,{error:'只接受本机工作台请求'});
 if(p==='/api/capabilities'&&req.method==='GET')return send(res,200,await capabilities(ROOT));
 const artMatch=p.match(/^\/api\/art-jobs\/([a-z0-9-]+)$/);if(artMatch&&req.method==='GET'){const job=getArtJob(artMatch[1]);return send(res,job?200:404,job||{error:'任务不存在'});}
 const requestMatch=p.match(/^\/api\/projects\/([^/]+)\/art-request$/);if(requestMatch&&req.method==='POST'){const id=requestMatch[1];project(id);const v=await runArt('requests',[id]);return send(res,200,{prompt:await fs.readFile(v.result.prompt,'utf8')});}
 const assetMatch=p.match(/^\/api\/projects\/([^/]+)\/art-import$/);if(assetMatch&&req.method==='POST'){const id=assetMatch[1],dir=project(id);if(locks.has(id))return send(res,409,{error:'工程正在处理'});const input=JSON.parse((await body(req)).toString());if(!['eyes_closed','eyes_half','mouth_a','mouth_a_half','mouth_i','mouth_o','tail','body'].includes(input.target))throw Error('绘制目标无效');const folder=path.join(dir,'generated','import-'+randomUUID());await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,input.target+'.png'),Buffer.from(input.image.split(',')[1],'base64'));locks.add(id);try{return send(res,200,await runArt('import',[id,folder]));}finally{locks.delete(id);}}
 const drawMatch=p.match(/^\/api\/projects\/([^/]+)\/draw$/);if(drawMatch&&req.method==='POST'){const id=drawMatch[1];project(id);if(locks.has(id))return send(res,409,{error:'工程正在处理，请等待完成'});const input=JSON.parse((await body(req)).toString());return send(res,202,createArtJob(ROOT,id,input.mode==='local'?'local':'auto',locks,input.targets));}
 if(p==='/api/projects'&&req.method==='GET'){const items=[];for(const d of await fs.readdir(PROJECTS,{withFileTypes:true})){if(!d.isDirectory())continue;try{const v=await json(path.join(project(d.name),'workspace.json'));items.push({id:d.name,name:v.name,updated:v.updated,ready:v.ready});}catch{}}return send(res,200,items.sort((a,b)=>b.updated-a.updated));}
 if(p==='/api/create'&&req.method==='POST'){const input=JSON.parse((await body(req)).toString());const id='avatar-'+randomUUID().slice(0,8);await python(['create',id],input);return send(res,201,{id,...await json(path.join(project(id),'workspace.json'))});}
 if(p==='/api/import'&&req.method==='POST'){const id='avatar-'+randomUUID().slice(0,8);const bytes=await body(req);await fs.mkdir(path.join(ROOT,'exports'),{recursive:true});const file=path.join(ROOT,'exports',randomUUID()+'.zip');try{await fs.writeFile(file,bytes);await python(['import',id,file]);}finally{await fs.rm(file,{force:true});}return send(res,201,{id,...await json(path.join(project(id),'workspace.json'))});}
 const m=p.match(/^\/api\/projects\/([^/]+)(?:\/(save|build|export|record|audio))?$/);
 if(m){const [,id,action]=m,dir=project(id);
  if(!action&&req.method==='GET')return send(res,200,{id,...await json(path.join(dir,'workspace.json')),hasAudio:await fs.access(path.join(dir,'voice.wav')).then(()=>true,()=>false),rig:await json(path.join(dir,'rig.json')),meta:await json(path.join(dir,'built/layers.json')).catch(()=>null),sprites:await json(path.join(dir,'built/sprites/sprites.json')).catch(()=>null)});
  if(['save','build'].includes(action)&&req.method==='POST'){
   if(locks.has(id))return send(res,409,{error:'工程正在生成，请稍候'});locks.add(id);
   const restore=path.join(ROOT,'.cache','rebuild-'+randomUUID());let original=null;
   try{const v=JSON.parse((await body(req)).toString());if(action==='build'){await fs.mkdir(restore,{recursive:true});original={};for(const name of ['rig.json','workspace.json','avatar.json'])original[name]=await fs.readFile(path.join(dir,name));await fs.cp(path.join(dir,'built'),path.join(restore,'built'),{recursive:true});original.__backupReady=true;}await python(['save',id],v);if(action==='build')await python(['build',id]);return send(res,200,{ok:true});}
   catch(error){if(original?.__backupReady){delete original.__backupReady;for(const [name,bytes] of Object.entries(original))await fs.writeFile(path.join(dir,name),bytes);await fs.rm(path.join(dir,'built'),{recursive:true,force:true});await fs.rename(path.join(restore,'built'),path.join(dir,'built'));}throw error;}
   finally{await fs.rm(restore,{recursive:true,force:true});locks.delete(id);}
  }
  if(action==='audio'&&req.method==='POST'){const bytes=await body(req);await fs.writeFile(path.join(dir,'voice.input'),bytes);await new Promise((resolve,reject)=>{const c=spawn('ffmpeg',['-v','error','-y','-i',path.join(dir,'voice.input'),'-t','1800','-ac','1','-ar','24000',path.join(dir,'voice.wav')]);let e='';c.stderr.on('data',x=>e+=x);c.on('error',reject);c.on('exit',n=>n?reject(Error('无法读取音频，请使用 WAV、MP3 或 M4A')):resolve());});await fs.rm(path.join(dir,'voice.input'),{force:true});return send(res,200,{url:'/projects/'+id+'/voice.wav'});}
  if(action==='record'&&req.method==='POST'){const bytes=await body(req);const name=id+'-'+Date.now()+'.webm';await fs.writeFile(path.join(ROOT,'exports',name),bytes);return send(res,200,{url:'/exports/'+name});}
  if(action==='export'&&req.method==='POST'){if(locks.has(id))return send(res,409,{error:'请等待工程生成完成'});locks.add(id);try{const r=await python(['export',id]);return send(res,200,r);}finally{locks.delete(id);}}
 }
 if(req.method==='GET'){
  let base=path.join(ROOT,'public'),rel=p==='/'?'index.html':p.slice(1);
  if(p.startsWith('/projects/')){base=PROJECTS;rel=p.slice(10);}
  if(p.startsWith('/exports/')){base=path.join(ROOT,'exports');rel=p.slice(9);}
  const full=path.resolve(base,rel);if(!full.startsWith(base+path.sep))return send(res,403,{error:'路径不可访问'});return serve(res,full);
 }
 send(res,404,{error:'接口不存在'});
}catch(error){console.error(error.message);send(res,400,{error:error.message});}});
await fs.mkdir(PROJECTS,{recursive:true});await fs.mkdir(path.join(ROOT,'exports'),{recursive:true});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${PORT} 已占用。已有工作台可直接打开 http://127.0.0.1:${PORT}；或设置 YOUXING_PORT 更换端口。`:e.message);process.exitCode=1;});
server.listen(PORT,'127.0.0.1',()=>console.log(`RuiC-2D http://127.0.0.1:${PORT}`));
