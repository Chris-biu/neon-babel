// 标题页 → 守门人入住仪式 → 角色创建；以及入住后的大堂闲聊
import { GATEKEEPER } from '../data/world.js';
import { TAGLINES, LOADING_LINES } from '../data/events.js';
import { bus } from '../core/bus.js';
import { state, isNewPlayer, createPlayer } from '../core/state.js';
import { sfx, startRain } from '../core/audio.js';
import { toast, escapeHtml } from './hud.js';
import { openModal } from './panels.js';
import { checkMedals } from '../sim/engine.js';

const $ = id => document.getElementById(id);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const AVATARS = ['🌙', '⭐', '🕯', '🌧', '🐈', '🎐', '📻', '🫖', '🧸', '📚', '🎏', '🌊'];

let onWorldReady = null;

export function initGate(startWorld) {
  onWorldReady = startWorld;
  const tag = $('landing-tagline');
  if (TAGLINES.length) tag.textContent = pick(TAGLINES);

  $('btn-enter').addEventListener('click', () => {
    sfx.open();
    startRain();
    $('landing').classList.add('hidden');
    if (isNewPlayer()) beginCeremony();
    else {
      revealWorld();
      toast(`🏙 欢迎回来，${state().name}。塔今晚也醒着。`);
    }
  });

  // 入住后点大堂门 → 闲聊
  bus.on('gate:talk', () => {
    if (isNewPlayer()) { beginCeremony(); return; }
    openGateSmalltalk();
  });
}

function revealWorld() {
  const lines = LOADING_LINES.length ? LOADING_LINES : ['正在点亮灯…'];
  const loading = $('loading');
  loading.classList.remove('hidden');
  const lineEl = $('loading-line');
  lineEl.textContent = pick(lines);
  const iv = setInterval(() => { lineEl.textContent = pick(lines); }, 700);
  setTimeout(() => {
    clearInterval(iv);
    loading.classList.add('hidden');
    onWorldReady?.();
  }, 1700);
}

// ── 打字机 ──
function typeText(el, text, speed = 26) {
  return new Promise(resolve => {
    el.innerHTML = '';
    const cur = document.createElement('span');
    cur.className = 'cursor';
    el.appendChild(cur);
    let i = 0;
    const iv = setInterval(() => {
      if (i >= text.length) { clearInterval(iv); cur.remove(); resolve(); return; }
      cur.before(document.createTextNode(text[i++]));
    }, speed);
  });
}

// ── 入住仪式 ──
async function beginCeremony() {
  const gate = $('gate');
  const textEl = $('gate-text');
  const inputRow = $('gate-input-row');
  const input = $('gate-input');
  const sendBtn = $('gate-send');
  const nextBtn = $('gate-next');
  const eye = $('gate-eye');
  $('gate-name').textContent = `守门人 · ${GATEKEEPER.name}`;
  gate.classList.remove('hidden');
  $('gate-skip').onclick = () => {
    sfx.tap();
    gate.classList.add('hidden');
    openCheckin();
  };

  const waitNext = () => new Promise(res => {
    nextBtn.classList.remove('hidden');
    nextBtn.onclick = () => { sfx.tap(); nextBtn.classList.add('hidden'); res(); };
  });
  const waitAnswer = () => new Promise(res => {
    inputRow.classList.remove('hidden');
    input.value = '';
    input.focus();
    const submit = () => {
      const v = input.value.trim();
      if (!v) { input.placeholder = '……沉默也是回答，但至少打个字吧。'; return; }
      inputRow.classList.add('hidden');
      res(v);
    };
    sendBtn.onclick = submit;
    input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  });

  // 开场白
  for (const line of GATEKEEPER.opening) {
    await typeText(textEl, line);
    await waitNext();
  }

  // 三个问题
  for (const q of GATEKEEPER.questions) {
    await typeText(textEl, q.q);
    const ans = await waitAnswer();
    eye.classList.add('judging');
    sfx.knock();
    await new Promise(r => setTimeout(r, 900));
    eye.classList.remove('judging');
    const hit = (q.pass_hints || []).some(h => ans.includes(h));
    let reply;
    if (hit) reply = pick(q.pass_lines);
    else if (ans.length >= 10) reply = pick(q.neutral_lines);
    else reply = pick(q.snark_lines);
    await typeText(textEl, reply);
    await waitNext();
  }

  // 欢迎
  for (const line of GATEKEEPER.welcome) {
    await typeText(textEl, line);
    await waitNext();
  }
  gate.classList.add('hidden');
  openCheckin();
}

// ── 角色创建 ──
function openCheckin() {
  const overlay = $('checkin');
  overlay.classList.remove('hidden');
  const grid = $('avatar-grid');
  grid.innerHTML = '';
  let chosen = AVATARS[0];
  AVATARS.forEach((a, i) => {
    const cell = document.createElement('button');
    cell.className = 'avatar-cell' + (i === 0 ? ' active' : '');
    cell.textContent = a;
    cell.addEventListener('click', () => {
      grid.querySelectorAll('.avatar-cell').forEach(c => c.classList.remove('active'));
      cell.classList.add('active');
      chosen = a;
      sfx.tap();
    });
    grid.appendChild(cell);
  });

  $('btn-checkin').onclick = () => {
    const name = $('player-name').value.trim() || '夜行者';
    const floor = 2 + Math.floor(Math.random() * 7);
    const room = `${floor}F - ${String(1 + Math.floor(Math.random() * 8)).padStart(2, '0')} 室`;
    createPlayer(name, chosen, room);
    sfx.win();
    overlay.classList.add('hidden');
    revealWorld();
    setTimeout(() => {
      toast(`${chosen} 入住登记完成：${name} · ${room}`, 'gold');
      toast('滚动鼠标滚轮上下逛塔，点亮着灯的窗户敲门', '');
      checkMedals();
    }, 1900);
  };
}

// ── 大堂闲聊 ──
function openGateSmalltalk() {
  const { el, close } = openModal(`
    <div class="panel chat-panel" style="max-width:520px">
      <button class="modal-close" data-close>✕</button>
      <div class="chat-head">
        <div class="chat-avatar" style="border-color:#4dd8ff55"><img class="pt" src="/portraits/gatekeeper.png" alt="" onerror="this.remove()"><span>${GATEKEEPER.emoji}</span></div>
        <div class="chat-title">
          <div class="chat-name">${escapeHtml(GATEKEEPER.name)}</div>
          <div class="chat-meta">1F 大堂 · 守门人</div>
        </div>
      </div>
      <div class="chat-body" id="gate-chat-body"></div>
      <div class="chat-options">
        <button class="chat-opt" id="gate-more">🕯 再聊两句</button>
        <button class="chat-opt" data-close>🚪 告辞</button>
      </div>
    </div>
  `);
  const body = el.querySelector('#gate-chat-body');
  const say = () => {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="m-ava">${GATEKEEPER.emoji}</span><div class="m-text">${escapeHtml(pick(GATEKEEPER.smalltalk))}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  };
  say();
  el.querySelector('#gate-more').addEventListener('click', () => { sfx.tap(); say(); });
}
