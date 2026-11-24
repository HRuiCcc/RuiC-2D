#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  print "未找到 Node.js，请先安装 Node.js 20 或更新版本。"; read "reply?按回车退出"; exit 1
fi
if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c 'import PIL, numpy, cv2' >/dev/null 2>&1; then
  print "首次启动：正在项目内创建 .venv 并安装图像依赖（不会改动系统 Python）…"
  if ! node scripts/setup.mjs; then
    print "依赖安装没有完成。可手动运行 npm run setup 查看原因。"; read "reply?按回车退出"; exit 1
  fi
fi
PORT=${YOUXING_PORT:-8796}
if curl --max-time 2 -fs "http://127.0.0.1:$PORT/api/projects" >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT"; exit 0
fi
(sleep 1; open "http://127.0.0.1:$PORT") &
node server.mjs
