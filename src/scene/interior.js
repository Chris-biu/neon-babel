// ═══════════════════════════════════════════════════════
// 塔内世界（侧视角室内）：天台 → 夜市 → 居民层 → 大堂 → 街机厅 → 水族层
// 玩家用 WASD 在其中行走，E 交互
// ═══════════════════════════════════════════════════════
import { Container, Graphics, Text } from 'pixi.js';
import {
  pixelSprite, pixelAnim, makeCharacter, makeFurniture,
  makeFish, makeJelly, CAT_FRAMES, CAT_PAL, shade, mixHex,
} from './pixels.js';
import { bus } from '../core/bus.js';
import { towerHeight } from '../core/clock.js';
import { scene } from './app.js';

/** 视锥剔除：楼层不在屏幕附近时跳过其动画（性能） */
function zoneVisible(f) {
  const vh = window.innerHeight / (scene.worldScale || 1);
  return f.top < scene.cam.y + vh + 240 && f.top + f.h > scene.cam.y - 240;
}
function zonedTick(f, fn) {
  tickFns.push(dms => { if (zoneVisible(f)) fn(dms); });
}

export const IW = 1360;          // 室内世界宽度
const WALL_L = 26, WALL_R = IW - 26;
export const ELEV = { x1: 52, x2: 158 }; // 电梯区
const tickFns = [];

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function label(str, opts = {}) {
  const t = new Text({
    text: str,
    style: {
      fontFamily: opts.serif ? '"Noto Serif SC","Source Han Serif SC","SimSun",serif'
        : (opts.mono ? '"Courier New",monospace' : '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif'),
      fontSize: opts.size || 13,
      fill: opts.fill ?? 0x8b93b8,
      fontWeight: opts.bold ? '700' : '400',
      letterSpacing: opts.ls ?? 2,
      align: 'center',
      dropShadow: opts.glow ? { color: opts.glowColor ?? opts.fill, blur: opts.glowBlur ?? 8, distance: 0, alpha: 0.9 } : false,
    },
  });
  t.roundPixels = true;
  if (opts.alpha != null) t.alpha = opts.alpha;
  return t;
}

export function buildInterior(worldLayer, { residents, vendors, gatekeeper }) {
  const root = new Container();
  worldLayer.addChild(root);

  const floors = [];      // {key,label,icon, top,h, ground}
  const interactables = []; // {floorKey, x, r, label, act, promptY?}
  const npcs = new Map();   // rid -> {c, sprite, door, zone, state, pace}
  let y = 300;

  const addFloor = (key, lbl, icon, h) => {
    const f = { key, label: lbl, icon, top: y, h, ground: y + h - 18, wy: y + h / 2 };
    floors.push(f);
    y += h;
    return f;
  };

  // ── 天台（露天） ──
  {
    const f = addFloor('rooftop', '天台', '🌙', 210);
    const c = new Container(); root.addChild(c);
    const g = new Graphics();
    g.rect(WALL_L - 10, f.ground, IW - 2 * WALL_L + 20, 18).fill(0x1a2138);
    g.rect(WALL_L - 10, f.ground, IW - 2 * WALL_L + 20, 4).fill(0x2a3355);
    for (let gx = WALL_L; gx <= WALL_R; gx += 16) g.rect(gx, f.ground - 30, 2, 30).fill(0x3a4466);
    g.rect(WALL_L - 10, f.ground - 32, IW - 2 * WALL_L + 20, 3).fill(0x4a5578);
    c.addChild(g);
    buildStringLights(c, WALL_L, f.ground - 78, WALL_R, ['#ffca7a', '#ff5f8f', '#4dd8ff', '#5fd4a2']);
    // 电梯机房
    elevatorShaft(c, f, '10F', true);
    // 心愿邮筒
    const box = pixelSprite(['.YYYY.', 'YYYYYY', 'YXXYYY', 'YYYYYY', 'YYYYYY', '.D..D.'], { Y: '#c9a227', X: '#0b0e1a', D: '#54422e' }, 4, 'wishbox');
    box.x = IW - 300; box.y = f.ground - box.height;
    c.addChild(box);
    const hint = label('✦ 心愿投递处', { size: 12, fill: 0xffd97a, glow: true, glowBlur: 6 });
    hint.x = box.x + box.width / 2 - hint.width / 2; hint.y = box.y - 24;
    c.addChild(hint);
    tickFns.push(() => { hint.alpha = 0.6 + 0.4 * Math.sin(performance.now() / 600); });
    interactables.push({ floorKey: 'rooftop', x: box.x + box.width / 2, r: 60, label: '许个心愿', act: () => bus.emit('wish:open') });
    // 望远镜
    const tele = pixelSprite(['......TT', '....TTTT', '..TTTT..', '..DD....', '..DD....', '.D..D...'], { T: '#8a93b8', D: '#3a4466' }, 3, 'telescope');
    tele.x = 420; tele.y = f.ground - tele.height;
    c.addChild(tele);
    interactables.push({ floorKey: 'rooftop', x: tele.x + 12, r: 52, label: '看看星星', act: () => bus.emit('ambient:line', 'rooftop') });
    // 长椅与猫
    const bench = pixelSprite(['WWWWWWWWWW', 'W........W', 'WWWWWWWWWW', 'D........D'], { W: '#7a5a3a', D: '#54422e' }, 3, 'bench');
    bench.x = 700; bench.y = f.ground - bench.height; c.addChild(bench);
    const cat = pixelAnim(CAT_FRAMES, CAT_PAL, 3, 0.02, 'roofcat');
    cat.x = 780; cat.y = f.ground - cat.height; c.addChild(cat);
    interactables.push({ floorKey: 'rooftop', x: 792, r: 46, label: '摸摸猫', act: () => bus.emit('cat:pet') });
    const p1 = makeFurniture('plant', 3); p1.x = 980; p1.y = f.ground - p1.height; c.addChild(p1);
    const t = label(`▲ 不夜塔 · 当前高度 ${towerHeight()} 层`, { size: 14, fill: 0xff5f8f, glow: true, glowBlur: 10, bold: true });
    t.x = IW / 2 - t.width / 2; t.y = f.top + 34; c.addChild(t);
  }

  // ── 夜市 9F ──
  {
    const f = addFloor('market', '不夜夜市', '🏮', 220);
    const c = interiorShell(root, f, 0x231b33, 0x2d2342);
    const sign = label('不 夜 夜 市', { size: 22, fill: 0xff9f43, serif: true, bold: true, glow: true, glowColor: 0xff7a1a, glowBlur: 12, ls: 8 });
    sign.x = IW / 2 - sign.width / 2; sign.y = f.top + 16; c.addChild(sign);
    tickFns.push(() => { sign.alpha = (performance.now() % 4700) < 130 ? 0.5 : 1; });
    buildStringLights(c, WALL_L + 140, f.top + 52, WALL_R - 20, ['#ffca7a', '#ff5f8f', '#5fd4a2', '#4dd8ff']);
    elevatorShaft(c, f, '9F');
    const stallW = 150;
    (vendors || []).slice(0, 6).forEach((v, i) => {
      const sx = 230 + i * (stallW + 34);
      const sg = new Graphics();
      sg.rect(sx, f.ground - 58, stallW, 46).fill(0x33284a);
      sg.rect(sx, f.ground - 58, stallW, 5).fill(0x453a5e);
      sg.rect(sx - 5, f.ground - 22, stallW + 10, 10).fill(0x54422e);
      const awnCol = v.color || '#ff9f43';
      for (let k = 0; k < Math.floor(stallW / 15); k++) sg.rect(sx + k * 15, f.ground - 76, 15, 16).fill(k % 2 === 0 ? awnCol : '#efe6d8');
      sg.rect(sx - 4, f.ground - 78, stallW + 8, 4).fill(shade(awnCol, -40));
      c.addChild(sg);
      const ven = makeCharacter(v.id, 'stand', 3, awnCol);
      ven.x = sx + stallW / 2 - ven.width / 2; ven.y = f.ground - 58 - ven.height + 16;
      c.addChild(ven);
      const nm = label(v.stall || v.name, { size: 12, fill: 0xf5e6c8, ls: 1 });
      nm.x = sx + stallW / 2 - nm.width / 2; nm.y = f.ground - 100; c.addChild(nm);
      steam(c, sx + 26, f.ground - 26, i, f);
      interactables.push({ floorKey: 'market', x: sx + stallW / 2, r: 76, label: `逛「${v.stall}」`, act: () => bus.emit('shop:open', i) });
    });
  }

  // ── 居民层 8F..2F ──
  const byFloor = new Map();
  for (const r of residents) {
    const fno = Math.min(8, Math.max(2, r.floor || 2));
    if (!byFloor.has(fno)) byFloor.set(fno, []);
    byFloor.get(fno).push(r);
  }
  for (let fno = 8; fno >= 2; fno--) {
    const rs = (byFloor.get(fno) || []).slice(0, 3);
    const f = addFloor(`f${fno}`, `${fno}F`, '🪟', 176);
    const c = interiorShell(root, f, 0x241c15, 0x2e241b, true);
    elevatorShaft(c, f, `${fno}F`);
    const fl = label(`${fno}F`, { size: 12, fill: 0x6a7398, mono: true });
    fl.x = ELEV.x2 + 22; fl.y = f.top + 20; c.addChild(fl);
    const doorXs = [340, 660, 980];
    const r = rng('floor' + fno);
    for (let i = 0; i < 3; i++) {
      const res = rs[i];
      const dx = doorXs[i];
      if (res) buildDoorWithNpc(c, f, dx, res, npcs, interactables);
      else buildSpareDoor(c, f, dx, r);
      if (i < 2) corridorWindow(c, f, dx + 190);
    }
    // 走廊杂物
    if (r() < 0.6) { const p = makeFurniture('plant', 3); p.x = 240 + r() * 60; p.y = f.ground - p.height; c.addChild(p); }
    if (r() < 0.3) { const cat = pixelAnim(CAT_FRAMES, CAT_PAL, 3, 0.02, 'cat' + fno); cat.x = 1150; cat.y = f.ground - cat.height; c.addChild(cat); }
  }

  // ── 大堂 1F ──
  {
    const f = addFloor('lobby', '大堂', '🚪', 220);
    const c = interiorShell(root, f, 0x1e1c30, 0x282544);
    elevatorShaft(c, f, '1F');
    const plaque = label('不 夜 塔', { size: 24, fill: 0xffd97a, serif: true, bold: true, glow: true, glowColor: 0xffb84d, glowBlur: 14, ls: 10 });
    plaque.x = IW / 2 - plaque.width / 2; plaque.y = f.top + 18; c.addChild(plaque);
    // 前台
    const g = new Graphics();
    g.rect(520, f.ground - 64, 300, 52).fill(0x3a2f52);
    g.rect(520, f.ground - 64, 300, 6).fill(0x4d3f6b);
    g.rect(516, f.ground - 14, 308, 6).fill(0x54422e);
    c.addChild(g);
    // 守门人：前台上的一盏眼灯
    const eyeFrames = [
      ['..EEEE..', '.EWWWWE.', 'EWWIIWWE', 'EWWIIWWE', '.EWWWWE.', '..EEEE..'],
      ['..EEEE..', '.EEEEEE.', 'EEEEEEEE', 'EEEEEEEE', '.EEEEEE.', '..EEEE..'],
    ];
    const eye = pixelAnim(eyeFrames, { E: '#2a3355', W: '#9fe8ff', I: '#0e5b78' }, 4, 0.004, 'gate-eye');
    eye.x = 646; eye.y = f.ground - 64 - eye.height - 6;
    c.addChild(eye);
    const nm = label(`门房 · ${gatekeeper?.name || '九千岁'}`, { size: 12, fill: 0x9fe8ff, ls: 1 });
    nm.x = 670 - nm.width / 2; nm.y = f.ground - 130; c.addChild(nm);
    interactables.push({ floorKey: 'lobby', x: 670, r: 90, label: '和门房聊聊', act: () => bus.emit('gate:talk') });
    // 大门
    const door = new Graphics();
    door.rect(IW - 250, f.ground - 130, 130, 118).fill({ color: 0xffca7a, alpha: 0.8 });
    door.rect(IW - 250 + 62, f.ground - 130, 6, 118).fill(0x352e48);
    door.rect(IW - 258, f.ground - 138, 146, 8).fill(0x352e48);
    c.addChild(door);
    interactables.push({ floorKey: 'lobby', x: IW - 185, r: 80, label: '推门出去', act: () => bus.emit('exit:door') });
    // 委托板（信箱墙旁）
    const qb = label('📌 委托板', { size: 12, fill: 0xffd97a, glow: true, glowBlur: 5 });
    qb.x = 300 - qb.width / 2; qb.y = f.top + 52; c.addChild(qb);
    interactables.push({ floorKey: 'lobby', x: 300, r: 90, label: '看看今天的委托', act: () => bus.emit('quests:open') });
    // 信箱墙
    const mail = new Graphics();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
      mail.rect(230 + j * 26, f.top + 78 + i * 24, 22, 20).fill(0x2a3145);
      mail.rect(232 + j * 26, f.top + 80 + i * 24, 18, 4).fill(0x3a4466);
    }
    c.addChild(mail);
    interactables.push({ floorKey: 'lobby', x: 295, r: 70, label: '翻翻信箱', act: () => bus.emit('mail:open') });
    // 灯笼
    for (const lx of [480, 840]) {
      const lantern = pixelSprite(['..D..', '.RRR.', 'RRRRR', 'RRRRR', 'RXRRR', '.RRR.', '..Y..'], { D: '#54422e', R: '#c0392b', X: '#ff7a6a', Y: '#ffd97a' }, 4, 'lantern');
      lantern.x = lx; lantern.y = f.top + 60; c.addChild(lantern);
      tickFns.push(() => { lantern.rotation = Math.sin(performance.now() / 900 + lx) * 0.05; });
    }
    const cat = pixelAnim(CAT_FRAMES, CAT_PAL, 3, 0.015, 'lobbycat');
    cat.x = 940; cat.y = f.ground - cat.height; c.addChild(cat);
    interactables.push({ floorKey: 'lobby', x: 952, r: 46, label: '摸摸猫', act: () => bus.emit('cat:pet') });
  }

  // ── 街机厅 B1 ──
  {
    const f = addFloor('arcade', '街机厅', '🕹', 200);
    const c = interiorShell(root, f, 0x171230, 0x201a40);
    elevatorShaft(c, f, 'B1');
    const sign = label('街 机 厅', { size: 21, fill: 0xff5f8f, bold: true, glow: true, glowColor: 0xff2d78, glowBlur: 14, ls: 9 });
    sign.x = IW / 2 - sign.width / 2; sign.y = f.top + 16; c.addChild(sign);
    const sub = label('INSERT COIN ▶', { size: 11, fill: 0x4dd8ff, glow: true, glowBlur: 6, ls: 3, mono: true });
    sub.x = IW / 2 - sub.width / 2; sub.y = f.top + 46; c.addChild(sub);
    tickFns.push(() => {
      const t = performance.now();
      sub.alpha = (t % 1400) < 800 ? 1 : 0.15;
      sign.alpha = (t % 6100) < 90 ? 0.4 : 1;
    });
    const GAME_DEFS = [
      { id: 'stars', name: '霓虹接星', col: '#ff5f8f' },
      { id: 'memory', name: '记忆灯窗', col: '#4dd8ff' },
      { id: 'fishing', name: '深渊垂钓', col: '#5fd4a2' },
    ];
    GAME_DEFS.forEach((gd, i) => {
      const cx = 380 + i * 240;
      const cg = new Graphics();
      cg.rect(cx, f.ground - 100, 84, 100).fill(0x241c40);
      cg.rect(cx, f.ground - 100, 84, 8).fill(shade(gd.col, -40));
      cg.rect(cx + 10, f.ground - 86, 64, 40).fill(0x0b0e1a);
      cg.rect(cx + 8, f.ground - 38, 68, 10).fill(0x352e58);
      cg.circle(cx + 26, f.ground - 32, 4).fill(0xefe6d8);
      cg.circle(cx + 44, f.ground - 32, 4).fill(gd.col);
      c.addChild(cg);
      const screen = new Graphics();
      c.addChild(screen);
      zonedTick(f, () => {
        const t = performance.now() / 1000;
        screen.clear();
        screen.rect(cx + 10, f.ground - 86, 64, 40).fill({ color: gd.col, alpha: 0.22 + 0.18 * Math.sin(t * (1.3 + i * 0.4) + i * 2) });
      });
      const nm = label(gd.name, { size: 12, fill: 0xdfe4f5, ls: 1 });
      nm.x = cx + 42 - nm.width / 2; nm.y = f.ground - 122; c.addChild(nm);
      interactables.push({ floorKey: 'arcade', x: cx + 42, r: 62, label: `玩「${gd.name}」`, act: () => bus.emit('arcade:play', gd.id) });
    });
  }

  // ── 水族层 B2 ──
  {
    const f = addFloor('aquarium', '深渊水族层', '🐟', 210);
    const c = interiorShell(root, f, 0x0e1a2e, 0x122238);
    elevatorShaft(c, f, 'B2');
    const t = label('深 渊 水 族 层', { size: 16, fill: 0x4dd8ff, serif: true, glow: true, glowBlur: 10, ls: 7 });
    t.x = IW / 2 - t.width / 2; t.y = f.top + 14; c.addChild(t);
    // 玻璃海墙
    const gx = 260, gw = IW - 320, gy = f.top + 44, gh = f.ground - gy - 8;
    const g = new Graphics();
    g.rect(gx - 6, gy - 6, gw + 12, gh + 12).fill(0x2a3355);
    g.rect(gx, gy, gw, gh).fill(0x0c2438);
    g.rect(gx, gy, gw, 10).fill({ color: 0x4dd8ff, alpha: 0.12 });
    c.addChild(g);
    const sea = new Container(); c.addChild(sea);
    const cols = ['#4dd8ff', '#5fd4a2', '#ff9f43', '#a78bfa', '#ff5f8f', '#f5e6b8'];
    const fishes = [];
    for (let i = 0; i < 10; i++) {
      const fp = makeFish(cols[i % cols.length], i % 3 === 0 ? 3 : 2, 'i' + i);
      fp.x = gx + Math.random() * (gw - 60); fp.y = gy + 16 + Math.random() * (gh - 40);
      const dir = Math.random() < 0.5 ? 1 : -1;
      fp.scale.x = -Math.abs(fp.scale.x) * dir;
      fishes.push({ sp: fp, v: (0.008 + Math.random() * 0.02) * dir, phase: Math.random() * 6 });
      sea.addChild(fp);
    }
    const jl = makeJelly('#a78bfa', 2, 'i'); jl.x = gx + gw / 2; jl.y = gy + gh - 40; jl.alpha = 0.75; sea.addChild(jl);
    zonedTick(f, dms => {
      const now = performance.now() / 1000;
      for (const fo of fishes) {
        fo.sp.x += fo.v * dms;
        fo.sp.y += Math.sin(now * 1.2 + fo.phase) * 0.08;
        if (fo.sp.x > gx + gw - 44 && fo.v > 0) { fo.v *= -1; fo.sp.scale.x *= -1; }
        if (fo.sp.x < gx + 6 && fo.v < 0) { fo.v *= -1; fo.sp.scale.x *= -1; }
      }
      jl.y -= 0.004 * dms;
      if (jl.y < gy + 16) jl.y = gy + gh - 24;
    });
    // 垂钓位
    const stool = new Graphics();
    stool.rect(180, f.ground - 22, 30, 8).fill(0x54422e);
    stool.rect(184, f.ground - 14, 5, 14).fill(0x3a2c1e);
    stool.rect(201, f.ground - 14, 5, 14).fill(0x3a2c1e);
    c.addChild(stool);
    interactables.push({ floorKey: 'aquarium', x: 195, r: 66, label: '坐下垂钓', act: () => bus.emit('fishing:open') });
    const dexSign = label('📖 鱼类图鉴', { size: 11, fill: 0x9fd8ff, ls: 1 });
    dexSign.x = 100; dexSign.y = f.ground - 60;
    c.addChild(dexSign);
    interactables.push({ floorKey: 'aquarium', x: 115, r: 56, label: '翻翻鱼类图鉴', act: () => bus.emit('dex:open') });
  }

  const totalH = y + 80;

  const api = {
    IW, floors, interactables, totalH,
    nav: floors.map(f => ({ key: f.key, label: f.label, icon: f.icon, wy: f.wy })),
    getWindowPos(rid) {
      const n = npcs.get(rid);
      if (!n || !n.visible) return null;
      return { x: n.sprite.x + 18, y: n.floor.ground - 62 };
    },
    setResidentState(rid, { activity = '', present = true, sleeping = false } = {}) {
      const n = npcs.get(rid);
      if (!n) return;
      n.activity = activity;
      n.visible = present && !sleeping;
      n.present = present; n.sleeping = sleeping;
      n.sprite.visible = n.visible;
      if (n.shadow) n.shadow.visible = n.visible;
      n.doorLight.alpha = present ? (sleeping ? 0.18 : 0.8) : 0.06;
    },
    npcState(rid) { return npcs.get(rid); },
    tick(dms) {
      for (const fn of tickFns) fn(dms);
      // NPC 踱步
      for (const n of npcs.values()) {
        if (!n.visible) continue;
        n.sprite.x += n.dir * dms * 0.016;
        if (n.sprite.x > n.zone[1]) { n.dir = -1; n.sprite.scale.x = -3; }
        if (n.sprite.x < n.zone[0]) { n.dir = 1; n.sprite.scale.x = 3; }
        if (n.shadow) n.shadow.x = n.sprite.x + (n.dir < 0 ? -18 : 18);
      }
    },
  };
  return api;
}

// ── 楼层外壳：背景墙 + 地板 + 吊灯 ──
function interiorShell(root, f, wallCol, wallLit, wood = false) {
  const c = new Container();
  root.addChild(c);
  const g = new Graphics();
  g.rect(WALL_L - 12, f.top, IW - 2 * WALL_L + 24, f.h).fill(wallCol);
  // 护墙板
  g.rect(WALL_L - 12, f.ground - 34, IW - 2 * WALL_L + 24, 16).fill(shade6(wallCol, -8));
  // 地板
  g.rect(WALL_L - 12, f.ground, IW - 2 * WALL_L + 24, 18).fill(wood ? 0x3a2c1e : 0x232038);
  g.rect(WALL_L - 12, f.ground, IW - 2 * WALL_L + 24, 3).fill(wood ? 0x4d3a27 : 0x323050);
  // 天花板
  g.rect(WALL_L - 12, f.top, IW - 2 * WALL_L + 24, 8).fill(0x121020);
  c.addChild(g);
  // 吊灯与光池
  for (let lx = 300; lx < IW - 120; lx += 380) {
    const lamp = new Graphics();
    lamp.rect(lx - 1, f.top + 8, 3, 16).fill(0x2a2438);
    lamp.moveTo(lx - 10, f.top + 34).lineTo(lx + 12, f.top + 34).lineTo(lx + 7, f.top + 24).lineTo(lx - 5, f.top + 24).closePath();
    lamp.fill(0xd9a441);
    lamp.circle(lx + 1, f.top + 38, 5).fill({ color: 0xffe9b0, alpha: 0.95 });
    c.addChild(lamp);
    // 光锥两段色阶化（贴近像素抖动质感）
    const pool = new Graphics();
    pool.moveTo(lx - 16, f.top + 38).lineTo(lx + 18, f.top + 38).lineTo(lx + 66, f.ground).lineTo(lx - 64, f.ground).closePath();
    pool.fill({ color: 0xffca7a, alpha: 0.035 });
    pool.moveTo(lx - 9, f.top + 38).lineTo(lx + 11, f.top + 38).lineTo(lx + 38, f.ground).lineTo(lx - 36, f.ground).closePath();
    pool.fill({ color: 0xffca7a, alpha: 0.04 });
    pool.rect(lx - 64, f.ground, 130, 4).fill({ color: 0xffca7a, alpha: 0.07 });
    pool.rect(lx - 44, f.ground + 4, 90, 3).fill({ color: 0xffca7a, alpha: 0.05 });
    c.addChild(pool);
  }
  return c;
}

function shade6(numCol, amt) {
  const hex = `#${numCol.toString(16).padStart(6, '0')}`;
  return shade(hex, amt);
}

// ── 电梯井 ──
function elevatorShaft(c, f, floorLabel, machine = false) {
  const g = new Graphics();
  const x1 = ELEV.x1 - 14, w = ELEV.x2 - ELEV.x1 + 28;
  g.rect(x1, f.top + (machine ? 40 : 8), w, f.ground - f.top - (machine ? 40 : 8)).fill(0x161426);
  // 电梯门
  const dh = 104;
  g.rect(ELEV.x1, f.ground - dh, ELEV.x2 - ELEV.x1, dh).fill(0x2c2a4a);
  g.rect(ELEV.x1 + (ELEV.x2 - ELEV.x1) / 2 - 2, f.ground - dh, 4, dh).fill(0x161426);
  g.rect(ELEV.x1 - 6, f.ground - dh - 8, ELEV.x2 - ELEV.x1 + 12, 8).fill(0x3a3860);
  c.addChild(g);
  const ind = label(`▲ ${floorLabel} ▼`, { size: 11, fill: 0xffca7a, glow: true, glowBlur: 5, mono: true });
  ind.x = (ELEV.x1 + ELEV.x2) / 2 - ind.width / 2;
  ind.y = f.ground - dh - 30;
  c.addChild(ind);
}

// ── 居民房门 + NPC ──
function buildDoorWithNpc(c, f, dx, res, npcs, interactables) {
  const g = new Graphics();
  const dw = 78, dh = 112;
  g.rect(dx - 8, f.ground - dh - 8, dw + 16, dh + 8).fill(0x1a1510);
  g.rect(dx, f.ground - dh, dw, dh).fill(mixHex('#4a3826', res.color || '#c9a05f', 0.14));
  g.rect(dx + 6, f.ground - dh + 8, dw - 12, dh - 40).fill({ color: 0x000000, alpha: 0.12 });
  g.circle(dx + dw - 12, f.ground - 52, 3).fill(0xc9a227);
  c.addChild(g);
  // 门缝暖光
  const doorLight = new Graphics();
  doorLight.rect(dx, f.ground - 4, dw, 4).fill({ color: 0xffca7a, alpha: 0.8 });
  c.addChild(doorLight);
  // 门牌
  const plate = label(`${res.emoji} ${res.name}`, { size: 12, fill: 0xc8cfe8, ls: 1 });
  plate.x = dx + dw / 2 - plate.width / 2;
  plate.y = f.ground - dh - 26;
  c.addChild(plate);
  // NPC（清醒时在走廊踱步）
  const npcShadow = new Graphics();
  npcShadow.ellipse(0, 0, 15, 4).fill({ color: 0x000000, alpha: 0.28 });
  npcShadow.y = f.ground - 2;
  c.addChild(npcShadow);
  const sprite = makeCharacter(res.id, 'walk', 3, res.color);
  sprite.x = dx + dw + 24;
  sprite.y = f.ground - sprite.height;
  c.addChild(sprite);
  npcs.set(res.id, {
    sprite, shadow: npcShadow, floor: f, doorLight,
    zone: [Math.max(ELEV.x2 + 30, dx - 110), Math.min(IW - 80, dx + dw + 130)],
    dir: 1, visible: true, present: true, sleeping: false, activity: '',
  });
  interactables.push({
    floorKey: f.key, x: dx + dw / 2, r: 150,
    labelFn: () => {
      const n = npcs.get(res.id);
      if (n && n.visible) return `和 ${res.name} 聊聊`;
      return `敲 ${res.name} 的门`;
    },
    act: () => bus.emit('resident:open', res.id),
  });
}

function buildSpareDoor(c, f, dx, r) {
  const g = new Graphics();
  const dw = 78, dh = 112;
  g.rect(dx - 8, f.ground - dh - 8, dw + 16, dh + 8).fill(0x1a1510);
  g.rect(dx, f.ground - dh, dw, dh).fill(0x3a3245);
  g.circle(dx + dw - 12, f.ground - 52, 3).fill(0x6a7398);
  c.addChild(g);
  const t = label(r() < 0.5 ? '空 房 · 待 租' : '住户外出中', { size: 11, fill: 0x6a7398, ls: 2 });
  t.x = dx + dw / 2 - t.width / 2; t.y = f.ground - dh - 26; t.alpha = 0.7;
  c.addChild(t);
}

// ── 走廊窗（看得见外面的雨） ──
function corridorWindow(c, f, wx) {
  const g = new Graphics();
  const ww = 96, wh = 78, wy = f.ground - 150;
  g.rect(wx - 4, wy - 4, ww + 8, wh + 8).fill(0x1a1626);
  g.rect(wx, wy, ww, wh).fill(0x0d1120);
  // 城市微光
  for (let i = 0; i < 7; i++) {
    g.rect(wx + 8 + (i * 37) % (ww - 16), wy + 14 + (i * 23) % (wh - 24), 4, 5).fill({ color: 0xffca7a, alpha: 0.28 });
  }
  // 雨痕
  for (let i = 0; i < 6; i++) {
    g.rect(wx + 10 + i * 15, wy + 6 + (i % 3) * 8, 1, 14).fill({ color: 0x8a9cd0, alpha: 0.3 });
  }
  g.rect(wx + ww / 2 - 2, wy, 4, wh).fill(0x1a1626);
  g.rect(wx, wy + wh / 2 - 2, ww, 4).fill(0x1a1626);
  c.addChild(g);
}

// ── 灯串 ──
function buildStringLights(parent, x1, y, x2, colors) {
  const c = new Container();
  const wire = new Graphics();
  wire.moveTo(x1, y);
  const span = x2 - x1;
  const segs = Math.floor(span / 26);
  for (let i = 1; i <= segs; i++) wire.lineTo(x1 + (span / segs) * i, y + (i % 2 === 0 ? 0 : 5));
  wire.stroke({ width: 1, color: 0x3a4466, alpha: 0.8 });
  c.addChild(wire);
  const dots = [];
  for (let i = 0; i <= segs; i++) {
    const d = new Graphics();
    d.rect(0, 0, 4, 4).fill(colors[i % colors.length]);
    d.x = x1 + (span / segs) * i - 2;
    d.y = y + (i % 2 === 0 ? 1 : 6);
    dots.push({ sp: d, phase: i * 0.9 });
    c.addChild(d);
  }
  tickFns.push(() => {
    const t = performance.now() / 1000;
    for (const d of dots) d.sp.alpha = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.2 + d.phase));
  });
  parent.addChild(c);
}

// ── 摊位蒸汽 ──
function steam(c, x, y, seed, f = null) {
  const s = new Graphics();
  c.addChild(s);
  const reg = f ? fn => zonedTick(f, fn) : fn => tickFns.push(fn);
  reg(() => {
    const t = performance.now() / 1000 + seed;
    s.clear();
    for (let k = 0; k < 3; k++) {
      const p = ((t * 0.4 + k * 0.33) % 1);
      s.circle(x + k * 8 + Math.sin(t * 2 + k) * 3, y - p * 32, 2.4 - p * 1.5).fill({ color: 0xffffff, alpha: 0.28 * (1 - p) });
    }
  });
}
