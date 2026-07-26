// WebAudio 合成音效与雨声环境（无任何外部音频文件）
import { state, save } from './state.js';

let ctx = null;
let rainNodes = null;
let started = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function soundOn() { return state().settings.sound; }

export function toggleSound() {
  state().settings.sound = !state().settings.sound;
  save();
  if (state().settings.sound) startRain(); else stopRain();
  return state().settings.sound;
}

// ── 环境雨声：过滤噪声循环 ──
export function startRain() {
  if (!soundOn() || rainNodes) return;
  try {
    const c = ac();
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02; // 布朗化，听感更像雨
        d[i] = last * 3.2;
      }
    }
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = .4;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const gain = c.createGain(); gain.gain.value = 0;
    src.connect(lp); lp.connect(hp); hp.connect(gain); gain.connect(c.destination);
    src.start();
    gain.gain.linearRampToValueAtTime(0.16, c.currentTime + 3);
    rainNodes = { src, gain };
    started = true;
  } catch { /* 无音频环境 */ }
}

export function stopRain() {
  if (!rainNodes) return;
  try {
    const c = ac();
    rainNodes.gain.gain.linearRampToValueAtTime(0, c.currentTime + .8);
    const s = rainNodes.src;
    setTimeout(() => { try { s.stop(); } catch {} }, 1000);
  } catch {}
  rainNodes = null;
}

// ── 短音效 ──
export function tone(freq, dur = .18, type = 'sine', vol = .16, delay = 0) {
  if (!soundOn()) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + delay + .015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + delay);
    o.stop(c.currentTime + delay + dur + .05);
  } catch {}
}

export const sfx = {
  step()   { tone(110 + Math.random() * 30, .05, 'triangle', .05); },
  ding()   { tone(988, .12, 'sine', .09); tone(1319, .3, 'sine', .07, .1); },
  tap()    { tone(660, .08, 'sine', .1); },
  open()   { tone(440, .12, 'sine', .12); tone(660, .14, 'sine', .1, .06); },
  close()  { tone(520, .1, 'sine', .09); tone(360, .12, 'sine', .08, .05); },
  coin()   { tone(880, .09, 'square', .07); tone(1320, .14, 'square', .06, .07); },
  knock()  { tone(180, .09, 'triangle', .22); tone(160, .1, 'triangle', .18, .13); },
  chime()  { tone(784, .3, 'sine', .1); tone(988, .34, 'sine', .08, .1); tone(1175, .4, 'sine', .07, .2); },
  wish()   { tone(523, .5, 'sine', .08); tone(659, .5, 'sine', .07, .15); tone(784, .7, 'sine', .06, .3); tone(1047, .9, 'sine', .05, .45); },
  bad()    { tone(220, .16, 'sawtooth', .07); tone(180, .2, 'sawtooth', .06, .1); },
  catch_() { tone(740, .07, 'triangle', .1); },
  hit()    { tone(140, .14, 'sawtooth', .12); },
  win()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, 'sine', .1, i * .1)); },
};

// 首次交互解锁音频
export function armAudioOnce() {
  const arm = () => {
    if (!started) startRain();
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm);
  window.addEventListener('keydown', arm);
}
