import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

// 本机 Python 处理全部通过这里启动。任何 stdio 的 error 都必须被吃掉：
// 子进程提前退出时（例如 Windows 上 python3 不存在、依赖没装好），
// 往 stdin 写图片数据会触发 EPIPE / EOF，未监听的 'error' 会让整个 Node 服务退出。
export function venvPython(root) {
  return process.platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python');
}

export function pythonCandidates(root) {
  const pinned = process.env.YOUXING_PYTHON;
  if (pinned) return [{cmd: pinned, args: [], label: pinned}];
  const list = [];
  const venv = venvPython(root);
  if (existsSync(venv)) list.push({cmd: venv, args: [], label: '.venv'});
  if (process.platform === 'win32') {
    list.push({cmd: 'python', args: [], label: 'python'});
    list.push({cmd: 'py', args: ['-3'], label: 'py -3'});
  } else {
    list.push({cmd: 'python3', args: [], label: 'python3'});
    list.push({cmd: 'python', args: [], label: 'python'});
  }
  return list;
}

export function setupHint() {
  return '请在项目目录运行 npm run setup（会自动创建 .venv 并安装 Pillow / numpy / opencv-python-headless），或安装 Python 3.10+ 后设置环境变量 YOUXING_PYTHON 指向解释器。';
}

export function friendlyPythonError(message) {
  const text = String(message ?? '').trim();
  if (/No module named\s+['"]?(PIL|numpy|cv2)|ModuleNotFoundError|ImportError:\s*No module named/i.test(text)) {
    return `缺少 Python 图像依赖（Pillow / numpy / opencv-python-headless）。${setupHint()}\n\n原始信息：${text.slice(-400)}`;
  }
  if (/can't open file|No such file or directory/i.test(text) && /pipeline\.py|art\.py|psd_import/.test(text)) {
    return `Python 找不到项目脚本，请确认在完整仓库目录内启动服务。原始信息：${text.slice(-400)}`;
  }
  return text || 'Python 处理失败';
}

function guardStreams(child) {
  // 管道另一头关闭时 Node 会在这几个 Socket 上发 error；不监听就会 crash。
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    stream?.on?.('error', () => {});
  }
  return child;
}

export function runPython(root, args, {input = '', timeout = 180000, onSpawn} = {}) {
  const candidates = pythonCandidates(root);
  return new Promise((resolve, reject) => {
    let settled = false;
    let index = 0;
    let child = null;
    let timer = null;
    let out = '';
    let err = '';
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const tryNext = (cause) => {
      if (settled) return;
      index += 1;
      if (index < candidates.length) return startAttempt();
      finish(new Error(`未找到可用的 Python。${setupHint()}${cause?.code ? `（${cause.code}）` : ''}`));
    };
    function startAttempt() {
      if (settled) return;
      const candidate = candidates[index];
      out = '';
      err = '';
      try {
        child = guardStreams(spawn(candidate.cmd, [...candidate.args, ...args], {cwd: root}));
      } catch (error) {
        return tryNext(error);
      }
      onSpawn?.(child);
      timer = setTimeout(() => {
        try { child.kill(); } catch {}
        finish(new Error(`Python 处理超时（${Math.round(timeout / 1000)} 秒）。请缩小图片或减少 PSD 图层后重试。`));
      }, timeout);
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', (error) => {
        if (error.code === 'ENOENT') {
          if (!process.env.YOUXING_PYTHON && index < candidates.length - 1) return tryNext(error);
          return finish(new Error(`未找到 Python 解释器（${candidate.label}）。${setupHint()}`));
        }
        finish(new Error(friendlyPythonError(error.message)));
      });
      child.on('exit', (code) => {
        if (settled) return;
        if (code === 0) {
          try {
            resolve(JSON.parse(out.trim().split('\n').at(-1) || '{}'));
          } catch {
            resolve({ok: true});
          }
          settled = true;
          if (timer) clearTimeout(timer);
          return;
        }
        const message=(err||out||'').trim();
        // Windows 的 python3.exe 有时只是 Microsoft Store 的占位程序，换成 python / py -3 再试。
        if(!process.env.YOUXING_PYTHON && index < candidates.length - 1 && /Microsoft Store|Python was not found|not recognized as an internal or external command/i.test(message)) return tryNext(new Error(message));
        finish(new Error(message?friendlyPythonError(message):`Python 处理失败（退出码 ${code}），没有返回错误信息。${setupHint()}`));
      });
      try {
        if (!child.stdin.destroyed) child.stdin.end(input);
      } catch {}
    }
    startAttempt();
  });
}

export function guardChildProcess(child) {
  return guardStreams(child);
}
