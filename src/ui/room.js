// 玩家的房间：像素房间画布 + 家具布置 + 家具商店 + 串门留言
import { FURNITURE, FURN_PAL, characterLook } from '../scene/pixels.js';
import { FURN_CATALOG, ROOM_SLOTS } from '../data/furniture.js';
import { RESIDENTS } from '../data/residents.js';
import { bus } from '../core/bus.js';
import { state, save, spendCoins, getAffinity } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { dayKey } from '../core/clock.js';
import { toast, escapeHtml } from './hud.js';
import { openModal } from './panels.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const byId = id => FURN_CATALOG.find(f => f.id === id);

export function initRoom() {
  bus.on('room:open', openRoom);
}

function ensure() {
  const S = state();
  if (!S.roomDecor) S.roomDecor = { s1: null, s2: 'fur_bed', s3: null, s4: null, w1: null, w2: null };
  if (!S.roomGuest) S.roomGuest = { day: null, rid: null, note: '' };
  return S;
}

// 每天最多一位高好感住户来串门留言
function guestNote() {
  const S = ensure();
  const today = dayKey();
  if (S.roomGuest.day === today) return S.roomGuest;
  const friends = RESIDENTS.filter(r => getAffinity(r.id) >= 3);
  if (!friends.length || Math.random() < 0.35) {
    S.roomGuest = { day: today, rid: null, note: '' };
  } else {
    const r = pick(friends);
    S.roomGuest = {
      day: today, rid: r.id,
      note: `${r.emoji} ${r.name} 来串过门，留了张条：「${pick(r.diary_lines || ['路过，看你灯没亮，别熬太晚。'])}」`,
    };
  }
  save();
  return S.roomGuest;
}

function drawGrid(ctx, grid, pal, x, y, sc) {
  for (let gy = 0; gy < grid.length; gy++) {
    const row = grid[gy];
    for (let gx = 0; gx < row.length; gx++) {
      const ch = row[gx];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + gx * sc, y + gy * sc, sc, sc);
    }
  }
}

function renderRoom(cv) {
  const S = ensure();
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = cv.width, H = cv.height, FLOOR = H - 40;
  // 墙与地板
  ctx.fillStyle = '#2b2119'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#241c15'; ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = '#3a2c1e'; ctx.fillRect(0, FLOOR, W, 40);
  ctx.fillStyle = '#4d3a27'; ctx.fillRect(0, FLOOR, W, 4);
  // 窗（雨夜）
  ctx.fillStyle = '#1a1626'; ctx.fillRect(190, 40, 110, 86);
  ctx.fillStyle = '#0d1120'; ctx.fillRect(196, 46, 98, 74);
  ctx.fillStyle = 'rgba(255,202,122,.3)';
  [[210, 60], [250, 84], [272, 56], [226, 100]].forEach(([x, y]) => ctx.fillRect(x, y, 4, 5));
  ctx.fillStyle = 'rgba(138,156,208,.35)';
  for (let i = 0; i < 6; i++) ctx.fillRect(202 + i * 15, 50 + (i % 3) * 9, 1, 13);
  // 家具
  for (const s of ROOM_SLOTS) {
    const fid = S.roomDecor[s.id];
    if (!fid) continue;
    const f = byId(fid);
    const grid = FURNITURE[f.kind];
    if (!grid) continue;
    const sc = 4;
    const h = grid.length * sc;
    const y = s.slot === 'wall' ? 44 : FLOOR - h;
    drawGrid(ctx, grid, FURN_PAL, s.x, y, sc);
  }
  // 玩家小人站在房里
  const look = characterLook('player-' + (S.name || '夜行者'));
  const stand = [
    '...HHHHHH...', '..HHHHHHHH..', '..HHFFFFHH..', '..HFEFFEFH..', '...FFFFFF...',
    '....FFFF....', '...CCCCCC...', '..CCCCCCCC..', '..FCCCCCCF..', '..FCCCCCCF..',
    '...CCCCCC...', '...PPPPPP...', '...PP..PP...', '...PP..PP...', '...BB..BB...',
  ];
  drawGrid(ctx, stand, look.palette, W - 90, FLOOR - stand.length * 3, 3);
  // 暖光罩
  ctx.fillStyle = 'rgba(255,192,106,.08)'; ctx.fillRect(0, 0, W, H);
}

function openRoom() {
  const S = ensure();
  const guest = guestNote();
  const { el } = openModal(`
    <div class="panel grid-panel" style="max-width:560px">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">🔑 ${escapeHtml(S.room || '我的房间')}</h2>
      <p class="panel-sub">${guest.note ? escapeHtml(guest.note) : '今晚没人来串门——门缝下很安静。'}</p>
      <canvas id="room-cv" width="500" height="240" style="width:100%;border-radius:12px;border:1px solid var(--ink-line);background:#241c15"></canvas>
      <p class="panel-sub" style="margin-top:10px">点击下方槽位摆放家具 · 你有 🪙 <b id="room-coins">${S.coins}</b></p>
      <div class="chip-row" id="slot-row" style="margin-bottom:12px"></div>
      <h4 style="font-size:13px;letter-spacing:.15em;color:var(--neon-cyan);margin-bottom:8px">家具商店（螺丝上门安装）</h4>
      <div class="bag-grid" id="furn-shop" style="max-height:200px"></div>
    </div>
  `);
  const cv = el.querySelector('#room-cv');
  renderRoom(cv);

  const slotRow = el.querySelector('#slot-row');
  const shop = el.querySelector('#furn-shop');
  let activeSlot = 's1';

  const redraw = () => {
    renderRoom(cv);
    el.querySelector('#room-coins').textContent = state().coins;
    slotRow.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.slot === activeSlot));
  };

  ROOM_SLOTS.forEach(s => {
    const b = document.createElement('button');
    b.className = 'chip' + (s.id === activeSlot ? ' active' : '');
    b.dataset.slot = s.id;
    const cur = S.roomDecor[s.id];
    b.textContent = `${s.slot === 'wall' ? '🖼' : '🪑'}${s.id}${cur ? '·' + byId(cur)?.name.slice(0, 4) : ''}`;
    b.addEventListener('click', () => { activeSlot = s.id; sfx.tap(); redraw(); });
    slotRow.appendChild(b);
  });

  FURN_CATALOG.forEach(f => {
    const owned = (state().furniture || {})[f.id] || 0;
    const card = document.createElement('div');
    card.className = 'bag-item';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="b-emoji">${f.slot === 'wall' ? '🖼' : '🪑'}</div>
      <div class="b-name">${escapeHtml(f.name)}</div>
      <div class="b-count">${owned ? '已拥有 · 点击摆放' : `🪙 ${f.price}`}</div>`;
    card.title = f.desc;
    card.addEventListener('click', () => {
      const St = state();
      St.furniture = St.furniture || {};
      const slotDef = ROOM_SLOTS.find(s => s.id === activeSlot);
      if (slotDef.slot !== f.slot) { toast(`这件要放${f.slot === 'wall' ? '墙上（🖼槽）' : '地上（🪑槽）'}`, 'pink'); return; }
      if (!St.furniture[f.id]) {
        if (!spendCoins(f.price)) { sfx.bad(); toast('塔币不够——去街机厅赢一点？', 'pink'); return; }
        St.furniture[f.id] = 1;
        toast(`🔧 螺丝：「${f.name}，装好了。保修期：直到你不需要为止。」`, 'gold');
      }
      St.roomDecor[activeSlot] = f.id;
      save();
      sfx.chime();
      slotRow.innerHTML = '';
      ROOM_SLOTS.forEach(s => {
        const b = document.createElement('button');
        b.className = 'chip' + (s.id === activeSlot ? ' active' : '');
        b.dataset.slot = s.id;
        const cur = state().roomDecor[s.id];
        b.textContent = `${s.slot === 'wall' ? '🖼' : '🪑'}${s.id}${cur ? '·' + byId(cur)?.name.slice(0, 4) : ''}`;
        b.addEventListener('click', () => { activeSlot = s.id; sfx.tap(); redraw(); });
        slotRow.appendChild(b);
      });
      redraw();
    });
    shop.appendChild(card);
  });
}
