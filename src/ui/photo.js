// 深夜合影卡：与好感≥8的住户合影，导出像素风PNG（传播出口）
import { characterGrid, MOON, MOON_PAL } from '../scene/pixels.js';
import { state } from '../core/state.js';
import { dayKey, towerHeight } from '../core/clock.js';
import { sfx } from '../core/audio.js';
import { toast } from './hud.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

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

function wrap(ctx, text, font, maxW) {
  ctx.font = font;
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

export function takePhoto(res) {
  const W = 640, H = 800;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  // 夜空色带
  const bands = ['#04050d', '#080a1a', '#0d1126', '#12163a', '#1a1e3a'];
  bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (H / bands.length) * i, W, H / bands.length + 1); });
  // 星星（按名字做种子，同一对合影星空固定）
  let seed = (res.id + state().name).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  g.fillStyle = '#dfe8ff';
  for (let i = 0; i < 60; i++) {
    const s = rnd() < 0.15 ? 3 : 2;
    g.globalAlpha = 0.3 + rnd() * 0.7;
    g.fillRect(rnd() * W, rnd() * H * 0.5, s, s);
  }
  g.globalAlpha = 1;
  // 月亮
  drawGrid(g, MOON, MOON_PAL, W - 150, 60, 7);
  // 天台地面与栏杆
  g.fillStyle = '#1a2138'; g.fillRect(0, H - 200, W, 90);
  g.fillStyle = '#2a3355'; g.fillRect(0, H - 200, W, 6);
  g.fillStyle = '#3a4466';
  for (let x = 10; x < W; x += 22) g.fillRect(x, H - 236, 3, 36);
  g.fillStyle = '#4a5578'; g.fillRect(0, H - 240, W, 4);
  // 灯串
  const cols = ['#ffca7a', '#ff5f8f', '#4dd8ff', '#5fd4a2'];
  for (let x = 8, i = 0; x < W; x += 26, i++) {
    g.fillStyle = cols[i % 4];
    g.fillRect(x, 254 + (i % 2) * 6, 5, 5);
  }
  // 两个像素小人（角色比例放大）
  const me = characterGrid('player-' + (state().name || '夜行者'));
  const them = characterGrid(res.id, res.color);
  const SC = 13;
  const charY = H - 200 - 18 * SC;
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.beginPath(); g.ellipse(196, H - 196, 60, 12, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(440, H - 196, 60, 12, 0, 0, 7); g.fill();
  drawGrid(g, me.grid, me.palette, 118, charY, SC);
  drawGrid(g, them.grid, them.palette, 362, charY, SC);

  // 文案
  const serif = '"Noto Serif SC","SimSun",serif';
  g.textAlign = 'center';
  g.fillStyle = '#ffca7a';
  g.font = `900 34px ${serif}`;
  g.fillText('深 夜 合 影', W / 2, 74);
  g.fillStyle = '#8b93b8';
  g.font = `14px ${serif}`;
  g.fillText(`${state().name} × ${res.name} · 不夜塔第 ${towerHeight()} 层`, W / 2, 104);
  // 住户金句
  const quote = pick(res.diary_lines || ['今晚也醒着，真好。']);
  const qLines = wrap(g, `「${quote}」`, `18px ${serif}`, W - 120);
  g.fillStyle = '#dfe4f5';
  qLines.forEach((l, i) => g.fillText(l, W / 2, 150 + i * 30));
  // 底部水印
  g.fillStyle = '#1a2138'; g.fillRect(0, H - 110, W, 110);
  g.fillStyle = '#ff5f8f';
  g.font = `bold 16px ${serif}`;
  g.fillText('不 夜 塔 · NEON BABEL', W / 2, H - 62);
  g.fillStyle = '#8b93b8';
  g.font = `12px ${serif}`;
  g.fillText(`${dayKey()} · 一座为睡不着的人而建的塔`, W / 2, H - 36);

  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = `不夜塔合影-${res.name}-${dayKey()}.png`;
  a.click();
  sfx.chime();
  toast(`📸 和 ${res.name} 的深夜合影已保存——发出去吧`, 'gold');
}
