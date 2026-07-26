// 像素夜空：色带渐变 + 星星 + 月亮 + 云 + 远景城市
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { pixelSprite, MOON, MOON_PAL, shade } from './pixels.js';
import { nightness } from '../core/clock.js';
import { state } from '../core/state.js';

let refs = null;

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) + ((pb >> 16) - (pa >> 16)) * t));
  const g = Math.round((((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t));
  const bl = Math.round(((pa & 255) + ((pb & 255) - (pa & 255)) * t));
  return (r << 16) | (g << 8) | bl;
}

// 顶/底色随夜色插值（白天也是阴郁黄昏——这座塔永远处在傍晚与深夜之间）
const PAL = {
  day:   { top: '#2c3352', mid: '#454a6e', low: '#6a5a68', glow: '#8f6f5a' },
  night: { top: '#04050d', mid: '#0d1126', low: '#1a1e3a', glow: '#3a2440' },
};

export function buildSky() {
  const skyC = new Container();
  const bands = new Graphics();
  skyC.addChild(bands);

  // 星星
  const starC = new Container();
  const stars = [];
  const starTex = starTexture();
  for (let i = 0; i < 120; i++) {
    const sp = new Sprite(starTex);
    sp.scale.set(Math.random() < 0.2 ? 3 : 2);
    sp.x = Math.random() * 4000 - 500;
    sp.y = Math.random() * 900;
    sp.alpha = 0.2 + Math.random() * 0.7;
    stars.push({ sp, phase: Math.random() * Math.PI * 2, base: sp.alpha });
    starC.addChild(sp);
  }
  skyC.addChild(starC);

  // 心愿星（金色，来自天台许愿）
  const wishC = new Container();
  skyC.addChild(wishC);

  // 月亮
  const moonGlow = new Graphics();
  const moon = pixelSprite(MOON, MOON_PAL, 5, 'moon');
  skyC.addChild(moonGlow);
  skyC.addChild(moon);

  // 云（程序生成像素云）
  const cloudC = new Container();
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = makeCloud();
    c.x = Math.random() * 3000 - 400;
    c.y = 60 + Math.random() * 620;
    c.alpha = 0.10 + Math.random() * 0.10;
    clouds.push({ sp: c, v: 0.06 + Math.random() * 0.12 });
    cloudC.addChild(c);
  }
  skyC.addChild(cloudC);

  refs = { skyC, bands, stars, starC, wishC, moonGlow, moon, clouds };
  redraw();
  // 已有的心愿恢复成星星
  (state().wishes || []).forEach(() => addWishStar(false));
  return skyC;
}

function starTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const g = cv.getContext('2d');
  g.fillStyle = '#dfe8ff'; g.fillRect(0, 0, 1, 1);
  const t = Texture.from(cv);
  t.source.scaleMode = 'nearest';
  return t;
}

function makeCloud() {
  const rows = 4 + Math.floor(Math.random() * 3);
  const w = 26 + Math.floor(Math.random() * 30);
  const grid = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    const inset = Math.floor(Math.abs(y - rows / 2) * (3 + Math.random() * 3));
    for (let x = 0; x < w; x++) {
      row += (x > inset && x < w - inset && Math.random() > 0.08) ? 'C' : '.';
    }
    grid.push(row);
  }
  return pixelSprite(grid, { C: '#aab4d8' }, 4);
}

const SKY_W = 3000;
const SKY_H = 1700;

export function redraw() {
  if (!refs) return;
  const vw = SKY_W;
  const vh = SKY_H;
  const n = nightness();
  const top = lerpColor(PAL.day.top, PAL.night.top, n);
  const mid = lerpColor(PAL.day.mid, PAL.night.mid, n);
  const low = lerpColor(PAL.day.low, PAL.night.low, n);
  const glow = lerpColor(PAL.day.glow, PAL.night.glow, n);

  const g = refs.bands;
  g.clear();
  const BANDS = 10;
  for (let i = 0; i < BANDS; i++) {
    const t = i / (BANDS - 1);
    let col;
    if (t < 0.5) col = lerpColor(numToHex(top), numToHex(mid), t * 2);
    else col = lerpColor(numToHex(mid), numToHex(low), (t - 0.5) * 2);
    g.rect(-200, (vh / BANDS) * i, vw + 400, vh / BANDS + 1).fill(col);
  }
  // 地平线暖光
  g.rect(-200, vh - 90, vw + 400, 90).fill({ color: glow, alpha: 0.5 });

  refs.starC.alpha = 0.25 + n * 0.75;
  refs.moon.alpha = 0.35 + n * 0.65;
  refs.moon.x = Math.min(window.innerWidth * 0.72, 1100);
  refs.moon.y = 90;
  refs.moonGlow.clear();
  refs.moonGlow.circle(refs.moon.x + 30, refs.moon.y + 30, 70).fill({ color: 0xf5e6b8, alpha: 0.05 + n * 0.05 });
  refs.moonGlow.circle(refs.moon.x + 30, refs.moon.y + 30, 110).fill({ color: 0xf5e6b8, alpha: 0.03 + n * 0.03 });
}

function numToHex(n) { return `#${n.toString(16).padStart(6, '0')}`; }

export function tickSky(dms) {
  if (!refs) return;
  const t = performance.now() / 1000;
  for (const s of refs.stars) {
    s.sp.alpha = s.base * (0.55 + 0.45 * Math.sin(t * 1.4 + s.phase));
  }
  for (const c of refs.clouds) {
    c.sp.x += c.v * dms * 0.06;
    if (c.sp.x > 3400) c.sp.x = -500;
  }
  // 心愿星脉动
  refs.wishC.children.forEach((w, i) => {
    w.alpha = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.7);
  });
}

/** 天台许愿 → 夜空多一颗金星 */
export function addWishStar(animate = true) {
  if (!refs) return;
  const grid = ['.Y.', 'YXY', '.Y.'];
  const sp = pixelSprite(grid, { Y: '#ffd97a', X: '#fff3d0' }, 3);
  sp.x = 100 + Math.random() * Math.max(window.innerWidth - 200, 600);
  sp.y = 40 + Math.random() * 320;
  refs.wishC.addChild(sp);
  if (animate) {
    sp.scale.set(9);
    sp.alpha = 0;
    const start = performance.now();
    const anim = () => {
      const p = Math.min(1, (performance.now() - start) / 900);
      sp.alpha = p;
      const sc = 9 - 6 * p;
      sp.scale.set(sc);
      if (p < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }
}

// ── 远景城市 ──
export function buildCity() {
  const c = new Container();
  const vw = 2400; // 固定宽度，避免隐藏/极小视口下城市残缺
  buildRow(c, vw, '#0d101d', 0, 0.0, 180, 300);
  buildRow(c, vw, '#151929', -8, 0.28, 120, 230);
  return c;
}

function buildRow(parent, vw, color, yOff, litChance, minH, maxH) {
  const g = new Graphics();
  let x = -400;
  while (x < vw + 300) {
    const w = 46 + Math.random() * 90;
    const h = minH + Math.random() * (maxH - minH);
    g.rect(x, -h + yOff, w, h).fill(color);
    // 天线
    if (Math.random() < 0.3) g.rect(x + w / 2, -h - 14 + yOff, 3, 14).fill(color);
    // 亮窗
    if (litChance > 0) {
      for (let wy = -h + 14 + yOff; wy < -20; wy += 16) {
        for (let wx = x + 7; wx < x + w - 8; wx += 13) {
          if (Math.random() < litChance * 0.35) {
            g.rect(wx, wy, 4, 5).fill({ color: 0xffca7a, alpha: 0.5 });
          }
        }
      }
    }
    x += w + 4 + Math.random() * 26;
  }
  parent.addChild(g);
}
