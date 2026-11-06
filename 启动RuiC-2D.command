#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  print "未找到 Node.js，请先安装 Node.js 20 或更新版本。"; read "reply?按回车退出"; exit 1
fi
if ! python3 -c 'import PIL, numpy, cv2' >/dev/null 2>&1; then
  print "缺少图像依赖。请先运行：python3 -m pip install -r requirements.txt"; read "reply?按回车退出"; exit 1
fi
PORT=${YOUXING_PORT:-8796}
if curl --max-time 2 -fs "http://127.0.0.1:$PORT/api/projects" >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT"; exit 0
fi
(sleep 1; open "http://127.0.0.1:$PORT") &
node server.mjs
