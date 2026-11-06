self.exports={};
importScripts('/mediapipe/vision_bundle.js');
let detector,segmenter;
self.onmessage=async({data})=>{
 try{
  if(!detector){const files=await self.exports.FilesetResolver.forVisionTasks('/mediapipe');detector=await self.exports.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/mediapipe/face_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numFaces:1});}
  const result=detector.detect(data.image);
  let mask=null;
  try{
   if(!segmenter){const files=await self.exports.FilesetResolver.forVisionTasks('/mediapipe');segmenter=await self.exports.ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:'/mediapipe/selfie_multiclass.tflite',delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});}
   const output=segmenter.segment(data.image),category=output.categoryMask;
   if(category){mask={width:category.width,height:category.height,data:new Uint8Array(category.getAsUint8Array())};category.close();}
  }catch(e){console.warn('局部分割模型不可用，回退到轮廓切分',e.message);}
  data.image.close();
  self.postMessage({landmarks:result.faceLandmarks[0]||null,mask});
 }catch(e){self.postMessage({error:e.message||'无法加载本地面部模型'});}
};
