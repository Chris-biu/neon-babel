// ═══════════════════════════════════════════════════════
// B1 街机厅：霓虹接星 / 记忆灯窗 / 深海垂钓
// 赢塔币 → 夜市买礼物 → 送住户涨好感（经济闭环）
// ═══════════════════════════════════════════════════════
import { bus } from '../core/bus.js';
import { state, save, addCoins } from '../core/state.js';
import { sfx, tone } from '../core/audio.js';
import { dayKey } from '../core/clock.js';
import { toast, escapeHtml } from '../ui/hud.js';
import { openModal, closeModal } from '../ui/panels.js';
import { checkMedals } from '../sim/engine.js';

const CW = 560, CH = 420;
let cleanup = null;

// ── 鱼类图鉴 ──
export const FISH_SPECIES = [
  { id: 'blue_lantern', name: '灯笼小蓝', color: '#4dd8ff', desc: 'B2 最常见的居民，提灯上班，提灯下班。', lane: 0 },
  { id: 'mint_fin', name: '薄荷鳍', color: '#5fd4a2', desc: '它游过的水都是凉的，适合给发烫的心事退烧。', lane: 1 },
  { id: 'orange_lamp', name: '橘子灯', color: '#ff9f43', desc: '看起来是冬季限定色，其实一年四季都在加班。', lane: 2 },
  { id: 'neon_blade', name: '霓虹刀', color: '#ff5f8f', desc: '快得像一句谣言，钓到它需要缘分和手速。', lane: 3 },
  { id: 'gold_scale', name: '金鳞老爷', color: '#f5e6b8', desc: '深水层贵族，接受垂钓需提前预约（它说的）。', lane: 4 },
  { id: 'royal_koi', name: '鎏金锦鲤', color: '#ffd700', desc: '塔的传说：见到它的人，今晚一定睡得着。', rare: true },
  { id: 'purple_jelly', name: '紫水母', color: '#a78bfa', desc: '会偷塔币的软体惯犯。图鉴强制收录，以儆效尤。', jelly: true },
];

function recordCatch(speciesId) {
  const S = state();
  S.fishDex = S.fishDex || {};
  S.fishDex[speciesId] = (S.fishDex[speciesId] || 0) + 1;
  save();
}

export function initArcade() {
  bus.on('arcade:open', openArcadeHub);
  bus.on('fishing:open', () => launchGame(GAMES.fishing));
  bus.on('arcade:play', id => { if (GAMES[id]) launchGame(GAMES[id]); });
}

const GAMES = {
  stars: {
    id: 'stars', name: '霓虹接星', icon: '🌠',
    desc: '移动灯罩接住坠落的星星，躲开雨滴。星星越接越快。',
    run: runStars,
  },
  memory: {
    id: 'memory', name: '记忆灯窗', icon: '🏢',
    desc: '记住亮灯的顺序，把整栋楼的灯按顺序重新点亮。',
    run: runMemory,
  },
  fishing: {
    id: 'fishing', name: '深渊垂钓', icon: '🎣',
    desc: '在 B2 的深海里放钩，越深的鱼越值钱。水母会偷走塔币。',
    run: runFishing,
  },
};

function openArcadeHub() {
  const best = state().bestScores;
  const { el } = openModal(`
    <div class="panel arcade-panel">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">🕹 B1 · 街机厅</h2>
      <p class="panel-sub">得分换塔币（每局最多 80）· 塔币在 9F 夜市能换成心意</p>
      <div class="arcade-grid">
        ${Object.values(GAMES).map(g => `
          <button class="arcade-card" data-game="${g.id}">
            <div class="a-icon">${g.icon}</div>
            <div class="a-name">${g.name}</div>
            <div class="a-desc">${g.desc}</div>
            <div class="a-best">${best[g.id] ? `最高分 ${best[g.id]}` : '尚无记录'}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `);
  el.querySelectorAll('[data-game]').forEach(btn => {
    btn.addEventListener('click', () => { sfx.open(); launchGame(GAMES[btn.dataset.game]); });
  });
}

function launchGame(game) {
  const { el } = openModal(`
    <div class="panel game-panel">
      <div class="game-head">
        <div class="game-title">${game.icon} ${game.name}</div>
        <div class="game-stats" id="game-hud"></div>
      </div>
      <canvas id="game-canvas" width="${CW}" height="${CH}"></canvas>
      <div class="game-foot" id="game-foot">${escapeHtml(game.desc)}</div>
    </div>
  `);
  const canvas = el.querySelector('#game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ui = {
    hud(html) { el.querySelector('#game-hud').innerHTML = html; },
    foot(html) { el.querySelector('#game-foot').innerHTML = html; },
    over(score) {
      cleanup?.(); cleanup = null;
      const S = state();
      // 每日收益上限：制造稀缺，明天再来
      const today = dayKey();
      if (!S.dailyEarn || S.dailyEarn.day !== today) S.dailyEarn = { day: today, amt: 0 };
      const raw = Math.min(80, Math.floor(score / 10));
      const earned = Math.min(raw, Math.max(0, 150 - S.dailyEarn.amt));
      S.dailyEarn.amt += earned;
      S.gamesPlayed += 1;
      if (score > (S.bestScores[game.id] || 0)) S.bestScores[game.id] = score;
      save();
      if (earned > 0) { sfx.win(); addCoins(earned, `· ${game.name}`); }
      else sfx.bad();
      checkMedals();
      const capNote = raw > earned ? '<div style="color:var(--text-dim);font-size:12px">今日街机收益已达上限（150）——塔提醒你早点休息</div>' : '';
      ui.foot(`
        <div>本局得分 <b style="color:var(--warm)">${score}</b> · 兑换 🪙 ${earned}${score >= (S.bestScores[game.id] || 0) && score > 0 ? ' · ✨新纪录' : ''}</div>${capNote}
        <div class="game-over-row">
          <button class="btn-glow btn-sm" id="btn-again">再来一局</button>
          <button class="btn-plain" id="btn-quit">离开</button>
        </div>
      `);
      el.querySelector('#btn-again').addEventListener('click', () => { sfx.tap(); launchGame(game); });
      el.querySelector('#btn-quit').addEventListener('click', () => { sfx.close(); closeModal(); });
    },
    // 画布指针位置
    pointer: { x: CW / 2, y: 0, down: false },
  };

  const rect = () => canvas.getBoundingClientRect();
  const onMove = e => {
    const r = rect();
    ui.pointer.x = (e.clientX - r.left) / r.width * CW;
    ui.pointer.y = (e.clientY - r.top) / r.height * CH;
  };
  const onDown = e => { ui.pointer.down = true; onMove(e); };
  const onUp = () => { ui.pointer.down = false; };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);

  cleanup?.();
  const stop = game.run(ctx, ui, canvas);
  cleanup = () => {
    stop?.();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
  };
}

// —— 像素绘制小工具 ——
const P = 4; // 像素单元
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, w * P, h * P);
}
function drawStarShape(ctx, x, y, color, big = false) {
  const s = big ? 2 : 1;
  px(ctx, x, y - 4 * s, 1 * s, 1 * s, color);
  px(ctx, x - 4 * s, y, 3 * s, 1 * s, color);
  px(ctx, x + 4 * s, y, 1 * s, 1 * s, color);
  px(ctx, x, y, 1 * s, 1 * s, '#fff');
  px(ctx, x, y + 4 * s, 1 * s, 1 * s, color);
}

// ═══════ 游戏1：霓虹接星 ═══════
function runStars(ctx, ui) {
  let running = true, raf = 0;
  let score = 0, lives = 3, time = 60;
  let items = [], spawnT = 0, speed = 1;
  const basket = { x: CW / 2, w: 72 };
  const t0 = performance.now();
  let lastT = t0;

  const timer = setInterval(() => {
    if (!running) return;
    time -= 1;
    if (time <= 0) end();
  }, 1000);

  function end() {
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    ui.over(score);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(50, now - lastT); lastT = now;
    speed = 1 + (60 - time) * 0.025;
    basket.x = Math.max(basket.w / 2, Math.min(CW - basket.w / 2, ui.pointer.x));

    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = Math.max(260, 700 - (60 - time) * 8);
      const roll = Math.random();
      items.push({
        x: 30 + Math.random() * (CW - 60), y: -12,
        vy: (1.4 + Math.random() * 1.4) * speed,
        kind: roll < 0.12 ? 'big' : roll < 0.68 ? 'star' : 'rain',
        sway: Math.random() * Math.PI * 2,
      });
    }

    for (const it of items) {
      it.y += it.vy * dt * 0.06;
      it.x += Math.sin(it.sway + it.y * 0.02) * 0.5;
    }

    // 碰撞
    const keep = [];
    for (const it of items) {
      const caught = it.y > CH - 46 && it.y < CH - 18 && Math.abs(it.x - basket.x) < basket.w / 2 + 6;
      if (caught) {
        if (it.kind === 'rain') { lives -= 1; sfx.hit(); if (lives <= 0) { end(); return; } }
        else { score += it.kind === 'big' ? 30 : 10; sfx.catch_(); }
        continue;
      }
      if (it.y < CH + 20) keep.push(it);
    }
    items = keep;

    // 绘制
    ctx.fillStyle = '#090c18';
    ctx.fillRect(0, 0, CW, CH);
    // 背景微星
    for (let i = 0; i < 24; i++) {
      const sx = (i * 97) % CW, sy = (i * 53) % (CH - 100);
      ctx.fillStyle = `rgba(150,170,230,${0.12 + (i % 3) * 0.05})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
    for (const it of items) {
      if (it.kind === 'rain') { px(ctx, it.x, it.y, 1, 3, '#5f9fd8'); }
      else drawStarShape(ctx, it.x, it.y, it.kind === 'big' ? '#ff5f8f' : '#ffd97a', it.kind === 'big');
    }
    // 灯罩（接星的碗）
    px(ctx, basket.x - basket.w / 2, CH - 40, basket.w / 4, 3, '#ffca7a');
    px(ctx, basket.x - basket.w / 2 + 4, CH - 28, (basket.w - 8) / 4, 2, '#c9891f');
    px(ctx, basket.x - 2, CH - 20, 1, 5, '#54422e');

    ui.hud(`得分 <b>${score}</b>&nbsp; 灯芯 <b>${'🕯'.repeat(lives)}</b>&nbsp; ⏱ <b>${time}</b>`);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { running = false; clearInterval(timer); cancelAnimationFrame(raf); };
}

// ═══════ 游戏2：记忆灯窗 ═══════
function runMemory(ctx, ui) {
  let running = true;
  let seq = [], inputIdx = 0, round = 0, score = 0;
  let phase = 'show'; // show | input | dead
  let showIdx = 0, showT = 0, litCell = -1, raf = 0, lastT = performance.now();

  const cols = 3, rows = 3;
  const cell = 92, gap = 18;
  const ox = (CW - cols * cell - (cols - 1) * gap) / 2;
  const oy = (CH - rows * cell - (rows - 1) * gap) / 2 + 8;
  const tones = [392, 440, 494, 523, 587, 659, 698, 784, 880];

  function cellAt(mx, my) {
    for (let i = 0; i < 9; i++) {
      const cx = ox + (i % 3) * (cell + gap), cy = oy + Math.floor(i / 3) * (cell + gap);
      if (mx >= cx && mx <= cx + cell && my >= cy && my <= cy + cell) return i;
    }
    return -1;
  }

  function nextRound() {
    round += 1;
    seq.push(Math.floor(Math.random() * 9));
    inputIdx = 0; showIdx = 0; showT = 600;
    phase = 'show';
  }

  function lightTone(i) {
    litCell = i;
    tone(tones[i], 0.35, 'sine', 0.12); // 复用共享 AudioContext，避免超限
    setTimeout(() => { if (litCell === i) litCell = -1; }, 320);
  }

  const onClick = e => {
    if (phase !== 'input' || !running) return;
    const r = e.target.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * CW;
    const my = (e.clientY - r.top) / r.height * CH;
    const i = cellAt(mx, my);
    if (i < 0) return;
    lightTone(i);
    if (i === seq[inputIdx]) {
      inputIdx += 1;
      if (inputIdx >= seq.length) {
        score += round * 20;
        sfx.coin();
        setTimeout(() => { if (running) nextRound(); }, 650);
        phase = 'wait';
      }
    } else {
      sfx.bad();
      phase = 'dead';
      setTimeout(() => { if (running) { running = false; cancelAnimationFrame(raf); ui.over(score); } }, 700);
    }
  };
  ctx.canvas.addEventListener('pointerdown', onClick);

  function loop(now) {
    if (!running) return;
    const dt = Math.min(60, now - lastT); lastT = now;
    if (phase === 'show') {
      showT -= dt;
      if (showT <= 0) {
        if (showIdx < seq.length) {
          lightTone(seq[showIdx]);
          showIdx += 1;
          showT = 560;
        } else {
          phase = 'input';
        }
      }
    }

    ctx.fillStyle = '#090c18';
    ctx.fillRect(0, 0, CW, CH);
    // 楼体
    ctx.fillStyle = '#151a30';
    ctx.fillRect(ox - 22, oy - 26, cols * cell + (cols - 1) * gap + 44, rows * cell + (rows - 1) * gap + 48);
    for (let i = 0; i < 9; i++) {
      const cx = ox + (i % 3) * (cell + gap), cy = oy + Math.floor(i / 3) * (cell + gap);
      const lit = litCell === i;
      ctx.fillStyle = lit ? '#ffca7a' : '#232c4a';
      ctx.fillRect(cx, cy, cell, cell);
      if (lit) {
        ctx.fillStyle = 'rgba(255,202,122,.25)';
        ctx.fillRect(cx - 8, cy - 8, cell + 16, cell + 16);
        ctx.fillStyle = '#ffca7a';
        ctx.fillRect(cx, cy, cell, cell);
      }
      // 窗框十字
      ctx.fillStyle = lit ? '#c9891f' : '#161c33';
      ctx.fillRect(cx + cell / 2 - 2, cy, 4, cell);
      ctx.fillRect(cx, cy + cell / 2 - 2, cell, 4);
    }
    const tip = phase === 'show' ? '看好亮灯顺序…' : phase === 'input' ? `轮到你了（${inputIdx}/${seq.length}）` : phase === 'dead' ? '灯灭了……' : '漂亮！';
    ui.hud(`第 <b>${round}</b> 轮&nbsp; 得分 <b>${score}</b>&nbsp; <span style="color:var(--text-dim)">${tip}</span>`);
    raf = requestAnimationFrame(loop);
  }
  nextRound();
  raf = requestAnimationFrame(loop);
  return () => { running = false; cancelAnimationFrame(raf); ctx.canvas.removeEventListener('pointerdown', onClick); };
}

// ═══════ 游戏3：深渊垂钓 ═══════
function runFishing(ctx, ui) {
  let running = true, raf = 0, lastT = performance.now();
  let score = 0, time = 75;
  const hook = { x: CW / 2, y: 54, state: 'idle', vy: 0, catchFish: null }; // idle | drop | reel
  let fishes = [];
  const LANES = [
    { y: 150, v: 0.9, value: 10, color: '#4dd8ff' },
    { y: 200, v: 1.2, value: 15, color: '#5fd4a2' },
    { y: 250, v: 1.5, value: 25, color: '#ff9f43' },
    { y: 305, v: 1.9, value: 40, color: '#ff5f8f' },
    { y: 360, v: 2.4, value: 60, color: '#f5e6b8' },
  ];

  for (const lane of LANES) spawnFish(lane);
  function spawnFish(lane) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const jelly = Math.random() < 0.16;
    const rare = !jelly && Math.random() < 0.045;
    const laneIdx = LANES.indexOf(lane);
    const species = jelly ? 'purple_jelly' : rare ? 'royal_koi' : FISH_SPECIES[laneIdx].id;
    fishes.push({
      lane, dir, jelly, rare, species,
      x: dir > 0 ? -30 : CW + 30,
      w: rare ? 40 : 26 + Math.random() * 10,
    });
  }

  const spawner = setInterval(() => {
    if (!running) return;
    if (fishes.length < 11) spawnFish(LANES[Math.floor(Math.random() * LANES.length)]);
  }, 900);

  const timer = setInterval(() => {
    if (!running) return;
    time -= 1;
    if (time <= 0) end();
  }, 1000);

  function end() {
    running = false;
    clearInterval(timer); clearInterval(spawner);
    cancelAnimationFrame(raf);
    ui.over(score);
  }

  const onDown = () => {
    if (hook.state === 'idle') { hook.state = 'drop'; hook.vy = 3.4; sfx.tap(); }
  };
  ctx.canvas.addEventListener('pointerdown', onDown);

  function loop(now) {
    if (!running) return;
    const dt = Math.min(50, now - lastT); lastT = now;

    if (hook.state === 'idle') {
      hook.x += (Math.max(40, Math.min(CW - 40, ui.pointer.x)) - hook.x) * 0.2;
      hook.y = 54;
    } else if (hook.state === 'drop') {
      hook.y += hook.vy * dt * 0.09;
      if (hook.y > CH - 16) hook.state = 'reel';
      for (const f of fishes) {
        if (Math.abs(f.lane.y - hook.y) < 12 && Math.abs(f.x - hook.x) < f.w / 2 + 6) {
          hook.catchFish = f;
          fishes = fishes.filter(x => x !== f);
          hook.state = 'reel';
          break;
        }
      }
    } else if (hook.state === 'reel') {
      hook.y -= 5.4 * dt * 0.09;
      if (hook.catchFish) hook.catchFish.x = hook.x;
      if (hook.y <= 54) {
        if (hook.catchFish) {
          const f = hook.catchFish;
          recordCatch(f.species);
          if (f.jelly) { score = Math.max(0, score - 20); sfx.hit(); }
          else if (f.rare) { score += 100; sfx.win(); ui.foot('✨ 鎏金锦鲤！传说今晚你一定睡得着'); }
          else { score += f.lane.value; sfx.coin(); }
          hook.catchFish = null;
        }
        hook.state = 'idle';
      }
    }

    for (const f of fishes) {
      f.x += f.dir * f.lane.v * dt * 0.07;
      if (f.x < -50 || f.x > CW + 50) fishes = fishes.filter(x => x !== f);
    }

    // 绘制
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, '#0c2438');
    grad.addColorStop(1, '#050d18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
    // 水面
    ctx.fillStyle = 'rgba(77,216,255,.16)';
    ctx.fillRect(0, 44, CW, 4);
    // 小船
    px(ctx, hook.x - 24, 24, 12, 3, '#7a5a3a');
    px(ctx, hook.x - 16, 12, 1, 3, '#54422e');
    // 钓线与钩
    ctx.strokeStyle = '#8b93b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hook.x, 36);
    ctx.lineTo(hook.x, hook.y);
    ctx.stroke();
    px(ctx, hook.x - 2, hook.y, 1, 2, '#ffd97a');
    // 鱼
    for (const f of [...fishes, hook.catchFish].filter(Boolean)) {
      const y = hook.catchFish === f ? hook.y + 8 : f.lane.y;
      if (f.jelly) {
        px(ctx, f.x - 8, y - 6, 4, 3, '#a78bfa');
        px(ctx, f.x - 6, y + 6, 1, 2, '#8b6fd8');
        px(ctx, f.x + 2, y + 6, 1, 2, '#8b6fd8');
      } else if (f.rare) {
        px(ctx, f.x - f.w / 2, y - 5, f.w / 4, 3, '#ffd700');
        px(ctx, f.x + f.w / 2, y - 3, 3, 2, '#ffb700');
        px(ctx, f.x - 4, y - 8, 2, 1, '#fff3b0');
        ctx.fillStyle = '#0b0e1a';
        ctx.fillRect(f.x - f.w / 2 + 5, y - 3, 4, 4);
      } else {
        px(ctx, f.x - f.w / 2, y - 4, f.w / 4, 2, f.lane.color);
        px(ctx, f.x + f.w / 2, y - 2, 2, 1, f.lane.color); // 尾
        ctx.fillStyle = '#0b0e1a';
        ctx.fillRect(f.x - f.w / 2 + 4, y - 2, 3, 3);      // 眼
      }
    }
    // 深度标尺
    for (const lane of LANES) {
      ctx.fillStyle = 'rgba(139,147,184,.35)';
      ctx.font = '10px monospace';
      ctx.fillText(`+${lane.value}`, CW - 34, lane.y + 3);
    }

    ui.hud(`得分 <b>${score}</b>&nbsp; ⏱ <b>${time}</b>&nbsp; <span style="color:var(--text-dim)">${hook.state === 'idle' ? '点击放钩' : hook.state === 'drop' ? '下潜中…' : '收线！'}</span>`);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { running = false; clearInterval(timer); clearInterval(spawner); cancelAnimationFrame(raf); ctx.canvas.removeEventListener('pointerdown', onDown); };
}
