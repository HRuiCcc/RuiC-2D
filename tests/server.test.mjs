import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPython, pythonCandidates} from '../lib/python.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: {...process.env, YOUXING_PORT: String(port), ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务启动超时：${log}`)), 15000);
    child.stdout.on('data', (chunk) => {
      log += chunk;
      if (log.includes('RuiC-2D http://')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`服务提前退出（${code}）：${log}`));
    });
  });
  return {
    port,
    child,
    base: `http://127.0.0.1:${port}`,
    stop() {
      child.removeAllListeners('exit');
      child.kill();
    },
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  return {status: response.status, body: await response.json()};
}

test('子进程秒退时 runPython 只报错，不会因为 stdin 的 EPIPE/EOF 抛未捕获异常', async () => {
  await assert.rejects(
    runPython(ROOT, ['-c', 'import sys; sys.exit(1)'], {input: 'x'.repeat(8 * 1024 * 1024), timeout: 30000}),
    /Python 处理失败|未找到 Python|缺少 Python/
  );
  // 能走到这里说明进程还活着：没有未捕获的 socket error。
  assert.ok(true);
});

test('优先使用项目内 .venv 的 Python', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ruic-venv-'));
  const venv = process.platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python');
  await fs.mkdir(path.dirname(venv), {recursive: true});
  await fs.writeFile(venv, '');
  const previous = process.env.YOUXING_PYTHON;
  delete process.env.YOUXING_PYTHON;
  try {
    assert.equal(pythonCandidates(root)[0].cmd, venv);
  } finally {
    if (previous !== undefined) process.env.YOUXING_PYTHON = previous;
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('Python 缺失时制作接口返回中文提示，服务继续存活', async (t) => {
  const missing = path.join(os.tmpdir(), 'ruic-missing-python');
  const server = await startServer({YOUXING_PYTHON: missing});
  t.after(() => server.stop());
  const image = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);
  const created = await postJson(`${server.base}/api/create`, {image, anchors: [[1, 1], [2, 2], [3, 3]]});
  assert.equal(created.status, 400);
  assert.match(created.body.error, /未找到 Python|npm run setup/);
  const alive = await fetch(`${server.base}/api/projects`);
  assert.equal(alive.status, 200);
  assert.ok(Array.isArray(await alive.json()));
});

test('客户端中途断开不会杀掉服务', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  await new Promise((resolve) => {
    const socket = net.connect(server.port, '127.0.0.1', () => {
      socket.write('POST /api/create HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 10000000\r\n\r\n');
      socket.write('{"image":"data:image/png;base64,');
      setTimeout(() => { socket.destroy(); resolve(); }, 100);
    });
    socket.on('error', () => resolve());
  });
  const alive = await fetch(`${server.base}/api/projects`);
  assert.equal(alive.status, 200);
});

test('损坏的 PSD 返回明确报错，服务继续存活', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  const response = await fetch(`${server.base}/api/psd-inspect`, {method: 'POST', body: Buffer.from('not a psd file')});
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /PSD|PSD 文件/);
  const alive = await fetch(`${server.base}/api/projects`);
  assert.equal(alive.status, 200);
});
