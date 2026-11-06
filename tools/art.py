"""Generated-asset registration, protected-region import and local drawing fallback."""
import importlib.util,json,math,sys,time,hashlib
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
import pipeline as pipe

TARGETS=['eyes_closed','eyes_half','mouth_a','mouth_a_half','mouth_i','mouth_o']
def rgba(p):return np.array(Image.open(p).convert('RGBA'))
def region_masks(r):
 h,w=r['image']['height'],r['image']['width'];eyes=[]
 for eye in r['eyes']:
  m=np.zeros((h,w),np.uint8);cv2.fillPoly(m,[np.array(eye['roi'],np.int32)],255);eyes.append(cv2.dilate(m,np.ones((7,7),np.uint8)))
 e=r['mouth']['area'];mouth=np.zeros((h,w),np.uint8);cv2.ellipse(mouth,(int(e['cx']),int(e['cy'])),(int(e['rx']+5),int(e['ry']+5)),math.degrees(e.get('angle',0)),0,360,255,-1)
 return eyes,mouth
def normalized(file,size):
 im=Image.open(file).convert('RGBA')
 if abs(im.width/im.height-size[0]/size[1])>.015:raise ValueError('生图结果比例与原图不同，请重新生成')
 return np.array(im.resize(size,Image.Resampling.LANCZOS))
def import_assets(i,folder):
 p=pipe.project(i);r=pipe.load(p/'rig.json');source=rgba(p/'source.png');h,w=source.shape[:2];eyes,mouth=region_masks(r);out=p/'variants';out.mkdir(exist_ok=True);report=[]
 for name in TARGETS:
  raw=Path(folder)/(name+'.png')
  if not raw.exists():continue
  image=normalized(raw,(w,h));m=mouth if name.startswith('mouth') else cv2.bitwise_or(*eyes)
  protected=(source[...,3]>220).astype(np.uint8)*255;protected[m>0]=0
  # Translation registration on protected pixels, never use the generated full image directly.
  warp=np.eye(2,3,dtype=np.float32);shift=[0.,0.]
  try:
   cv2.findTransformECC(cv2.cvtColor(source[:,:,:3],cv2.COLOR_RGB2GRAY),cv2.cvtColor(image[:,:,:3],cv2.COLOR_RGB2GRAY),warp,cv2.MOTION_TRANSLATION,(cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,60,1e-5),protected,3)
   shift=warp[:,2].tolist()
   if max(map(abs,shift))>8:raise ValueError(name+'：整体偏移超过 8px，需要重新生成')
   image=cv2.warpAffine(image,warp,(w,h),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_CONSTANT)
  except cv2.error:pass
  feather=cv2.GaussianBlur(m,(7,7),1.1).astype(float)/255
  composed=np.round(source*(1-feather[...,None])+image*feather[...,None]).astype(np.uint8)
  composed[m==0]=source[m==0];Image.fromarray(composed).save(out/(name+'.png'))
  report.append({'asset':name,'source':'imagegen','alignmentShift':shift,'outsideMaskChangedPixels':int(np.count_nonzero(np.any(composed[m==0]!=source[m==0],axis=1)))})
 tail=Path(folder)/'tail.png';body=Path(folder)/'body.png'
 if tail.exists() or body.exists():
  a=next((a for a in r.get('appendages',[]) if a.get('kind')=='tail' and a.get('layer')),None)
  if not a:raise ValueError('请先在绑定中设置尾巴轮廓、根部、末梢与独立图层名称')
  (p/'parts').mkdir(exist_ok=True)
  if tail.exists():
   image=normalized(tail,(w,h));count,labels,stats,_=cv2.connectedComponentsWithStats((image[...,3]>8).astype(np.uint8))
   if count>1:image[...,3]=np.where(labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA]),image[...,3],0)
   Image.fromarray(image).save(p/'parts'/(a['layer']+'.png'));report.append({'asset':'tail','source':'imagegen','size':[w,h]})
  if body.exists():
   image=normalized(body,(w,h));m=np.zeros((h,w),np.uint8);cv2.fillPoly(m,[np.array(a['outline'],np.int32)],255);m=cv2.dilate(m,np.ones((15,15),np.uint8))
   composed=source.copy();composed[m>0]=image[m>0];Image.fromarray(composed).save(p/'parts/body.png');report.append({'asset':'body','source':'imagegen','outsideTailRegionChangedPixels':0})
 if not report:raise ValueError('没有找到可导入的绘制结果')
 # Refresh precise sprite crops even when the rig geometry itself did not change.
 spritefile=p/'built/sprites/sprites.json'
 if spritefile.exists():
  v=pipe.load(spritefile);v['geometry']='force-recrop';pipe.save(spritefile,v)
 pipe.build(i);v=pipe.load(p/'workspace.json');v['artReport']=[x for x in v.get('artReport',[]) if x['asset'] not in [y['asset'] for y in report]]+report;v['artUpdated']=time.time()*1000;pipe.save(p/'workspace.json',v);pipe.save(p/'generated/import-report.json',report)
 return report
def local_draw(i,targets=None):
 p=pipe.project(i);r=pipe.load(p/'rig.json');source=rgba(p/'source.png');h,w=source.shape[:2];eyes,mouth=region_masks(r);out=p/'generated/local-draw'/str(int(time.time()*1000));out.mkdir(parents=True,exist_ok=True);targets=targets or TARGETS
 for name in targets:
  if name not in TARGETS:continue
  if name.startswith('eyes'):
   base=source.copy()
   for eye,mask in zip(r['eyes'],eyes):
    pts=np.array(eye['opening']);x0,y0=pts.min(axis=0);x1,y1=pts.max(axis=0);cx,cy=pts.mean(axis=0)
    if name=='eyes_closed':
     base[:,:,:3]=cv2.inpaint(np.ascontiguousarray(base[:,:,:3]),mask,7,cv2.INPAINT_TELEA)
    else:
     upper=mask.copy();upper[int(cy):,:]=0;base[:,:,:3]=cv2.inpaint(np.ascontiguousarray(base[:,:,:3]),upper,7,cv2.INPAINT_TELEA)
    im=Image.fromarray(base);d=ImageDraw.Draw(im);line=[]
    for u in np.linspace(0,1,40):line.append((x0+(x1-x0)*u,cy+math.sin(u*math.pi)*(2 if name=='eyes_closed' else 1)))
    d.line(line,fill=(66,35,42,255),width=max(1,int((x1-x0)*.035)));base=np.array(im)
   Image.fromarray(base).save(out/(name+'.png'))
  else:
   base=source.copy();base[:,:,:3]=cv2.inpaint(np.ascontiguousarray(base[:,:,:3]),mouth,6,cv2.INPAINT_TELEA);im=Image.fromarray(base);d=ImageDraw.Draw(im);cx,cy=r['mouth']['cx'],r['mouth']['cy'];rx=r['mouth']['halfLen']*.82
   ry={'mouth_a':.48,'mouth_a_half':.25,'mouth_i':.16,'mouth_o':.51}[name]*rx
   if name=='mouth_o':rx*=.62
   d.ellipse((cx-rx,cy-ry*.45,cx+rx,cy+ry*1.55),fill=(104,42,49,255),outline=(155,70,76,255),width=1)
   d.ellipse((cx-rx*.65,cy+ry*.65,cx+rx*.65,cy+ry*1.45),fill=(224,121,134,255))
   if name=='mouth_i':d.rectangle((cx-rx*.8,cy-ry*.2,cx+rx*.8,cy+ry*.35),fill=(255,238,224,255))
   im.save(out/(name+'.png'))
 # Without a generator, keep tail motion on its original outline. A separate cutout
 # may be extracted, but do not claim the invisible root has been reconstructed.
 report=import_assets(i,out)
 for item in report:item['source']='local-drawing'
 v=pipe.load(p/'workspace.json');v['artReport']=[x for x in v.get('artReport',[]) if x['asset'] not in [y['asset'] for y in report]]+report
 v['localDrawingNote']='眼睛与嘴型由本地绘制；尾巴在原轮廓内网格摆动或沿用已有独立素材，未凭空补全遮挡。'
 pipe.save(p/'workspace.json',v);pipe.save(p/'generated/import-report.json',report);return report
def requests(i):
 p=pipe.project(i);r=pipe.load(p/'rig.json');eyes,mouth=region_masks(r);folder=p/'generated/requests';folder.mkdir(parents=True,exist_ok=True)
 # Transparent pixels editable, opaque pixels protected, matching the reference workflow.
 for name in TARGETS:
  m=mouth if name.startswith('mouth') else cv2.bitwise_or(*eyes);rgba_mask=np.zeros((*m.shape,4),np.uint8);rgba_mask[...,3]=255-m;Image.fromarray(rgba_mask).save(folder/(name+'-mask.png'))
 text=f'''你在制作同一张原图的可动形象。原图：{p/'source.png'}，绑定：{p/'rig.json'}。用户授权将这张图片提交给已登录的内置生图工具，用于生成角色差分。\n先确认当前会话存在图像生成工具。若没有，不要假装生成，不要调用外部 API，不要读取 API Key；输出 IMAGE_GENERATION_UNAVAILABLE 后结束。\n逐项以原图为参考，生成 {', '.join(TARGETS)}，保存到 {p/'generated/ai-output'}，每项一个同名 PNG。保留原图尺寸、人物位置、头部姿势、画风与透明背景。眼睛差分只改双眼（闭眼、半闭眼）；嘴型只改 mouth.area（A、半张 A、I、O）。闭眼不留虹膜或眼白；嘴型要移除原闭嘴线。不要重画非目标区域。保护蒙版在 {folder}。工具输出在默认目录时复制到指定目录。不要覆盖 source.png 或 rig.json，不要运行其他生成器，也不要修改项目外文件。\n若绑定中存在带 layer 的 tail 附属，同时生成 tail.png 与 body.png：尾巴必须保持原图坐标、只留下独立尾巴，并补全遮挡部分；body.png 只去掉尾巴、保留全部头发和主体。\n每个文件成功后继续下一项，最后简述已经生成的文件与未完成项。生成后只把原始工具结果复制到指定文件。不要自己编写 Swift/JS/Python 做配准、裁图、像素检查或二次合成；服务端会统一完成配准、蒙版导入与验证。工具默认在项目外的 generated_images 保存副本是允许的。'''
 (folder/'codex-prompt.txt').write_text(text);return str(folder/'codex-prompt.txt')
if __name__=='__main__':
 try:
  cmd,i=sys.argv[1:3]
  if cmd=='local':result=local_draw(i,json.loads(sys.argv[3]) if len(sys.argv)>3 else None)
  elif cmd=='import':result=import_assets(i,sys.argv[3])
  elif cmd=='requests':result={'prompt':requests(i)}
  else:raise ValueError('未知绘制命令')
  print(json.dumps({'ok':True,'result':result},ensure_ascii=False))
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
