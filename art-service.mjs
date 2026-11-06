import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const jobs=new Map();
function capture(command,args,timeout=12000){return new Promise(resolve=>{const p=spawn(command,args,{stdio:['ignore','pipe','pipe']});let out='';const t=setTimeout(()=>p.kill(),timeout);p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>out+=c);p.on('error',()=>{clearTimeout(t);resolve({ok:false,text:''});});p.on('exit',code=>{clearTimeout(t);resolve({ok:code===0,text:out});});});}
export async function capabilities(root){const [features,login,proof]=await Promise.all([capture('codex',['features','list']),capture('codex',['login','status']),fs.readFile(path.join(root,'imagegen-proof.json'),'utf8').then(JSON.parse).catch(()=>null)]);return {localDrawing:true,codexInstalled:features.ok,codexLoggedIn:login.ok,imageGenerationDetected:features.ok&&/image_generation\s+\S+\s+true/.test(features.text)&&login.ok,imageGenerationVerified:!!proof,proof};}
function python(root,cmd,args){return new Promise((resolve,reject)=>{const p=spawn(process.env.YOUXING_PYTHON||'python3',[path.join(root,'tools/art.py'),cmd,...args],{cwd:root});let out='',err='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.on('error',reject);p.on('exit',code=>{if(code)return reject(Error(err.slice(-1800)||'绘制处理失败'));try{resolve(JSON.parse(out.trim().split('\n').at(-1)));}catch{reject(Error('绘制任务返回格式错误'));}});});}
export function getArtJob(id){const j=jobs.get(id);if(!j)return null;const {child,...safe}=j;return safe;}
export function createArtJob(root,id,mode,lock,requestedTargets=null){const key=randomUUID(),job={id:key,project:id,status:'running',stage:'检查能力',log:['检查 Codex 登录与图像生成功能…'],started:Date.now(),source:mode};jobs.set(key,job);lock.add(id);
 const update=(stage,message)=>{job.stage=stage;if(message)job.log.push(message);};
 (async()=>{try{
  const p=path.join(root,'projects',id),caps=await capabilities(root);const validTargets=['eyes_closed','eyes_half','mouth_a','mouth_a_half','mouth_i','mouth_o','tail','body'];const targets=Array.isArray(requestedTargets)?requestedTargets.filter(t=>validTargets.includes(t)):validTargets;await python(root,'requests',[id]);
  if(mode==='local'||!caps.imageGenerationDetected){update('本地绘制',mode==='local'?'使用本地绘制：闭眼、半闭眼及 A / 半 A / I / O 嘴型。':'没有检测到可用生图入口，自动使用本地绘制与网格变形。');await python(root,'local',[id]);job.source='local-drawing';}
  else{
   update('AI 生成','Codex 已登录且启用 image_generation，正在请求内置生图。图片会发送给已登录的生图服务。');const baseOutput=path.join(p,'generated/ai-output'),output=path.join(baseOutput,key);await fs.mkdir(output,{recursive:true});
   const prompt=(await fs.readFile(path.join(p,'generated/requests/codex-prompt.txt'),'utf8')).replaceAll(baseOutput,output)+'\n本次严格限定只生成这些目标：'+targets.join(', ')+'。忽略前文中其他未列入本次目标的差分和部件；不要额外生成。';
   const result=await new Promise(resolve=>{const child=spawn('codex',['exec','--skip-git-repo-check','--approve-for-me','--json','-C',root,'-'],{cwd:root,stdio:['pipe','pipe','pipe']});job.child=child;const logFile=path.join(p,'generated/codex-generation.jsonl');let lines='',err='';const timer=setTimeout(()=>child.kill(),20*60*1000);child.stdin.end(prompt);let eventBuffer='';child.stdout.on('data',c=>{lines+=c;eventBuffer+=c;fs.appendFile(logFile,c).catch(()=>{});let end;while((end=eventBuffer.indexOf('\n'))>=0){const line=eventBuffer.slice(0,end);eventBuffer=eventBuffer.slice(end+1);try{const event=JSON.parse(line);if(event.type==='item.completed'&&event.item?.type==='agent_message'){const brief=String(event.item.text||'').slice(0,240);if(brief)update('AI 生成',brief);}}catch{}}});child.stderr.on('data',c=>{err+=c;});child.on('error',()=>{clearTimeout(timer);resolve({ok:false,unavailable:true});});child.on('exit',async code=>{clearTimeout(timer);job.child=null;await fs.writeFile(logFile,lines).catch(()=>{});resolve({ok:code===0,unavailable:/IMAGE_GENERATION_UNAVAILABLE/.test(lines),error:err.slice(-500)});});});
   const names=targets.filter(t=>!['tail','body'].includes(t));const found=[];for(const name of names)if(await fs.access(path.join(output,name+'.png')).then(()=>true,()=>false))found.push(name);
   if(found.length||await fs.access(path.join(output,'tail.png')).then(()=>true,()=>false)){update('配准与切图','正在对齐生成图，只导入目标蒙版，保持原图其他像素不变。');await python(root,'import',[id,output]);job.source='imagegen';}
   const missing=names.filter(n=>!found.includes(n));if(missing.length){update('本地补绘',`AI 未完成 ${missing.join('、')}，自动使用本地绘制补齐；原始日志保留在工程中。`);await python(root,'local',[id,JSON.stringify(missing)]);job.source=found.length?'mixed':'local-drawing';}
   if(!found.length&&!result.ok)job.log.push('当前 CLI 没有完成生图，已完成本地方案。会话内生图成功与 CLI 实际执行结果分别记录。');
  }
  update('完成','已生成差分、重新切图并更新绑定，可在工作台预览眨眼与说话。');job.status='complete';job.finished=Date.now();
 }catch(e){job.status='failed';update('处理未完成',e.message);}finally{lock.delete(id);}})();return getArtJob(key);
}
