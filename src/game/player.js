// 玩家控制器：WASD 移动 · 电梯上下楼 · E 交互 · 摄像机跟随
import { Container } from 'pixi.js';
import { makeCharacter } from '../scene/pixels.js';
import { scene, worldToScreen, setFollow } from '../scene/app.js';
import { IW, ELEV } from '../scene/interior.js';
import { bus } from '../core/bus.js';
import { state, addCoins } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { toast } from '../ui/hud.js';
import { FLOORS_FLAVOR } from '../data/world.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
let P = null;
const keys = {};

export function spawnPlayer(worldLayer, api, startKey = 'lobby') {
  const pid = 'player-' + (state().name || '夜行者');
  const walk = makeCharacter(pid, 'walk', 3);
  const stand = makeCharacter(pid, 'stand', 3);
  const c = new Container();
  c.addChild(stand); c.addChild(walk);
  walk.visible = false;
  worldLayer.addChild(c);

  const fi = Math.max(0, api.floors.findIndex(f => f.key === startKey));
  P = {
    api, c, walk, stand,
    x: ELEV.x2 + 90, fi,
    dir: 1, moving: false,
    elevCd: 0, interCd: 0,
    prompt: makePrompt(),
    nearest: null,
  };
  place(true);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // 电梯直达（左侧导航）
  bus.on('elevator:go', key => {
    const idx = api.floors.findIndex(f => f.key === key);
    if (idx < 0) return;
    P.fi = idx;
    P.x = ELEV.x2 + 60;
    sfx.open();
    place(true);
    toast(`🛗 电梯到达 ${api.floors[idx].label}`);
  });

  bus.on('exit:door', () => {
    sfx.knock();
    toast('🌧 门房：「外面雨大得能砸出乒乓声，今晚就别出去了。」');
  });
  bus.on('ambient:line', key => {
    const fv = FLOORS_FLAVOR.find(x => x.key === key);
    if (fv?.ambient_lines?.length) toast(`✨ ${pick(fv.ambient_lines)}`);
  });
  let petCount = 0;
  bus.on('cat:pet', () => {
    sfx.chime();
    petCount += 1;
    if (petCount % 5 === 0) { addCoins(3, '· 猫的小费'); toast('🐈 猫恩准了这次抚摸，并支付了小费'); }
    else toast(pick(['🐈 呼噜声功率：max', '🐈 它蹭了蹭你的裤脚', '🐈 猫看了你一眼，勉强让摸', '🐈 尾巴卷住了你的手腕']));
  });
  return P;
}

/** 虚拟按键（移动端触屏用） */
export function vHold(k, down) { keys[k] = down; }
export function vTap(k) { onKeyDown({ key: k, target: null }); }

function makePrompt() {
  const el = document.createElement('div');
  el.className = 'interact-prompt hidden';
  document.body.appendChild(el);
  return el;
}

function onKeyDown(e) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!P) return;
  // 有面板打开时不响应世界操作
  if (document.querySelector('.modal-mask') || !document.getElementById('gate').classList.contains('hidden')) return;

  if ((k === 'e' || k === 'enter') && P.nearest && P.interCd <= 0) {
    P.interCd = 350;
    sfx.tap();
    P.nearest.act();
  }
  if ((k === 'w' || k === 'arrowup' || k === 's' || k === 'arrowdown')) {
    if (inElevator() && P.elevCd <= 0) {
      const up = (k === 'w' || k === 'arrowup');
      const ni = P.fi + (up ? -1 : 1);
      if (ni >= 0 && ni < P.api.floors.length) {
        P.fi = ni;
        P.elevCd = 380;
        sfx.open();
        place();
      } else {
        sfx.bad();
        toast(up ? '🛗 上面是施工层，电梯拒绝载客' : '🛗 已经到塔底了');
        P.elevCd = 380;
      }
    }
  }
}

function inElevator() {
  return P.x > ELEV.x1 - 10 && P.x < ELEV.x2 + 30;
}

function floor() { return P.api.floors[P.fi]; }

function place(instant = false) {
  const f = floor();
  P.c.x = Math.round(P.x - 18);
  P.c.y = Math.round(f.ground - 54);
  setFollow(P.x, f.top + f.h * 0.55, instant);
}

export function tickPlayer(dms) {
  if (!P) return;
  P.elevCd -= dms; P.interCd -= dms;
  const modalOpen = document.querySelector('.modal-mask') || !document.getElementById('gate')?.classList.contains('hidden');

  let vx = 0;
  if (!modalOpen) {
    if (keys['a'] || keys['arrowleft']) vx -= 1;
    if (keys['d'] || keys['arrowright']) vx += 1;
  }
  const wasMoving = P.moving;
  P.moving = vx !== 0;
  if (P.moving) {
    P.x += vx * dms * 0.32;
    P.x = Math.max(44, Math.min(IW - 56, P.x));
    if (vx !== 0) P.dir = vx;
  }
  if (P.moving !== wasMoving) {
    P.walk.visible = P.moving;
    P.stand.visible = !P.moving;
  }
  const sc = P.dir < 0 ? -3 : 3;
  P.walk.scale.x = sc; P.stand.scale.x = sc;
  if (P.dir < 0) { P.walk.x = 36; P.stand.x = 36; } else { P.walk.x = 0; P.stand.x = 0; }
  place();

  // 交互提示
  const f = floor();
  let best = null, bestD = Infinity;
  for (const it of P.api.interactables) {
    if (it.floorKey !== f.key) continue;
    const d = Math.abs(it.x - P.x);
    if (d < (it.r || 60) && d < bestD) { bestD = d; best = it; }
  }
  P.nearest = best;
  const el = P.prompt;
  if (modalOpen) { el.classList.add('hidden'); return; }
  if (best) {
    const lbl = best.labelFn ? best.labelFn() : best.label;
    el.innerHTML = `<b>E</b> ${lbl}`;
    el.classList.remove('hidden');
    const sp = worldToScreen(best.x, f.ground - 118);
    el.style.left = sp.x + 'px';
    el.style.top = sp.y + 'px';
  } else if (inElevator()) {
    el.innerHTML = `<b>W / S</b> 乘电梯上下楼`;
    el.classList.remove('hidden');
    const sp = worldToScreen((ELEV.x1 + ELEV.x2) / 2, f.ground - 150);
    el.style.left = sp.x + 'px';
    el.style.top = sp.y + 'px';
  } else {
    el.classList.add('hidden');
  }
}
