#!/usr/bin/env node
// 一次性安装脚本：创建项目内 .venv 并安装 Python 依赖。
// 这样不会碰系统 Python，也就绕开了 PEP 668 的 externally-managed-environment 报错。
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const VENV = path.join(ROOT, '.venv');
const VENV_PY = WIN ? path.join(VENV, 'Scripts', 'python.exe') : path.join(VENV, 'bin', 'python');
const MIN = [3, 10];

function run(command, args, {allowFail = false} = {}) {
  const result = spawnSync(command, args, {cwd: ROOT, stdio: 'inherit'});
  if (result.error) {
    if (allowFail) return false;
    console.error(`无法执行 ${command}：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0 && !allowFail) process.exit(result.status ?? 1);
  return result.status === 0;
}

function probe(command, args) {
  const result = spawnSync(command, [...args, '-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const [major, minor] = result.stdout.trim().split('.').map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  if (major < MIN[0] || (major === MIN[0] && minor < MIN[1])) {
    console.error(`Python ${major}.${minor} 版本过低，需要 ${MIN.join('.')} 或更新版本。`);
    process.exit(1);
  }
  return [major, minor];
}

function findPython() {
  const candidates = WIN
    ? [['py', ['-3']], ['python', []]]
    : [['python3', []], ['python', []]];
  for (const [command, args] of candidates) {
    if (probe(command, args)) return {command, args};
  }
  console.error(
    `未找到 Python ${MIN.join('.')}+。\n` +
      '请先安装 Python（Windows 安装时勾选 Add Python to PATH），再重新运行 npm run setup。\n' +
      'macOS 可用 Homebrew：brew install python@3.12；Ubuntu/Debian：sudo apt install python3 python3-venv python3-pip。'
  );
  process.exit(1);
}

function ensureVenv() {
  if (existsSync(VENV_PY)) return;
  const base = findPython();
  console.log(`\n[1/3] 创建虚拟环境 .venv（基于 ${base.command} ${base.args.join(' ')}）…`);
  run(base.command, [...base.args, '-m', 'venv', VENV]);
}

function install() {
  console.log('\n[2/3] 安装 Python 依赖 Pillow / numpy / opencv-python-headless（只装进 .venv）…');
  run(VENV_PY, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(ROOT, 'requirements.txt')]);
}

function verify() {
  console.log('\n[3/3] 验证依赖…');
  run(VENV_PY, ['-c', 'import PIL, numpy, cv2; print("依赖就绪：", PIL.__version__, numpy.__version__, cv2.__version__)']);
}

console.log('RuiC-2D 环境安装'); 
ensureVenv();
install();
verify();
console.log(
  '\n完成。之后运行 npm start 即可，服务会自动优先使用 .venv 里的 Python。\n' +
    '如果之前用系统 pip 安装失败（PEP 668），无需理会，也不会影响系统 Python。'
);
