// 像素雨 + 偶发闪电（屏幕空间）
import { Graphics } from 'pixi.js';

let g = null;
let flash = null;
let drops = [];
let nextLightning = 0;
let flashAlpha = 0;

export function buildRain(fxLayer) {
  g = new Graphics();
  flash = new Graphics();
  fxLayer.addChild(g);
  fxLayer.addChild(flash);
  seed();
  scheduleLightning();
  window.addEventListener('resize', seed);
  return g;
}

function seed() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const count = Math.min(190, Math.floor(vw / 7));
  drops = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      x: Math.random() * (vw + 200) - 100,
      y: Math.random() * vh,
      len: 7 + Math.random() * 9,
      v: 620 + Math.random() * 480,
      a: 0.14 + Math.random() * 0.26,
    });
  }
}

function scheduleLightning() {
  nextLightning = performance.now() + 90000 + Math.random() * 150000;
}

export function tickRain(dms) {
  if (!g) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const dt = dms / 1000;
  g.clear();
  for (const d of drops) {
    d.y += d.v * dt;
    d.x -= d.v * dt * 0.13; // 风
    if (d.y > vh + 20) { d.y = -20 - Math.random() * 60; d.x = Math.random() * (vw + 200) - 60; }
    if (d.x < -40) d.x += vw + 80;
    g.rect(Math.round(d.x), Math.round(d.y), 1, Math.round(d.len)).fill({ color: 0x8a9cd0, alpha: d.a });
  }

  // 闪电
  const now = performance.now();
  if (now > nextLightning) {
    flashAlpha = 0.28;
    scheduleLightning();
  }
  if (flashAlpha > 0.003) {
    flash.clear();
    flash.rect(0, 0, vw, vh).fill({ color: 0xdde6ff, alpha: flashAlpha });
    flashAlpha *= Math.pow(0.988, dms);
  } else if (flashAlpha !== 0) {
    flash.clear();
    flashAlpha = 0;
  }
}
