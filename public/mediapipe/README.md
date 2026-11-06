# MediaPipe Face Landmarker

- Asset: `face_landmarker.task`, Face Landmarker float16, model version 1.
- Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Downloaded: 2026-10-05. The model is unmodified.
- Copyright: The MediaPipe Authors. Licensed under the Apache License, Version 2.0;
  see [LICENSE](LICENSE). Distributed without warranties or conditions of any kind.

The runtime uses `@mediapipe/tasks-vision` version **0.10.21**, pinned in `package.json`
and `package-lock.json`. Its JavaScript and WASM are licensed under Apache-2.0.
Vite serves the installed WASM files at `/mediapipe/` and includes them, this model,
and these notices in builds. No CDN or remote model request is needed at runtime.

This version is retained because version 1.0.1 includes metrics reporting to an external
service. Before upgrading, inspect the JavaScript bundle and WASM loading scripts for
telemetry and remote asset URLs, then run the live and stream network-isolation tests
with the real tracker initialized. All assets must still load locally, with no outbound
requests. Camera frames and microphone audio are processed locally and are never
included in relay messages.

## Selfie Multiclass Image Segmenter

- 新增本地模型：`selfie_multiclass.tflite`，256×256 / float32。
- 官方来源：https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
- 下载日期：2026-10-30。未修改模型内容。
- 类别：0 背景、1 头发、2 身体皮肤、3 面部皮肤、4 服装、5 其他前景。
- Copyright The MediaPipe Authors，Apache 2.0，同目录 LICENSE。
- 只在浏览器本地执行，不发送输入图片。人像模型对插画和道具的分割并不保证准确。
