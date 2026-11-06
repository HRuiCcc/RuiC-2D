export class ReferenceGuides{
 constructor(canvas,staticCanvas){this.canvas=canvas;this.staticCanvas=staticCanvas;this.image=null;this.asset=null;this.assetRect=null;this.on=false;this.step=50;this.mouse=null;this.mode='animate';}
 async load(url){this.image=new Image();this.image.src=url;await this.image.decode();this.asset=null;}
 async loadAsset(url,rect){const asset=new Image();asset.src=url;await asset.decode();this.asset=asset;this.assetRect=rect;}
 resize(canvas){const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}return {c:canvas.getContext('2d'),w,h,dpr};}
 draw(v,rig){if(!v||!rig)return;const {c,w,h,dpr}=this.resize(this.canvas),k=w/v.width,s=v.scale*k,ox=v.offset[0]*k,oy=v.offset[1]*k,W=rig.image.width,H=rig.image.height;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const st=this.resize(this.staticCanvas);st.c.setTransform(dpr,0,0,dpr,0,0);st.c.clearRect(0,0,w,h);this.staticCanvas.style.display=this.mode==='animate'?'none':'block';
  if(this.mode!=='animate'&&this.image){if(this.mode==='layer'&&this.asset&&this.assetRect){const [x,y,aw,ah]=this.assetRect;st.c.drawImage(this.asset,ox+x*s,oy+y*s,aw*s,ah*s);}else st.c.drawImage(this.image,ox,oy,W*s,H*s);}
  if(!this.on)return;
  c.save();c.beginPath();c.rect(Math.max(20,ox),Math.max(20,oy),Math.min(w-20,W*s),Math.min(h-20,H*s));c.clip();
  const step=this.step;
  for(let x=0;x<=W;x+=step){const px=ox+x*s;if(px<20||px>w)continue;c.strokeStyle=x%(step*5)===0?'#9ac6ff75':'#8cb8ea33';c.lineWidth=x%(step*5)===0?1:.6;c.beginPath();c.moveTo(px,Math.max(20,oy));c.lineTo(px,Math.min(h,oy+H*s));c.stroke();}
  for(let y=0;y<=H;y+=step){const py=oy+y*s;if(py<20||py>h)continue;c.strokeStyle=y%(step*5)===0?'#9ac6ff75':'#8cb8ea33';c.lineWidth=y%(step*5)===0?1:.6;c.beginPath();c.moveTo(Math.max(20,ox),py);c.lineTo(Math.min(w,ox+W*s),py);c.stroke();}
  if(this.mouse){const [x,y]=this.mouse;c.strokeStyle='#ffd3939a';c.setLineDash([4,3]);c.beginPath();c.moveTo(x,20);c.lineTo(x,h);c.moveTo(20,y);c.lineTo(w,y);c.stroke();}c.restore();
  c.fillStyle='#172234ed';c.fillRect(0,0,w,20);c.fillRect(0,0,26,h);c.font='10px Harmony,sans-serif';c.fillStyle='#c1d9ff';
  const labelStep=step*Math.max(1,Math.ceil(50/(step*s)));
  for(let x=0;x<=W;x+=labelStep){const px=ox+x*s;if(px>27&&px<w-18){c.fillText(Math.round(x),px+3,13);c.strokeStyle='#aac9f9';c.beginPath();c.moveTo(px,16);c.lineTo(px,20);c.stroke();}}
  for(let y=0;y<=H;y+=labelStep){const py=oy+y*s;if(py>25&&py<h-8){c.save();c.translate(10,py+1);c.rotate(-Math.PI/2);c.fillText(Math.round(y),0,0);c.restore();}}
  c.strokeStyle='#9dc5ff90';c.strokeRect(ox,oy,W*s,H*s);
  const pivot=[rig.head.pivotX,rig.head.pivotY],px=ox+pivot[0]*s,py=oy+pivot[1]*s;c.strokeStyle='#ffc882';c.beginPath();c.moveTo(px-9,py);c.lineTo(px+9,py);c.moveTo(px,py-9);c.lineTo(px,py+9);c.stroke();c.fillStyle='#ffd6a6';c.fillText('头部支点',px+12,py+4);
 }
 export(step=50){if(!this.image)return null;const margin=34,canvas=document.createElement('canvas');canvas.width=this.image.naturalWidth+margin;canvas.height=this.image.naturalHeight+margin;const c=canvas.getContext('2d');c.fillStyle='#f0f3f9';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(this.image,margin,margin);c.font='11px sans-serif';for(let x=0;x<this.image.naturalWidth;x+=step){c.strokeStyle='#3565a35f';c.beginPath();c.moveTo(x+margin,margin);c.lineTo(x+margin,canvas.height);c.stroke();c.fillStyle='#163f75';c.fillText(x,x+margin+2,25);}for(let y=0;y<this.image.naturalHeight;y+=step){c.strokeStyle='#3565a35f';c.beginPath();c.moveTo(margin,y+margin);c.lineTo(canvas.width,y+margin);c.stroke();c.fillStyle='#163f75';c.fillText(y,1,y+margin+5);}return canvas.toDataURL('image/png');}
}
