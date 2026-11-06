"""Local image-to-avatar pipeline. No images leave this computer."""
import base64, copy, hashlib, importlib.util, io, json, math, re, shutil, sys, time, zipfile
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
PROJECTS=ROOT/'projects'
def load(p): return json.loads(p.read_text())
def save(p,v):
    temp=p.with_suffix(p.suffix+'.tmp');temp.write_text(json.dumps(v,ensure_ascii=False,indent=2));temp.replace(p)
def project(i):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,90}',i): raise ValueError('工程编号无效')
    return PROJECTS/i
def ellipse(x,y,rx,ry): return dict(cx=x,cy=y,rx=max(1,rx),ry=max(1,ry))
def points(cx,cy,rx,ry,n=24): return [[cx+rx*math.cos(2*math.pi*i/n),cy+ry*math.sin(2*math.pi*i/n)] for i in range(n)]
def make_rig(w,h,anchors):
    left,right,mouth=anchors
    if left[0]>right[0]:left,right=right,left
    ex=(left[0]+right[0])/2;ey=(left[1]+right[1])/2;dist=max(20,math.dist(left,right));mx,my=mouth
    head_y=ey-dist*.45;chin=min(h-1,my+dist*.5);neck=min(h-1,chin+dist*.25)
    r={'version':1,'image':{'width':w,'height':h},'head':{**ellipse(ex,head_y,dist*1.25,dist*1.35),'shiftX':dist*.08,'shiftY':dist*.05,'pivotX':ex,'pivotY':neck,'maxRoll':.09,'weightBand':[max(0,chin),max(chin+1,neck+dist*.25)],'turnBand':[max(0,chin),max(chin+2,neck+dist*.5)]},'body':{'pivotX':ex,'pivotY':h,'maxRoll':.02,'breathBand':[min(h-2,neck),h],'rollBand':[min(h-2,neck),h],'chest':ellipse(ex,neck+(h-neck)*.4,dist, max(5,(h-neck)*.5)),'shoulders':[]},'face':{},'eyes':[],'mouth':{'cx':mx,'cy':my,'angle':math.atan2(right[1]-left[1],right[0]-left[0]),'halfLen':dist*.18,'bow':2,'area':{**ellipse(mx,my,dist*.27,dist*.13),'angle':0}},'cheeks':[[left[0],my-dist*.1],[right[0],my-dist*.1]],'mesh':{'baseCell':max(8,int(w/90)),'fine':{'x0':max(0,int(ex-dist*1.5)),'x1':min(w,int(ex+dist*1.5)),'y0':max(0,int(head_y-dist)),'y1':min(h,int(neck+1)),'cell':5},'handCell':9,'tasselCell':8,'eyeBallCell':3,'eyeCell':2,'spriteCell':3},'view':{'padTop':.04,'padSide':.04,'gazeCenter':[ex,ey]},'strands':[],'appendages':[]}
    for key,x,y,rx,ry in [('nose',ex,(ey+my)/2,dist*.12,dist*.16),('mouth',mx,my,dist*.3,dist*.14),('eyeA',*left,dist*.3,dist*.23),('eyeB',*right,dist*.3,dist*.23),('earL',ex-dist,ey,dist*.15,dist*.3),('earR',ex+dist,ey,dist*.15,dist*.3),('brow',ex,ey-dist*.2,dist*.7,dist*.13),('jaw',ex,chin-dist*.1,dist*.6,dist*.2)]:r['face'][key]=ellipse(x,y,rx,ry)
    r['face']['brow']['band']=[ey-dist*.3,ey-dist*.05];r['face']['jaw']['band']=[my,chin]
    for x,y in [left,right]:r['eyes'].append({'opening':points(x,y,dist*.17,dist*.095),'roi':points(x,y,dist*.25,dist*.18)})
    for side,x in [('left',ex-dist*.9),('right',ex+dist*.9)]:r['strands'].append({'name':side+'-hair','nodes':[[x,head_y],[x,ey],[x,neck],[x,min(h,neck+dist)]],'sigma':dist*.25,'k':.65,'max':5})
    return r
def sample_workspace():
    return {'version':1,'name':'大肥鱼1号','ready':True,'updated':time.time()*1000,'origin':'大肥鱼1号原始立绘、眼睛/嘴型差分、独立尾巴与真实口播','kind':'sample','regions':[
      {'id':'ahoge','name':'呆毛','parent':'head','points':[[295,5],[535,5],[535,151],[298,163]],'sway':.7,'visible':True},
      {'id':'hair-front-left','name':'左前发束','parent':'head','points':[[434,178],[506,175],[505,274],[467,340],[456,396],[460,495],[491,591],[450,689],[387,711],[381,644],[427,548],[423,437],[399,350],[414,244]],'sway':.8,'visible':True},
      {'id':'hair-front-right','name':'右前发束','parent':'head','points':[[669,216],[738,237],[768,350],[745,442],[765,526],[789,615],[801,694],[740,699],[704,630],[691,544],[696,457],[689,378]],'sway':.8,'visible':True},
      {'id':'hair-back-left','name':'左后长发','parent':'head','points':[[335,472],[425,491],[392,658],[334,799],[329,987],[283,1114],[160,1110],[12,996],[9,814],[69,639],[238,532]],'sway':1,'visible':True},
      {'id':'hair-back-right','name':'右后长发','parent':'head','points':[[747,473],[837,497],[949,699],[1037,843],[1038,1049],[908,1129],[839,1073],[849,946],[805,852],[796,710]],'sway':1,'visible':True}
    ],'settings':{'sway':.8,'talkGain':1,'mouthGain':1.5,'idle':True,'blink':True,'background':'checker','loop':True},'keyframes':[], 'layerVisibility':{}}
def create(i,data):
    p=project(i);p.mkdir()
    raw=base64.b64decode(data['image'].split(',',1)[1],validate=True)
    im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGBA')
    if im.width>4096 or im.height>4096 or im.width<64 or im.height<64:raise ValueError('请使用边长 64–4096 像素的图片')
    # Never silently reuse example coordinates for an unrelated image.
    sample=PROJECTS/'da-fei-yu-1'
    with Image.open(sample/'source.png') as s:same=s.size==im.size and s.convert('RGBA').tobytes()==im.tobytes()
    if same:
      shutil.copytree(sample,p,dirs_exist_ok=True);v=load(p/'workspace.json');v['name']=str(data.get('name') or '大肥鱼1号副本')[:80];v['updated']=time.time()*1000;save(p/'workspace.json',v);return
    semantic=None
    if data.get('categoryMask'):
      mask_raw=base64.b64decode(data['categoryMask'].split(',',1)[1],validate=True)
      mask_image=np.array(Image.open(io.BytesIO(mask_raw)).convert('L'))
      if mask_image.max()<=5:semantic=cv2.resize(mask_image,im.size,interpolation=cv2.INTER_NEAREST)
    if semantic is not None and data.get('removeBackground'):
      a=np.array(im);foreground=np.where(semantic>0,255,0).astype(np.uint8);foreground=cv2.GaussianBlur(foreground,(3,3),.6);a[...,3]=np.minimum(a[...,3],foreground);im=Image.fromarray(a)
    elif data.get('removeBackground') and np.asarray(im)[...,3].min()==255:
      a=np.array(im);small=cv2.resize(a,(min(900,im.width),max(2,int(im.height*min(900,im.width)/im.width))));h,w=small.shape[:2]
      mask=np.zeros((h,w),np.uint8);bg=np.zeros((1,65),np.float64);fg=bg.copy()
      try:
        cv2.grabCut(small[:,:,:3].copy(),mask,(max(1,int(w*.04)),max(1,int(h*.01)),max(1,int(w*.92)),max(1,int(h*.98))),bg,fg,4,cv2.GC_INIT_WITH_RECT)
        alpha=cv2.resize(np.where((mask==1)|(mask==3),255,0).astype(np.uint8),im.size);a[...,3]=alpha;im=Image.fromarray(a)
      except cv2.error:pass
    im.save(p/'source.png');w,h=im.size
    anchors=data.get('anchors')
    if not isinstance(anchors,list) or len(anchors)!=3:raise ValueError('需要检测到双眼和嘴巴，或点击三个定位点')
    anchors=[[max(0,min(w-1,float(x))),max(0,min(h-1,float(y)))] for x,y in anchors]
    r=make_rig(w,h,anchors)
    # Real landmarks override generic elliptical contours whenever detected.
    for eye,contour in zip(r['eyes'],data.get('eyeContours') or []):
      if len(contour)>=8:
        eye['opening']=contour;cx=np.mean([x for x,y in contour]);cy=np.mean([y for x,y in contour]);eye['roi']=[[float(cx+(x-cx)*1.48),float(cy+(y-cy)*1.7)] for x,y in contour]
    save(p/'rig.json',r);save(p/'avatar.json',{'format':'mesh-avatar','version':1,'name':data.get('name','新形象'),'source':'source.png'})
    # A real independently stored head slice. Its lower edge is editable in the UI.
    neck=r['head']['pivotY'];ex=r['head']['cx'];rx=r['head']['rx']*1.2
    regions=[{'id':'head-pixels','name':'头部切片','parent':'head','points':[[max(0,ex-rx),0],[min(w,ex+rx),0],[min(w,ex+rx),neck],[max(0,ex-rx),neck]],'sway':1,'visible':True}]
    if semantic is not None:
      regions=[];(p/'masks').mkdir(exist_ok=True)
      for category,name,parent in [(1,'头发','head'),(3,'面部皮肤','head'),(2,'身体皮肤','body'),(4,'服装','body'),(5,'其他前景','body')]:
        mask=np.where(semantic==category,255,0).astype(np.uint8);ys,xs=np.where(mask>0)
        if len(xs)<30:continue
        rid='semantic-'+str(category);Image.fromarray(mask).save(p/'masks'/(rid+'.png'));x0,y0,x1,y1=int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())
        regions.append({'id':rid,'name':name,'parent':parent,'points':[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],'sway':1,'visible':True,'mask':'masks/'+rid+'.png'})
    save(p/'workspace.json',{'version':1,'name':str(data.get('name') or '新形象')[:80],'ready':False,'updated':time.time()*1000,'kind':'image','origin':'单张图片 · '+('面部关键点自动定位' if data.get('eyeContours') else '三点辅助定位'),'regions':regions,'settings':sample_workspace()['settings'],'keyframes':[],'layerVisibility':{}})
    build(i)
def split_regions(p,v):
    meta=load(p/'built/layers.json');a=np.array(Image.open(p/'built/base.png').convert('RGBA'));h,w=a.shape[:2];remaining=np.ones((h,w),np.float32);custom=[]
    # New manual cuts take priority so a new part can split an existing larger part.
    for reg in reversed(v.get('regions',[])):
      if not re.fullmatch(r'[a-zA-Z0-9_-]{1,60}',reg['id']):raise ValueError('图层名称无效')
      if len(reg.get('points',[]))<3:continue
      mask=np.zeros((h,w),np.uint8);cv2.fillPoly(mask,[np.array(reg['points'],np.int32)],255)
      # Content-aware blue hair cutouts for the known sample only; user polygons otherwise.
      if v.get('kind')=='sample' and reg['id'] in ['ahoge','hair-front-left','hair-front-right','hair-back-left','hair-back-right']:
        b,g,r=a[...,2].astype(float),a[...,1].astype(float),a[...,0].astype(float)
        mask=np.where((b>r*1.07)&(b>g*.95),mask,0).astype(np.uint8)
      if reg.get('mask'):
        mask_path=(p/reg['mask']).resolve()
        if not mask_path.is_relative_to(p.resolve()):raise ValueError('分割蒙版路径无效')
        if mask_path.is_file():mask=cv2.bitwise_and(mask,np.array(Image.open(mask_path).convert('L')))
      m=(mask/255)*remaining;part=a.copy();part[...,3]=np.round(a[...,3]*m).astype(np.uint8);remaining*=1-m
      ys,xs=np.where(part[...,3]>0)
      if not len(xs):continue
      x0,y0,x1,y1=int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)
      name='detail_'+reg['id'];Image.fromarray(part[y0:y1,x0:x1]).save(p/'built'/f'{name}.png');rect=[x0,y0,x1-x0,y1-y0]
      meta['layers'][name]=rect;custom.append({'name':name,'id':reg['id'],'sway':float(reg.get('sway',.8)),'parent':reg.get('parent','head')})
    a[...,3]=np.round(a[...,3]*remaining).astype(np.uint8);Image.fromarray(a).save(p/'built/base.png');meta['customLayers']=custom;meta['build']=hashlib.sha256(json.dumps(v).encode()).hexdigest()[:12];save(p/'built/layers.json',meta)
def recrop_sprites(p,r):
    path=p/'built/sprites/sprites.json'
    if not path.exists():return
    meta=load(path);geometry=hashlib.sha256(json.dumps([r['eyes'],r['mouth']['area']],sort_keys=True).encode()).hexdigest()
    if meta.get('geometry') and meta['geometry']!=geometry and (p/'variants').exists():
      w,h=r['image']['width'],r['image']['height'];layers={}
      for variant in (p/'variants').glob('*.png'):
        if not re.fullmatch(r'(eyes_(closed|half|smile|surprise|sad)|mouth_[a-z_]+)',variant.stem):continue
        im=np.array(Image.open(variant).convert('RGBA'))
        if im.shape[:2]!=(h,w):continue
        targets=[]
        if variant.stem.startswith('eyes_'):
          for index,eye in enumerate(r['eyes']):
            m=np.zeros((h,w),np.uint8);cv2.fillPoly(m,[np.array(eye['roi'],np.int32)],255);m=cv2.dilate(m,np.ones((5,5),np.uint8));targets.append((variant.stem+'_'+str(index),m))
        else:
          e=r['mouth']['area'];m=np.zeros((h,w),np.uint8);cv2.ellipse(m,(int(e['cx']),int(e['cy'])),(max(2,int(e['rx']+4)),max(2,int(e['ry']+4))),math.degrees(e.get('angle',0)),0,360,255,-1);targets.append((variant.stem,m))
        for name,m in targets:
          weight=cv2.GaussianBlur(m,(5,5),1)/255;part=im.copy();part[...,3]=np.round(part[...,3]*weight).astype(np.uint8);ys,xs=np.where(part[...,3]>0)
          if not len(xs):continue
          x0,y0,x1,y1=int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1);Image.fromarray(part[y0:y1,x0:x1]).save(path.parent/(name+'.png'));layers[name]=[x0,y0,x1-x0,y1-y0]
      if layers:meta['layers']=layers;meta['build']=geometry[:10]
    meta['geometry']=geometry;save(path,meta)
def build(i):
    p=project(i);v=load(p/'workspace.json')
    spec=importlib.util.spec_from_file_location('upstream',ROOT/'tools/upstream-build-layers.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    mod.build(p,p/'rig.json');split_regions(p,v)
    previews=p/'previews';previews.mkdir(exist_ok=True)
    r=load(p/'rig.json');recrop_sprites(p,r);source=Image.open(p/'source.png').convert('RGBA')
    for index,eye in enumerate(r['eyes']):
      pts=np.array(eye['roi']);x0,y0=pts.min(axis=0);x1,y1=pts.max(axis=0)
      source.crop((max(0,int(x0-10)),max(0,int(y0-10)),min(source.width,int(x1+10)),min(source.height,int(y1+10)))).save(previews/f'eye{index}.png')
    for key,e in [('head',r['head']),('body',r['body']['chest']),('mouth',r['mouth']['area'])]:
      source.crop((max(0,int(e['cx']-e['rx'])),max(0,int(e['cy']-e['ry'])),min(source.width,int(e['cx']+e['rx'])),min(source.height,int(e['cy']+e['ry'])))).save(previews/f'{key}.png')
    v['ready']=True;v['updated']=time.time()*1000;save(p/'workspace.json',v)
def save_project(i,data):
    p=project(i);v=load(p/'workspace.json');r=data.get('rig',load(p/'rig.json'))
    for key in ['name','settings','keyframes','regions','layerVisibility','motions']:
      if key in data:v[key]=data[key]
    if not isinstance(v['name'],str) or len(v['name'])>80:raise ValueError('形象名称最多 80 个字')
    if len(v.get('regions',[]))>100:raise ValueError('最多支持 100 个细分图层')
    save(p/'rig.json',r);v['updated']=time.time()*1000;save(p/'workspace.json',v)
    manifest=load(p/'avatar.json');manifest['name']=v['name'];save(p/'avatar.json',manifest)
def export(i):
    p=project(i);v=load(p/'workspace.json');stamp=str(int(time.time()));name=i+'-'+stamp+'.yxavatar';dest=ROOT/'exports'/name
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
      for f in p.rglob('*'):
        if f.is_file() and f.suffix.lower() in ['.png','.json','.wav'] and not f.name.startswith('.'):z.write(f,str(f.relative_to(p)))
      for f in ['player.html','player.js','vendor/mesh-avatar.js','vendor/LICENSE-mesh-avatar.txt']:z.write(ROOT/'public'/f,'player/'+f)
      z.writestr('README.txt','RuiC-2D 角色包。导入RuiC-2D 继续编辑。解压后在包目录运行 python3 -m http.server 8080，打开 http://127.0.0.1:8080/player/player.html?portable=1 可独立播放。图像与录音只在本机。\n')
    # A standard .mavatar bakes our extra layers back into base for older runtimes.
    compat=i+'-'+stamp+'.mavatar'
    meta=load(p/'built/layers.json');base=Image.open(p/'built/base.png').convert('RGBA')
    for item in meta.get('customLayers',[]):
      x,y,_,_=meta['layers'][item['name']];base.alpha_composite(Image.open(p/'built'/(item['name']+'.png')).convert('RGBA'),(x,y))
    b=io.BytesIO();base.save(b,format='PNG');meta.pop('customLayers',None);meta['layers']={k:r for k,r in meta['layers'].items() if not k.startswith('detail_')}
    with zipfile.ZipFile(ROOT/'exports'/compat,'w',zipfile.ZIP_DEFLATED) as z:
      for f in p.rglob('*'):
        rel=str(f.relative_to(p))
        if f.is_file() and (f.suffix.lower() in ['.png','.json']) and not rel.startswith('built/detail_') and f.name not in ['base.png','layers.json','workspace.json','rig.draft.json']:z.write(f,rel)
      z.writestr('built/base.png',b.getvalue());z.writestr('built/layers.json',json.dumps(meta));z.writestr('workspace.json',json.dumps(v,ensure_ascii=False))
    return {'url':'/exports/'+name,'compatibleUrl':'/exports/'+compat}
def import_project(i,archive):
    p=project(i);p.mkdir()
    try:
      with zipfile.ZipFile(archive) as z:
        if sum(f.file_size for f in z.infolist())>180*1024*1024 or len(z.infolist())>500:raise ValueError('角色包过大')
        for f in z.infolist():
          rel=Path(f.filename)
          if rel.is_absolute() or '..' in rel.parts or '\\' in f.filename:raise ValueError('角色包包含无效路径')
          if f.is_dir() or rel.suffix.lower() not in ['.png','.json','.wav']:continue
          if len(rel.parts)>4:raise ValueError('角色包目录层级无效')
          target=p/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(f))
      for req in ['rig.json','avatar.json','built/layers.json','built/base.png']:
        if not (p/req).is_file():raise ValueError('缺少 '+req)
      if not (p/'workspace.json').exists():save(p/'workspace.json',{'version':1,'name':load(p/'avatar.json').get('name','导入形象'),'kind':'imported','ready':True,'regions':[],'settings':sample_workspace()['settings'],'keyframes':[],'layerVisibility':{}})
      v=load(p/'workspace.json')
      if not load(p/'built/layers.json').get('customLayers'):v['regions']=[]
      v['updated']=time.time()*1000;save(p/'workspace.json',v)
    except Exception:
      shutil.rmtree(p,ignore_errors=True);raise

if __name__=='__main__':
    try:
      cmd,i=sys.argv[1:3]
      if cmd=='init':save(project(i)/'workspace.json',sample_workspace());build(i);result={'ok':True}
      elif cmd=='create':
        existed=project(i).exists()
        try:create(i,json.load(sys.stdin))
        except Exception:
          if not existed:shutil.rmtree(project(i),ignore_errors=True)
          raise
        result={'ok':True}
      elif cmd=='save':save_project(i,json.load(sys.stdin));result={'ok':True}
      elif cmd=='build':build(i);result={'ok':True}
      elif cmd=='export':result=export(i)
      elif cmd=='import':import_project(i,sys.argv[3]);result={'ok':True}
      else:raise ValueError('未知操作')
      print(json.dumps(result,ensure_ascii=False))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
