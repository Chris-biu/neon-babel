// PixiJS 应用与摄像机（支持两种模式：自由卷轴 / 跟随玩家）
import { Application, Container } from 'pixi.js';
import { bus } from '../core/bus.js';

export const scene = {
  app: null,
  layers: {},
  cam: { x: 0, tx: 0, y: 0, target: 0, max: 1000, maxX: 0 },
  worldScale: 1,
  towerW: 640,      // 自由模式下居中的世界宽度
  worldW: 1360,     // 跟随模式下的世界总宽
  totalH: 3000,
  followMode: false,
  dragging: false,
  wasDrag: false,
};

export async function createApp() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x0b0e1a,
    antialias: false,
    roundPixels: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('stage').appendChild(app.canvas);
  scene.app = app;

  for (const name of ['sky', 'far', 'world', 'fx']) {
    const c = new Container();
    scene.layers[name] = c;
    app.stage.addChild(c);
  }

  bindInput(app);
  app.ticker.add(t => update(t.deltaMS));
  window.addEventListener('resize', () => layout());
  layout();
  return app;
}

export function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.max(0.5, Math.min(1, vw / 900));
  scene.worldScale = s;
  const world = scene.layers.world;
  world.scale.set(s);
  scene.cam.max = Math.max(0, scene.totalH - vh / s);
  scene.cam.maxX = Math.max(0, scene.worldW - vw / s);
  clampCam();
  applyCam(true);
  bus.emit('layout', { vw, vh, s });
}

function clampCam() {
  const c = scene.cam;
  c.target = Math.max(0, Math.min(c.max, c.target));
  c.y = Math.max(0, Math.min(c.max, c.y));
  c.tx = Math.max(0, Math.min(c.maxX, c.tx));
  c.x = Math.max(0, Math.min(c.maxX, c.x));
}

function applyCam(force = false) {
  const { cam, layers, worldScale: s, followMode } = scene;
  const vw = window.innerWidth, vh = window.innerHeight;
  layers.world.y = Math.round(-cam.y * s);
  layers.world.x = followMode
    ? Math.round(-cam.x * s + Math.max(0, (vw - scene.worldW * s) / 2))
    : Math.round((vw - scene.towerW * s) / 2);
  const far = layers.far;
  far.y = Math.round(vh - 10 - (cam.max - cam.y) * 0.22 * s);
  far.x = followMode ? Math.round(-cam.x * s * 0.1 - 300) : 0;
  layers.sky.y = Math.round(-cam.y * 0.05 * s);
  if (force) bus.emit('camera', cam.y);
}

let lastEmit = 0;
function update(dms) {
  const { cam } = scene;
  const k = Math.min(1, dms * 0.009);
  const prevY = cam.y, prevX = cam.x;
  cam.y += (cam.target - cam.y) * k;
  cam.x += (cam.tx - cam.x) * k;
  if (Math.abs(cam.target - cam.y) < 0.4) cam.y = cam.target;
  if (Math.abs(cam.tx - cam.x) < 0.4) cam.x = cam.tx;
  if (cam.y !== prevY || cam.x !== prevX) {
    applyCam();
    const now = performance.now();
    if (now - lastEmit > 50) { lastEmit = now; bus.emit('camera', cam.y); }
  }
}

function bindInput(app) {
  const el = app.canvas;
  el.addEventListener('wheel', e => {
    if (scene.followMode) return;
    e.preventDefault();
    scene.cam.target += e.deltaY * 1.35 / scene.worldScale;
    clampCam();
  }, { passive: false });

  let startY = 0, startCam = 0, moved = 0;
  el.addEventListener('pointerdown', e => {
    if (scene.followMode) return;
    scene.dragging = true; scene.wasDrag = false;
    startY = e.clientY; startCam = scene.cam.target; moved = 0;
  });
  window.addEventListener('pointermove', e => {
    if (!scene.dragging || scene.followMode) return;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.abs(dy));
    if (moved > 7) scene.wasDrag = true;
    scene.cam.target = startCam - dy / scene.worldScale;
    clampCam();
  });
  window.addEventListener('pointerup', () => {
    if (!scene.dragging) return;
    scene.dragging = false;
    setTimeout(() => { scene.wasDrag = false; }, 60);
  });
}

/** 跟随模式：让摄像机对准世界坐标（玩家） */
export function setFollow(fx, fy, instant = false) {
  const { cam, worldScale: s } = scene;
  scene.followMode = true;
  const vw = window.innerWidth, vh = window.innerHeight;
  cam.tx = fx - vw / s / 2;
  cam.target = fy - vh / s / 2;
  clampCam();
  if (instant) { cam.x = cam.tx; cam.y = cam.target; applyCam(true); }
}

/** 平滑滚动到世界Y（自由模式用） */
export function scrollToWorldY(wy, instant = false) {
  const vh = window.innerHeight;
  scene.cam.target = Math.max(0, Math.min(scene.cam.max, wy - vh / scene.worldScale / 2));
  if (instant) { scene.cam.y = scene.cam.target; applyCam(true); }
}

/** 世界坐标 → 屏幕坐标 */
export function worldToScreen(wx, wy) {
  const s = scene.worldScale;
  return {
    x: scene.layers.world.x + wx * s,
    y: scene.layers.world.y + wy * s,
  };
}
