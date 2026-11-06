"""Apply additive editor support to the vendored MIT Mesh Avatar runtime."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'public/vendor/mesh-avatar.js'
s=p.read_text()
if 'YOUXING_EDITOR_EXTENSION' not in s:
    s='// YOUXING_EDITOR_EXTENSION — additive local editor API; upstream © 2026 Yuki Shindo, MIT.\n'+s
    s=s.replace('const names = ["base",','const names = [...(meta.customLayers ?? []).map(c => c.name), "base",',1)
    marker='R.addLayer("base", imgs.base, baseMesh, { face: true });'
    s=s.replace(marker,marker+'''
    let editorMesh = false;
    const detailLayers = (meta.customLayers ?? []).map(config => {
      const img = imgs[config.name];
      const mesh = buildGrid(rects[config.name], rig.mesh.baseCell, alphaOf(img), img.width);
      const W = [];
      for(let k=0;k<mesh.rest.length;k+=2) W.push(baseWeights(mesh.rest[k],mesh.rest[k+1],hairAt(mesh.rest[k],mesh.rest[k+1])));
      const layer = R.addLayer(config.name,img,mesh,{face:true});
      return {config,mesh,W,layer};
    });
    ''',1)
    marker='const eyeOpenFor = (v, eye) =>'
    s=s.replace(marker,'''for(const d of detailLayers) {
        for(let k=0;k<d.W.length;k++) {
          deformBase(d.mesh.rest[k*2],d.mesh.rest[k*2+1],d.W[k],P,phys,tmp);
          d.mesh.pos[k*2]=tmp[0];d.mesh.pos[k*2+1]=tmp[1];
        }
      }
      const eyeOpenFor = (v, eye) =>''',1)
    s=s.replace('showMesh: false,','showMesh: editorMesh,',1)
    marker='motions: motionList,'
    s=s.replace(marker,marker+'''
      setEditorMesh(on) { editorMesh=!!on; },
      setLayerVisible(name,on) { for(const l of R.layers) if(l.name===name) l.visible=!!on; },
      getViewport() { R.resize(); return {scale:R.pxScale,offset:[...R.pxOff],width:canvas.width,height:canvas.height}; },
      getLayers() { return R.layers.map(l=>({name:l.name,visible:l.visible})); },
    ''',1)
    p.write_text(s)
