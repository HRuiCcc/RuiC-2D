const PROJECT = 'da-fei-yu-1';
const VOICE = '/projects/' + PROJECT + '/voice.wav';
const channel = new BroadcastChannel('youxing-live');
const frame = document.getElementById('avatar-frame');
const loading = document.getElementById('loading');
const playButton = document.getElementById('play');
const playLabel = document.getElementById('play-label');
const playIcon = document.getElementById('play-icon');

const neutral = {
  angleX: 0, angleY: 0, angleZ: 0, bodyAngleZ: 0, breath: .3,
  eyeLOpen: 1, eyeROpen: 1, mouthOpen: 0, mouthForm: 0,
  gazeX: 0, gazeY: 0, eyeSmile: 0
};

const audio = new Audio(VOICE);
audio.preload = 'auto';

let envelope = null;
let audioContext = null;
let playing = false;
let blinkUntil = 0;
let closedUntil = 0;
let turnStart = 0;
let turnUntil = 0;
let tailUntil = 0;
let smileUntil = 0;

function hideLoading() {
  setTimeout(() => loading.classList.add('hidden'), 350);
}
if (frame.contentDocument?.readyState === 'complete') hideLoading();
else frame.addEventListener('load', hideLoading, { once: true });
setTimeout(() => loading.classList.add('hidden'), 2500);

async function loadEnvelope() {
  if (envelope) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();
  const response = await fetch(VOICE);
  if (!response.ok) throw new Error('无法读取示例配音');
  const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const values = [];
  for (let t = 0; t < buffer.duration; t += 1 / 60) {
    const start = Math.floor(t * rate);
    const end = Math.min(data.length, start + Math.floor(rate / 60));
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    values.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  envelope = values;
}

function setPlayState(next) {
  playing = next;
  playButton.setAttribute('aria-pressed', String(next));
  playLabel.textContent = next ? '暂停' : '播放自我介绍';
  playIcon.textContent = next ? 'Ⅱ' : '▶';
}

async function togglePlay() {
  if (playing) {
    audio.pause();
    setPlayState(false);
    return;
  }
  try {
    playLabel.textContent = '准备中…';
    await loadEnvelope();
    if (audio.ended || audio.currentTime >= audio.duration - .05) audio.currentTime = 0;
    await audio.play();
    setPlayState(true);
  } catch (error) {
    setPlayState(false);
    playLabel.textContent = '播放失败，请重试';
    console.error(error);
  }
}

audio.addEventListener('ended', () => setPlayState(false));

function trigger(action, button) {
  const now = performance.now();
  if (action === 'blink') blinkUntil = now + 180;
  if (action === 'closed') closedUntil = now + 1200;
  if (action === 'turn') {
    turnStart = now;
    turnUntil = now + 1400;
  }
  if (action === 'tail') tailUntil = now + 1800;
  if (action === 'smile') smileUntil = now + 1800;
  button.classList.add('active');
  setTimeout(() => button.classList.remove('active'), 420);
}

playButton.addEventListener('click', togglePlay);
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => trigger(button.dataset.action, button));
});

document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.target !== document.body) return;
  event.preventDefault();
  togglePlay();
});

let last = performance.now();
let elapsed = 0;

function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  const params = { ...neutral };
  params.angleX = Math.sin(elapsed * .65) * 4;
  params.angleZ = Math.sin(elapsed * .9) * 2.5;
  params.bodyAngleZ = Math.sin(elapsed * .7) * 1.5;
  params.breath = (Math.sin(elapsed * 1.5) + 1) * .42;

  const phase = (elapsed + .7) % 4.6;
  let eyes = phase < .2 ? 1 - Math.sin(phase / .2 * Math.PI) : 1;
  if (now < blinkUntil || now < closedUntil) eyes = 0;
  params.eyeLOpen = eyes;
  params.eyeROpen = eyes;

  if (playing && envelope) {
    const level = Math.min(1, (envelope[Math.floor(audio.currentTime * 60)] || 0) * 1.2 * 5);
    params.mouthOpen = level;
    params.mouthForm = level ? Math.sin(elapsed * 6) * .5 : 0;
  }

  if (now < turnUntil) {
    const progress = Math.min(1, (now - turnStart) / 1400);
    params.angleY = Math.sin(progress * Math.PI) * 22;
    params.angleZ += Math.sin(progress * Math.PI) * 5;
  }

  if (now < smileUntil) {
    params.eyeSmile = .85;
    params.mouthOpen = Math.max(params.mouthOpen, .32);
    params.mouthForm = .3;
  }

  const tailGain = now < tailUntil ? 1.7 + Math.sin(elapsed * 8) * .7 : 1;

  channel.postMessage({
    type: 'frame',
    id: PROJECT,
    params,
    tailGain,
    partMotions: {},
    isolated: null,
    visibility: {},
    suppressSway: false,
    settings: { sway: .9 }
  });

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
