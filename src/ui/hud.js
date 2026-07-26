// HUD：顶栏 / 楼层导航 / 动态流 / 悬浮提示 / 窗口气泡 / Toast
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { clockText, towerHeight } from '../core/clock.js';
import { toggleSound, sfx } from '../core/audio.js';
import { worldToScreen, scene } from '../scene/app.js';

let towerApi = null;
const $ = id => document.getElementById(id);

export function initHud(api) {
  towerApi = api;
  $('hud').classList.remove('hidden');
  $('floor-nav').classList.remove('hidden');
  $('feed').classList.remove('hidden');

  // 时钟与高度
  const tickClock = () => {
    $('hud-clock').textContent = clockText();
    $('hud-height').textContent = `第 ${towerHeight()} 层`;
  };
  tickClock();
  setInterval(tickClock, 10000);

  // 塔币
  renderCoins();
  bus.on('coins', ({ delta, reason }) => {
    renderCoins();
    if (delta > 0) toast(`🪙 +${delta} ${reason || ''}`, 'gold');
  });

  // 楼层导航
  const nav = $('floor-nav');
  nav.innerHTML = '';
  for (const f of api.nav) {
    const b = document.createElement('button');
    b.className = 'floor-btn';
    b.innerHTML = `<span class="f-icon">${f.icon}</span><span class="f-label">${f.label}</span>`;
    b.title = f.names ? `${f.label}：${f.names}` : f.label;
    b.addEventListener('click', () => { sfx.tap(); bus.emit('elevator:go', f.key); });
    nav.appendChild(b);
  }
  // 高亮当前区域
  bus.on('camera', camY => {
    const vh = window.innerHeight;
    const centerWy = camY + vh / scene.worldScale / 2;
    let best = 0, bestD = Infinity;
    api.nav.forEach((f, i) => {
      const d = Math.abs(f.wy - centerWy);
      if (d < bestD) { bestD = d; best = i; }
    });
    [...nav.children].forEach((el, i) => el.classList.toggle('active', i === best));
  });

  // 动态流
  const feedList = $('feed-list');
  bus.on('feed', ev => {
    const li = document.createElement('li');
    const time = ev.t != null
      ? `${String(Math.floor(ev.t / 60)).padStart(2, '0')}:${String(ev.t % 60).padStart(2, '0')}`
      : '· 塔 ·';
    li.innerHTML = `<span class="t">${time}</span>${escapeHtml(ev.text)}`;
    feedList.prepend(li);
    while (feedList.children.length > 40) feedList.lastChild.remove();
  });
  $('feed-toggle').addEventListener('click', () => {
    $('feed').classList.toggle('collapsed');
    $('feed-toggle').textContent = $('feed').classList.contains('collapsed') ? '+' : '—';
  });

  // 悬浮提示
  const tip = $('tip');
  bus.on('tip:show', ({ html, gx, gy }) => {
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    moveTip(gx, gy);
  });
  bus.on('tip:move', ({ gx, gy }) => moveTip(gx, gy));
  bus.on('tip:hide', () => tip.classList.add('hidden'));
  function moveTip(gx, gy) {
    tip.style.left = Math.min(window.innerWidth - 130, Math.max(130, gx)) + 'px';
    tip.style.top = Math.max(70, gy) + 'px';
  }

  // 音效开关
  const muteBtn = $('btn-mute');
  const syncMute = () => {
    muteBtn.textContent = state().settings.sound ? '🔊' : '🔇';
    muteBtn.classList.toggle('muted', !state().settings.sound);
  };
  syncMute();
  muteBtn.addEventListener('click', () => { toggleSound(); syncMute(); });

  // 面板按钮
  $('btn-room').addEventListener('click', () => { sfx.open(); bus.emit('room:open'); });
  $('btn-news').addEventListener('click', () => { sfx.open(); bus.emit('news:open'); });
  $('btn-bag').addEventListener('click', () => { sfx.open(); bus.emit('bag:open'); });
  $('btn-medals').addEventListener('click', () => { sfx.open(); bus.emit('medals:open'); });
  $('btn-cfg').addEventListener('click', () => { sfx.open(); bus.emit('cfg:open'); });

  // 窗口气泡
  initBubbles();

  // 移动端虚拟按键（仅触屏设备显示，见CSS）
  const tp = document.createElement('div');
  tp.id = 'touchpad';
  tp.innerHTML = `
    <div class="tp-group"><button data-h="a">◀</button><button data-h="d">▶</button></div>
    <div class="tp-group"><button data-t="w">▲</button><button data-t="s">▼</button><button data-t="e" class="tp-e">E</button></div>`;
  document.body.appendChild(tp);
  import('../game/player.js').then(({ vHold, vTap }) => {
    tp.querySelectorAll('[data-h]').forEach(b => {
      const k = b.dataset.h;
      b.addEventListener('pointerdown', e => { e.preventDefault(); vHold(k, true); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => vHold(k, false));
    });
    tp.querySelectorAll('[data-t]').forEach(b =>
      b.addEventListener('pointerdown', e => { e.preventDefault(); vTap(b.dataset.t); }));
  });

  // 成就提示
  bus.on('medal:new', d => {
    sfx.chime();
    toast(`${d.icon || '🏅'} 达成成就「${d.name}」`, 'gold');
  });
}

function renderCoins() {
  $('coins-num').textContent = state().coins;
}

// ── 住户头顶气泡（DOM，跟随摄像机） ──
const activeBubbles = new Set();
function initBubbles() {
  bus.on('bubble', ({ rid, text }) => {
    if (!towerApi) return;
    const pos = towerApi.getWindowPos(rid);
    if (!pos) return;
    // 不在视野附近就不弹
    const sp = worldToScreen(pos.x, pos.y);
    if (sp.y < -140 || sp.y > window.innerHeight + 60) return;
    const el = document.createElement('div');
    el.className = 'win-bubble';
    el.textContent = text;
    document.body.appendChild(el);
    const b = { el, rid };
    activeBubbles.add(b);
    positionBubble(b);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => { el.remove(); activeBubbles.delete(b); }, 400);
    }, 4600);
  });
  bus.on('camera', () => activeBubbles.forEach(positionBubble));
  bus.on('layout', () => activeBubbles.forEach(positionBubble));
}

function positionBubble(b) {
  const pos = towerApi.getWindowPos(b.rid);
  if (!pos) return;
  const sp = worldToScreen(pos.x, pos.y);
  b.el.style.left = sp.x + 'px';
  b.el.style.top = (sp.y - 14) + 'px';
}

// ── Toast ──
export function toast(text, cls = '') {
  const root = $('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  }, 2600);
  while (root.children.length > 3) root.firstChild.remove();
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
