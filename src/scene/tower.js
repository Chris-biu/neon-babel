// ═══════════════════════════════════════════════════════
// 不夜塔 · 像素塔体
// 从上到下：塔吊/施工层 → 天台 → 夜市 → 居民层×7 → 大堂 → 街机厅 → 水族层
// ═══════════════════════════════════════════════════════
import { Container, Graphics, Text } from 'pixi.js';
import {
  pixelSprite, pixelAnim, makeCharacter, makeFurniture,
  makeFish, makeJelly, CAT_FRAMES, CAT_PAL, shade, mixHex,
} from './pixels.js';
import { scene } from './app.js';
import { bus } from '../core/bus.js';
import { towerHeight } from '../core/clock.js';

const BL = 60, BR = 580, BW = 520;   // 楼体左右边界
const H = {
  skyPad: 330, construction: 132, rooftop: 172, market: 205,
  res: 152, lobby: 225, arcade: 175, aquarium: 205, foundation: 80,
};

const tickFns = [];
let towerRefs = null;

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function label(str, opts = {}) {
  const t = new Text({
    text: str,
    style: {
      fontFamily: opts.serif
        ? '"Noto Serif SC","Source Han Serif SC","SimSun",serif'
        : (opts.mono ? '"Courier New",monospace' : '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif'),
      fontSize: opts.size || 13,
      fill: opts.fill || 0x8b93b8,
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

// ═══════ 主构建 ═══════
export function buildTower(worldLayer, { residents, vendors, gatekeeper }) {
  const tower = new Container();
  worldLayer.addChild(tower);
  const nav = [];
  const windowPos = new Map();   // rid -> {x, y}（世界坐标，窗中心）
  const roomRefs = new Map();    // rid -> 房间控制
  let y = H.skyPad;

  // —— 塔吊（天空区） ——
  buildCrane(tower, y);

  // —— 施工层 ×2 ——
  const consTop = y;
  buildConstruction(tower, y, 0); y += H.construction;
  buildConstruction(tower, y, 1); y += H.construction;
  nav.push({ key: 'construction', label: '塔顶施工', icon: '🏗', wy: consTop + H.construction });

  // —— 天台 ——
  buildRooftop(tower, y);
  nav.push({ key: 'rooftop', label: '天台', icon: '🌙', wy: y + H.rooftop / 2 });
  y += H.rooftop;

  // —— 夜市 ——
  buildMarket(tower, y, vendors);
  nav.push({ key: 'market', label: '不夜夜市', icon: '🏮', wy: y + H.market / 2 });
  y += H.market;

  // —— 居民层 8F → 2F ——
  const byFloor = new Map();
  for (const r of residents) {
    const f = Math.min(8, Math.max(2, r.floor || 2));
    if (!byFloor.has(f)) byFloor.set(f, []);
    if (byFloor.get(f).length < 3) byFloor.get(f).push(r);
    else { // 满了往上顺延
      for (let ff = 8; ff >= 2; ff--) {
        if ((byFloor.get(ff) || []).length < 3) { (byFloor.get(ff) || byFloor.set(ff, []).get(ff)).push(r); break; }
      }
    }
  }
  for (let f = 8; f >= 2; f--) {
    const rs = byFloor.get(f) || [];
    buildResidentialFloor(tower, y, f, rs, windowPos, roomRefs);
    nav.push({ key: `f${f}`, label: `${f}F`, icon: '🪟', wy: y + H.res / 2, names: rs.map(r => r.name).join('、') });
    y += H.res;
  }

  // —— 大堂 ——
  buildLobby(tower, y, gatekeeper);
  nav.push({ key: 'lobby', label: '大堂', icon: '🚪', wy: y + H.lobby / 2 });
  y += H.lobby;

  // —— 街机厅 ——
  buildArcade(tower, y);
  nav.push({ key: 'arcade', label: '街机厅', icon: '🕹', wy: y + H.arcade / 2 });
  y += H.arcade;

  // —— 水族层 ——
  buildAquarium(tower, y);
  nav.push({ key: 'aquarium', label: '水族层', icon: '🐟', wy: y + H.aquarium / 2 });
  y += H.aquarium;

  // —— 地基 ——
  const g = new Graphics();
  g.rect(BL - 26, y, BW + 52, H.foundation).fill(0x0d1020);
  g.rect(BL - 26, y, BW + 52, 8).fill(0x1a2138);
  tower.addChild(g);
  y += H.foundation;

  scene.totalH = y + 60;
  towerRefs = { tower, windowPos, roomRefs, nav };
  return {
    nav,
    getWindowPos: rid => windowPos.get(rid),
    setResidentState,
    knock: knockAnim,
    tick: tickTower,
  };
}

export function tickTower(dms) {
  for (const fn of tickFns) fn(dms);
}

// ═══════ 楼体通用 ═══════
function facade(parent, y, h, base = 0x1c2340) {
  const g = new Graphics();
  g.rect(BL, y, BW, h).fill(base);
  // 砖块肌理
  const r = rng('brick' + y);
  for (let i = 0; i < 46; i++) {
    const bx = BL + 6 + r() * (BW - 26);
    const by = y + 4 + r() * (h - 12);
    g.rect(Math.round(bx), Math.round(by), 10 + Math.round(r() * 8), 4).fill({ color: 0x000000, alpha: 0.12 + r() * 0.1 });
  }
  // 左右檐柱
  g.rect(BL, y, 12, h).fill(0x161c33);
  g.rect(BR - 12, y, 12, h).fill(0x161c33);
  // 层间横梁
  g.rect(BL - 8, y + h - 10, BW + 16, 10).fill(0x121729);
  g.rect(BL - 8, y + h - 10, BW + 16, 2).fill(0x2a3355);
  parent.addChild(g);
  return g;
}

function sideDetail(parent, y, h, seed) {
  // 空调外机 / 管线，增加生活感
  const r = rng('side' + seed);
  const g = new Graphics();
  if (r() < 0.7) {
    const ay = y + 20 + r() * (h - 60);
    g.rect(BR - 4, ay, 16, 12).fill(0x2a3145);
    g.rect(BR - 4, ay, 16, 3).fill(0x3a4466);
  }
  if (r() < 0.5) {
    g.rect(BL - 6, y, 3, h).fill({ color: 0x2a3145, alpha: 0.8 });
  }
  parent.addChild(g);
}

// ═══════ 塔吊 ═══════
function buildCrane(parent, roofY) {
  const c = new Container();
  const g = new Graphics();
  const cx = BL + 90;
  // 塔身桁架
  for (let i = 0; i < 9; i++) {
    const yy = roofY - 24 - i * 24;
    g.rect(cx, yy, 4, 24).fill(0x6a5a3a);
    g.rect(cx + 26, yy, 4, 24).fill(0x6a5a3a);
    g.moveTo(cx, yy + 24).lineTo(cx + 30, yy).stroke({ width: 2, color: 0x574a2f });
  }
  const armY = roofY - 24 - 9 * 24;
  // 臂
  g.rect(cx - 130, armY, 320, 6).fill(0x6a5a3a);
  g.rect(cx - 130, armY - 8, 320, 3).fill(0x574a2f);
  // 配重
  g.rect(cx + 160, armY + 6, 30, 18).fill(0x3a4466);
  c.addChild(g);
  // 吊钩（摆动）
  const hook = new Container();
  const hg = new Graphics();
  hg.rect(0, 0, 2, 64).fill(0x8b93b8);
  hg.rect(-5, 64, 12, 8).fill(0xc9a227);
  hook.addChild(hg);
  hook.x = cx - 96; hook.y = armY + 6;
  c.addChild(hook);
  // 警示灯
  const beacon = new Graphics();
  beacon.circle(cx + 15, armY - 14, 4).fill(0xff4d6d);
  c.addChild(beacon);
  parent.addChild(c);
  tickFns.push(() => {
    const t = performance.now() / 1000;
    hook.rotation = Math.sin(t * 0.7) * 0.06;
    beacon.alpha = 0.35 + 0.65 * (Math.sin(t * 2.4) > 0 ? 1 : 0.12);
  });
}

// ═══════ 施工层 ═══════
function buildConstruction(parent, y, idx) {
  const c = new Container();
  const g = new Graphics();
  const inset = 50;
  // 未完工核心筒
  g.rect(BL + inset, y + 12, BW - inset * 2, H.construction - 12).fill(0x181d33);
  // 脚手架
  const sTop = y + 4;
  for (let gx = BL + 14; gx <= BR - 14; gx += 42) {
    g.rect(gx, sTop, 3, H.construction - 4).fill(0x7a6a45);
  }
  for (let gy = sTop; gy < y + H.construction; gy += 34) {
    g.rect(BL + 12, gy, BW - 24, 3).fill(0x8a7850);
  }
  // 防护网
  g.rect(BL + 12, sTop, BW - 24, H.construction - 4).fill({ color: 0x2f6b5a, alpha: 0.13 });
  // 建材堆
  g.rect(BL + inset + 20, y + H.construction - 26, 40, 16).fill(0x54422e);
  g.rect(BL + inset + 26, y + H.construction - 34, 28, 8).fill(0x6a5a3a);
  c.addChild(g);

  if (idx === 0) {
    const heightSign = label(`▲ 当前高度 ${towerHeight()} 层`, { size: 15, fill: 0xff5f8f, glow: true, glowBlur: 10, bold: true });
    heightSign.x = BL + BW / 2 - heightSign.width / 2;
    heightSign.y = y + 26;
    c.addChild(heightSign);
    setInterval(() => { heightSign.text = `▲ 当前高度 ${towerHeight()} 层`; }, 60000);
    const sub = label('这座塔还在长高', { size: 10, fill: 0x8b93b8, ls: 4 });
    sub.x = BL + BW / 2 - sub.width / 2; sub.y = y + 52;
    c.addChild(sub);
  } else {
    // 施工中的工人
    const worker = makeCharacter('worker_' + idx, 'walk', 3, '#e0a340');
    worker.x = BL + 80; worker.y = y + H.construction - 64;
    c.addChild(worker);
    let dir = 1;
    tickFns.push(dms => {
      worker.x += dir * dms * 0.014;
      if (worker.x > BR - 120) { dir = -1; worker.scale.x = -3; worker.x = BR - 120; }
      if (worker.x < BL + 60) { dir = 1; worker.scale.x = 3; worker.x = BL + 60; }
    });
    const warn = label('⚠ 施工重地 · 塔还没想好这层放什么', { size: 11.5, fill: 0xc9a227, alpha: 0.85 });
    warn.x = BL + BW / 2 - warn.width / 2; warn.y = y + 18;
    c.addChild(warn);
  }
  parent.addChild(c);
}

// ═══════ 天台 ═══════
function buildRooftop(parent, y) {
  const c = new Container();
  const g = new Graphics();
  const floorY = y + H.rooftop - 22;
  // 露台地面与矮墙
  g.rect(BL - 14, floorY, BW + 28, 22).fill(0x1a2138);
  g.rect(BL - 14, floorY, BW + 28, 4).fill(0x2a3355);
  // 栏杆
  for (let gx = BL - 8; gx <= BR + 8; gx += 14) {
    g.rect(gx, floorY - 26, 2, 26).fill(0x3a4466);
  }
  g.rect(BL - 14, floorY - 28, BW + 28, 3).fill(0x4a5578);
  c.addChild(g);

  // 电梯机房（连接施工层与天台的剪影，免得塔身断层）
  const ph = new Graphics();
  ph.rect(BL + 50, y - 6, 128, floorY - y - 16).fill(0x181d33);
  ph.rect(BL + 50, y - 6, 128, 6).fill(0x2a3355);
  ph.rect(BL + 96, floorY - 52, 34, 30).fill({ color: 0xffca7a, alpha: 0.16 }); // 机房小窗
  c.addChild(ph);
  // 水塔
  const tank = new Graphics();
  tank.rect(BR - 120, floorY - 74, 52, 48).fill(0x2a3145);
  tank.rect(BR - 124, floorY - 78, 60, 6).fill(0x3a4466);
  tank.rect(BR - 104, floorY - 26, 4, 26).fill(0x1c2340);
  tank.rect(BR - 84, floorY - 26, 4, 26).fill(0x1c2340);
  c.addChild(tank);

  // 望远镜
  const tele = pixelSprite([
    '......TT',
    '....TTTT',
    '..TTTT..',
    '..DD....',
    '..DD....',
    '.D..D...',
  ], { T: '#8a93b8', D: '#3a4466' }, 3, 'telescope');
  tele.x = BL + 70; tele.y = floorY - 26 - tele.height;
  c.addChild(tele);

  // 长椅
  const bench = pixelSprite([
    'WWWWWWWWWW',
    'W........W',
    'WWWWWWWWWW',
    'D........D',
  ], { W: '#7a5a3a', D: '#54422e' }, 3, 'bench');
  bench.x = BL + 230; bench.y = floorY - bench.height;
  c.addChild(bench);

  // 盆栽
  const p1 = makeFurniture('plant', 3); p1.x = BL + 380; p1.y = floorY - p1.height; c.addChild(p1);
  const p2 = makeFurniture('plant', 3); p2.x = BR - 60; p2.y = floorY - p2.height; c.addChild(p2);

  // 天台猫
  const cat = pixelAnim(CAT_FRAMES, CAT_PAL, 3, 0.02, 'roofcat');
  cat.x = BL + 320; cat.y = floorY - cat.height;
  c.addChild(cat);

  // 灯串
  buildStringLights(c, BL - 8, floorY - 58, BR + 8, ['#ffca7a', '#ff5f8f', '#4dd8ff', '#5fd4a2']);

  // 心愿邮筒
  const box = pixelSprite([
    '.YYYY.',
    'YYYYYY',
    'YXXYYY',
    'YYYYYY',
    'YYYYYY',
    '.D..D.',
  ], { Y: '#c9a227', X: '#0b0e1a', D: '#54422e' }, 4, 'wishbox');
  box.x = BR - 140; box.y = floorY - box.height;
  c.addChild(box);
  const hint = label('✦ 心愿投递处', { size: 12, fill: 0xffd97a, glow: true, glowBlur: 6 });
  hint.x = box.x + box.width / 2 - hint.width / 2;
  hint.y = box.y - 22;
  c.addChild(hint);
  tickFns.push(() => { hint.alpha = 0.6 + 0.4 * Math.sin(performance.now() / 600); });

  makeHotspot(c, BL - 14, y + 60, BW + 28, H.rooftop - 60, {
    tip: '<b>10F · 天台</b><div class="tip-sub">离天空最近的地方 · 点击写下心愿</div>',
    onTap: () => bus.emit('wish:open'),
  });
  parent.addChild(c);
}

// ═══════ 夜市 ═══════
function buildMarket(parent, y, vendors) {
  const c = new Container();
  facade(c, y, H.market, 0x231d38);
  const floorY = y + H.market - 14;

  // 大招牌
  const sign = label('不 夜 夜 市', { size: 20, fill: 0xff9f43, serif: true, bold: true, glow: true, glowColor: 0xff7a1a, glowBlur: 12, ls: 8 });
  sign.x = BL + BW / 2 - sign.width / 2;
  sign.y = y + 12;
  c.addChild(sign);
  tickFns.push(() => {
    const t = performance.now();
    sign.alpha = (t % 4700) < 130 ? 0.5 : 1; // 招牌偶尔接触不良
  });

  // 灯串两道
  buildStringLights(c, BL + 10, y + 44, BR - 10, ['#ffca7a', '#ff5f8f', '#5fd4a2', '#4dd8ff']);

  // 摊位
  const stallW = 108;
  const startX = BL + 30;
  (vendors || []).slice(0, 4).forEach((v, i) => {
    const sx = startX + i * (stallW + 14);
    const st = new Container();
    const sg = new Graphics();
    // 摊身
    sg.rect(sx, floorY - 52, stallW, 40).fill(0x33284a);
    sg.rect(sx, floorY - 52, stallW, 5).fill(0x453a5e);
    // 台面
    sg.rect(sx - 4, floorY - 20, stallW + 8, 8).fill(0x54422e);
    // 雨棚（条纹）
    const awnCol = v.color || '#ff9f43';
    for (let k = 0; k < Math.floor(stallW / 14); k++) {
      sg.rect(sx + k * 14, floorY - 66, 14, 14).fill(k % 2 === 0 ? awnCol : '#efe6d8');
    }
    sg.rect(sx - 3, floorY - 68, stallW + 6, 4).fill(shade(awnCol, -40));
    st.addChild(sg);
    // 摊主
    const ven = makeCharacter(v.id, 'stand', 3, awnCol);
    ven.x = sx + stallW / 2 - ven.width / 2;
    ven.y = floorY - 52 - ven.height + 14;
    st.addChild(ven);
    // 摊名
    const nm = label(v.stall || v.name, { size: 11.5, fill: 0xf5e6c8, ls: 1 });
    nm.x = sx + stallW / 2 - nm.width / 2;
    nm.y = floorY - 88;
    st.addChild(nm);
    // 灶上热气
    const steam = new Graphics();
    st.addChild(steam);
    tickFns.push(() => {
      const t = performance.now() / 1000 + i;
      steam.clear();
      for (let s = 0; s < 3; s++) {
        const p = ((t * 0.4 + s * 0.33) % 1);
        steam.circle(sx + 22 + s * 8 + Math.sin(t * 2 + s) * 3, floorY - 24 - p * 30, 2.2 - p * 1.4)
          .fill({ color: 0xffffff, alpha: 0.28 * (1 - p) });
      }
    });
    c.addChild(st);
  });

  makeHotspot(c, BL, y + 40, BW, H.market - 40, {
    tip: '<b>9F · 不夜夜市</b><div class="tip-sub">深夜的胃和心都能在这里修好 · 点击逛摊</div>',
    onTap: () => bus.emit('shop:open'),
  });
  parent.addChild(c);
}

// ═══════ 居民层 ═══════
function buildResidentialFloor(parent, y, floorNo, residents, windowPos, roomRefs) {
  const c = new Container();
  facade(c, y, H.res);
  sideDetail(c, y, H.res, floorNo);

  const fl = label(`${floorNo}F`, { size: 11, fill: 0x4a5578, ls: 1, mono: true });
  fl.x = BL + 20; fl.y = y + 10;
  c.addChild(fl);

  const slots = [100, 250, 400];
  const r = rng('floor' + floorNo);
  for (let i = 0; i < 3; i++) {
    const wx = BL + slots[i];
    const wy = y + 34;
    const resident = residents[i];
    if (resident) {
      buildResidentWindow(c, wx, wy, resident, windowPos, roomRefs);
    } else {
      buildEmptyWindow(c, wx, wy, r);
    }
  }
  parent.addChild(c);
}

const WIN_W = 120, WIN_H = 96;

function buildResidentWindow(parent, wx, wy, res, windowPos, roomRefs) {
  const c = new Container();
  // 暖光晕（叠三层假辉光）
  const glow = new Graphics();
  glow.rect(wx - 14, wy - 12, WIN_W + 28, WIN_H + 24).fill({ color: 0xffca7a, alpha: 0.05 });
  glow.rect(wx - 7, wy - 6, WIN_W + 14, WIN_H + 12).fill({ color: 0xffca7a, alpha: 0.07 });
  glow.rect(wx - 3, wy - 3, WIN_W + 6, WIN_H + 6).fill({ color: 0xffca7a, alpha: 0.09 });
  c.addChild(glow);

  // 房间（墙色 = 住户主色轻染在暖木底色上，避免过饱和）
  const room = new Container();
  const bg = new Graphics();
  const wallCol = mixHex('#2b2119', res.color || '#c9a05f', 0.16);
  bg.rect(wx, wy, WIN_W, WIN_H).fill(wallCol);
  bg.rect(wx, wy, WIN_W, 24).fill(shade(wallCol, -14));              // 墙上部略暗
  bg.rect(wx, wy + WIN_H - 12, WIN_W, 12).fill('#3a2c1e');           // 木地板
  bg.rect(wx, wy + WIN_H - 12, WIN_W, 2).fill('#4d3a27');
  room.addChild(bg);

  // 家具（按住户种子布置）
  const r = rng('room' + res.id);
  const deco = new Container();
  room.addChild(deco);
  const furnSet = [];
  const wantsDesk = /写|播|稿|档|画|码|书|工作/.test(JSON.stringify(res.schedule || '')) || r() < 0.7;
  if (wantsDesk) furnSet.push(r() < 0.4 ? 'desk_pc' : 'desk');
  furnSet.push('bed');
  if (r() < 0.6) furnSet.push('shelf');
  if (r() < 0.55) furnSet.push('plant');
  if (r() < 0.3) furnSet.push('cat');
  if (r() < 0.35) furnSet.push('radio');

  // 落地家具贴地板线，壁挂家具贴墙
  const FLOOR_LINE = WIN_H - 12;
  const anchors = {
    desk: { x: 6, floor: true }, desk_pc: { x: 6, floor: true },
    bed: { x: 62, floor: true }, plant: { x: 98, floor: true },
    cat: { x: 70, floor: true }, lamp_floor: { x: 98, floor: true },
    shelf: { x: 80, y: 20 }, radio: { x: 8, y: 24 },
  };
  for (const kind of furnSet) {
    const f = makeFurniture(kind, 3);
    if (!f) continue;
    const a = anchors[kind] || { x: 8, floor: true };
    f.x = wx + a.x;
    f.y = a.floor ? wy + FLOOR_LINE - f.height : wy + a.y;
    deco.addChild(f);
  }
  // 住户角色
  const charSlot = new Container();
  room.addChild(charSlot);

  // 暖光罩（整屋一层暖色，盖在角色与家具之上）
  const warmWash = new Graphics();
  warmWash.rect(wx, wy, WIN_W, WIN_H).fill({ color: 0xffc06a, alpha: 0.1 });
  room.addChild(warmWash);

  // 窗帘（睡觉/外出时半掩）
  const curtain = new Graphics();
  curtain.rect(wx, wy, WIN_W, WIN_H).fill({ color: 0x0e1122, alpha: 0.0 });
  room.addChild(curtain);

  c.addChild(room);

  // 窗框
  const frame = new Graphics();
  frame.rect(wx - 4, wy - 4, WIN_W + 8, 4).fill(0x2a2438);
  frame.rect(wx - 4, wy + WIN_H, WIN_W + 8, 6).fill(0x352e48);   // 窗台
  frame.rect(wx - 4, wy, 4, WIN_H).fill(0x2a2438);
  frame.rect(wx + WIN_W, wy, 4, WIN_H).fill(0x2a2438);
  frame.rect(wx + WIN_W / 2 - 1, wy, 2, WIN_H).fill({ color: 0x2a2438, alpha: 0.7 });
  frame.rect(wx, wy + WIN_H / 2 - 1, WIN_W, 2).fill({ color: 0x2a2438, alpha: 0.7 });
  c.addChild(frame);

  // 门牌
  const tag = label(res.name, { size: 11.5, fill: 0x9aa3c8, ls: 1 });
  tag.x = wx + WIN_W / 2 - tag.width / 2;
  tag.y = wy + WIN_H + 8;
  tag.alpha = 0.75;
  c.addChild(tag);

  windowPos.set(res.id, { x: wx + WIN_W / 2, y: wy });

  const ref = {
    res, glow, curtain, charSlot, char: null, pose: null,
    baseX: wx, baseY: wy, container: c, paceDir: 1,
  };
  roomRefs.set(res.id, ref);
  setPose(ref, 'stand');

  makeHotspot(c, wx - 6, wy - 6, WIN_W + 12, WIN_H + 26, {
    tipFn: () => {
      const act = ref.currentActivity || '在家';
      return `<b>${res.emoji} ${res.name}</b> · ${res.occupation}<div class="tip-sub">此刻：${act} · 点击敲门</div>`;
    },
    onTap: () => bus.emit('resident:open', res.id),
  });

  parent.addChild(c);
}

function setPose(ref, pose) {
  if (ref.pose === pose && ref.char) return;
  ref.pose = pose;
  ref.charSlot.removeChildren();
  ref.char = null;
  if (pose === 'out') return;
  const ch = makeCharacter(ref.res.id, pose === 'pace' ? 'walk' : pose, 3, ref.res.color);
  const { baseX: wx, baseY: wy } = ref;
  if (pose === 'lie') { ch.x = wx + 56; ch.y = wy + WIN_H - 40; }
  else if (pose === 'sit') { ch.x = wx + 26; ch.y = wy + WIN_H - 12 - ch.height; }
  else { ch.x = wx + WIN_W / 2 - ch.width / 2; ch.y = wy + WIN_H - 12 - ch.height; }
  ref.char = ch;
  ref.charSlot.addChild(ch);
  if (pose === 'pace') {
    tickFns.push(dms => {
      if (ref.pose !== 'pace' || !ref.char) return;
      ref.char.x += ref.paceDir * dms * 0.008;
      if (ref.char.x > wx + WIN_W - 44) { ref.paceDir = -1; ref.char.scale.x = -3; }
      if (ref.char.x < wx + 10) { ref.paceDir = 1; ref.char.scale.x = 3; }
    });
  }
}

/** 引擎每小时/每次开面板时调用：更新窗户状态 */
function setResidentState(rid, { activity = '', present = true, sleeping = false } = {}) {
  const ref = towerRefs?.roomRefs.get(rid);
  if (!ref) return;
  ref.currentActivity = activity || (present ? '在家' : '外出中');
  if (!present) {
    setPose(ref, 'out');
    ref.curtain.alpha = 0.78;
    ref.glow.alpha = 0.15;
    return;
  }
  ref.curtain.alpha = sleeping ? 0.55 : 0;
  ref.glow.alpha = sleeping ? 0.25 : 1;
  if (sleeping) { setPose(ref, 'lie'); return; }
  if (/写|播|稿|整理|档|画|码|备|读|直播|工作|记|织/.test(activity)) setPose(ref, 'sit');
  else if (/走|踱|收拾|打扫|忙|做饭|练/.test(activity)) setPose(ref, 'pace');
  else setPose(ref, 'stand');
}

function knockAnim(rid) {
  const ref = towerRefs?.roomRefs.get(rid);
  if (!ref) return;
  const c = ref.container;
  const ox = c.x;
  let n = 0;
  const iv = setInterval(() => {
    c.x = ox + (n % 2 === 0 ? 2 : -2);
    if (++n > 5) { clearInterval(iv); c.x = ox; }
  }, 55);
}

function buildEmptyWindow(parent, wx, wy, r) {
  const c = new Container();
  const kind = r();
  const g = new Graphics();
  if (kind < 0.45) {
    // 拉着窗帘的暗窗
    g.rect(wx, wy, WIN_W, WIN_H).fill(0x11152a);
    g.rect(wx + 6, wy, WIN_W / 2 - 8, WIN_H).fill({ color: 0x1c2340, alpha: 0.9 });
    g.rect(wx + WIN_W / 2 + 2, wy, WIN_W / 2 - 8, WIN_H).fill({ color: 0x1c2340, alpha: 0.9 });
  } else if (kind < 0.8) {
    // 微光窗（有人但没故事）
    g.rect(wx, wy, WIN_W, WIN_H).fill(0x241f33);
    g.rect(wx + 14, wy + 20, 30, 40).fill({ color: 0xffca7a, alpha: 0.12 });
  } else {
    // 空置房 · 贴着招租
    g.rect(wx, wy, WIN_W, WIN_H).fill(0x0e1122);
  }
  const frame = new Graphics();
  frame.rect(wx - 4, wy - 4, WIN_W + 8, 4).fill(0x2a2438);
  frame.rect(wx - 4, wy + WIN_H, WIN_W + 8, 6).fill(0x352e48);
  frame.rect(wx - 4, wy, 4, WIN_H).fill(0x2a2438);
  frame.rect(wx + WIN_W, wy, 4, WIN_H).fill(0x2a2438);
  frame.rect(wx + WIN_W / 2 - 1, wy, 2, WIN_H).fill({ color: 0x2a2438, alpha: 0.7 });
  parent.addChild(c);
  c.addChild(g);
  c.addChild(frame);
  if (kind >= 0.8) {
    const t = label('待 租', { size: 11, fill: 0x8b93b8, ls: 4 });
    t.x = wx + WIN_W / 2 - t.width / 2;
    t.y = wy + WIN_H / 2 - 8;
    t.alpha = 0.5;
    c.addChild(t);
  }
}

// ═══════ 大堂 ═══════
function buildLobby(parent, y, gatekeeper) {
  const c = new Container();
  facade(c, y, H.lobby, 0x1e2038);
  const floorY = y + H.lobby - 10;

  // 台阶
  const g = new Graphics();
  g.rect(BL + 170, floorY - 10, 180, 5).fill(0x2a3355);
  g.rect(BL + 160, floorY - 5, 200, 5).fill(0x232c48);
  // 大门
  const doorW = 108, doorH = 118;
  const dx = BL + BW / 2 - doorW / 2, dy = floorY - 10 - doorH;
  g.rect(dx - 8, dy - 8, doorW + 16, doorH + 8).fill(0x352e48);
  g.rect(dx, dy, doorW, doorH).fill({ color: 0xffca7a, alpha: 0.85 });
  g.rect(dx + doorW / 2 - 2, dy, 4, doorH).fill(0x352e48);
  // 门内剪影层次
  g.rect(dx + 8, dy + 14, doorW - 16, doorH - 14).fill({ color: 0xffe1a8, alpha: 0.5 });
  c.addChild(g);

  // 门楣牌匾
  const plaque = label('不 夜 塔', { size: 22, fill: 0xffd97a, serif: true, bold: true, glow: true, glowColor: 0xffb84d, glowBlur: 14, ls: 10 });
  plaque.x = BL + BW / 2 - plaque.width / 2;
  plaque.y = dy - 44;
  c.addChild(plaque);

  // 守门人之眼（门上方，会眨）
  const eyeFrames = [
    ['..EEEE..', '.EWWWWE.', 'EWWIIWWE', 'EWWIIWWE', '.EWWWWE.', '..EEEE..'],
    ['..EEEE..', '.EEEEEE.', 'EEEEEEEE', 'EEEEEEEE', '.EEEEEE.', '..EEEE..'],
  ];
  const eye = pixelAnim(eyeFrames, { E: '#2a3355', W: '#9fe8ff', I: '#0e5b78' }, 3, 0.004, 'gate-eye');
  eye.x = BL + BW / 2 - eye.width / 2;
  eye.y = dy - 76;
  c.addChild(eye);

  // 灯笼一对
  for (const lx of [dx - 52, dx + doorW + 24]) {
    const lantern = pixelSprite([
      '..D..', '.RRR.', 'RRRRR', 'RRRRR', 'RXRRR', '.RRR.', '..Y..',
    ], { D: '#54422e', R: '#c0392b', X: '#ff7a6a', Y: '#ffd97a' }, 4, 'lantern');
    lantern.x = lx; lantern.y = dy + 8;
    c.addChild(lantern);
    tickFns.push(() => {
      lantern.rotation = Math.sin(performance.now() / 900 + lx) * 0.05;
    });
  }

  // 门口的猫
  const cat = pixelAnim(CAT_FRAMES, CAT_PAL, 3, 0.015, 'lobbycat');
  cat.x = dx + doorW + 70; cat.y = floorY - 10 - cat.height;
  c.addChild(cat);

  // 信箱墙
  const mail = new Graphics();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    mail.rect(BL + 40 + j * 22, dy + 30 + i * 20, 18, 16).fill(0x2a3145);
    mail.rect(BL + 42 + j * 22, dy + 32 + i * 20, 14, 3).fill(0x3a4466);
  }
  c.addChild(mail);

  makeHotspot(c, dx - 60, dy - 90, doorW + 140, doorH + 90, {
    tipFn: () => `<b>${gatekeeper?.emoji || '👁'} 守门人 · ${gatekeeper?.name || '阈'}</b><div class="tip-sub">1F 大堂 · 点击和它聊聊</div>`,
    onTap: () => bus.emit('gate:talk'),
  });
  parent.addChild(c);
}

// ═══════ 街机厅 ═══════
function buildArcade(parent, y) {
  const c = new Container();
  facade(c, y, H.arcade, 0x191430);
  const floorY = y + H.arcade - 12;

  const sign = label('街 机 厅', { size: 19, fill: 0xff5f8f, bold: true, glow: true, glowColor: 0xff2d78, glowBlur: 14, ls: 9 });
  sign.x = BL + BW / 2 - sign.width / 2;
  sign.y = y + 14;
  c.addChild(sign);
  const sub = label('INSERT COIN ▶', { size: 11, fill: 0x4dd8ff, glow: true, glowBlur: 6, ls: 3, mono: true });
  sub.x = BL + BW / 2 - sub.width / 2;
  sub.y = y + 42;
  c.addChild(sub);
  tickFns.push(() => {
    const t = performance.now();
    sub.alpha = (t % 1400) < 800 ? 1 : 0.15;
    sign.alpha = (t % 6100) < 90 ? 0.4 : 1;
  });

  // 街机柜 ×3
  const cabCols = ['#ff5f8f', '#4dd8ff', '#5fd4a2'];
  for (let i = 0; i < 3; i++) {
    const cx = BL + 90 + i * 140;
    const cab = new Container();
    const cg = new Graphics();
    cg.rect(cx, floorY - 78, 64, 78).fill(0x241c40);
    cg.rect(cx, floorY - 78, 64, 6).fill(shade(cabCols[i], -40));
    cg.rect(cx + 8, floorY - 66, 48, 30).fill(0x0b0e1a);
    cg.rect(cx + 6, floorY - 30, 52, 8).fill(0x352e58);
    cg.circle(cx + 20, floorY - 25, 3).fill(0xefe6d8);
    cg.circle(cx + 34, floorY - 25, 3).fill(cabCols[i]);
    cab.addChild(cg);
    const screen = new Graphics();
    cab.addChild(screen);
    c.addChild(cab);
    tickFns.push(() => {
      const t = performance.now() / 1000;
      screen.clear();
      const a = 0.25 + 0.2 * Math.sin(t * (1.3 + i * 0.4) + i * 2);
      screen.rect(cx + 8, floorY - 66, 48, 30).fill({ color: cabCols[i], alpha: a });
    });
  }

  makeHotspot(c, BL, y + 40, BW, H.arcade - 40, {
    tip: '<b>B1 · 街机厅</b><div class="tip-sub">三台老街机嗡嗡作响 · 点击开玩（赢塔币）</div>',
    onTap: () => bus.emit('arcade:open'),
  });
  parent.addChild(c);
}

// ═══════ 水族层 ═══════
function buildAquarium(parent, y) {
  const c = new Container();
  facade(c, y, H.aquarium, 0x101a30);
  const g = new Graphics();
  // 玻璃海
  const gx = BL + 22, gy = y + 34, gw = BW - 44, gh = H.aquarium - 60;
  g.rect(gx - 5, gy - 5, gw + 10, gh + 10).fill(0x2a3355);
  g.rect(gx, gy, gw, gh).fill(0x0c2438);
  g.rect(gx, gy, gw, 12).fill({ color: 0x4dd8ff, alpha: 0.1 });
  c.addChild(g);

  const t = label('深 渊 水 族 层', { size: 15, fill: 0x4dd8ff, serif: true, glow: true, glowBlur: 10, ls: 7 });
  t.x = BL + BW / 2 - t.width / 2;
  t.y = y + 10;
  c.addChild(t);

  // 鱼群
  const sea = new Container();
  c.addChild(sea);
  const fishCols = ['#4dd8ff', '#5fd4a2', '#ff9f43', '#a78bfa', '#ff5f8f', '#f5e6b8'];
  const fishes = [];
  for (let i = 0; i < 9; i++) {
    const f = makeFish(fishCols[i % fishCols.length], i % 3 === 0 ? 3 : 2, String(i));
    f.x = gx + Math.random() * (gw - 60);
    f.y = gy + 16 + Math.random() * (gh - 40);
    const dir = Math.random() < 0.5 ? 1 : -1;
    f.scale.x = -Math.abs(f.scale.x) * dir; // 贴图默认朝左
    fishes.push({ sp: f, v: (0.008 + Math.random() * 0.02) * dir, phase: Math.random() * 6 });
    sea.addChild(f);
  }
  const jellies = [];
  for (let i = 0; i < 3; i++) {
    const j = makeJelly('#a78bfa', 2, String(i));
    j.x = gx + 40 + i * (gw / 3);
    j.y = gy + gh - 30 - Math.random() * 40;
    j.alpha = 0.75;
    jellies.push({ sp: j, v: 0.004 + Math.random() * 0.006, phase: i * 2 });
    sea.addChild(j);
  }
  const bubbles = new Graphics();
  sea.addChild(bubbles);
  const bubbleList = Array.from({ length: 14 }, () => ({
    x: gx + 10 + Math.random() * (gw - 20),
    y: gy + Math.random() * gh,
    v: 0.01 + Math.random() * 0.02,
    r: 1 + Math.random() * 1.6,
  }));

  tickFns.push(dms => {
    const now = performance.now() / 1000;
    for (const f of fishes) {
      f.sp.x += f.v * dms;
      f.sp.y += Math.sin(now * 1.2 + f.phase) * 0.08;
      if (f.sp.x > gx + gw - 40 && f.v > 0) { f.v *= -1; f.sp.scale.x *= -1; }
      if (f.sp.x < gx + 6 && f.v < 0) { f.v *= -1; f.sp.scale.x *= -1; }
    }
    for (const j of jellies) {
      j.sp.y -= j.v * dms;
      j.sp.x += Math.sin(now + j.phase) * 0.05;
      if (j.sp.y < gy + 14) j.sp.y = gy + gh - 20;
    }
    bubbles.clear();
    for (const b of bubbleList) {
      b.y -= b.v * dms;
      if (b.y < gy + 8) { b.y = gy + gh - 6; b.x = gx + 10 + Math.random() * (gw - 20); }
      bubbles.circle(b.x, b.y, b.r).stroke({ width: 1, color: 0x9fd8ff, alpha: 0.4 });
    }
  });

  makeHotspot(c, gx, gy, gw, gh, {
    tip: '<b>B2 · 深渊水族层</b><div class="tip-sub">塔的地基泡在一片安静的海里 · 点击垂钓</div>',
    onTap: () => bus.emit('fishing:open'),
  });
  parent.addChild(c);
}

// ═══════ 灯串 ═══════
function buildStringLights(parent, x1, y, x2, colors) {
  const c = new Container();
  const wire = new Graphics();
  wire.moveTo(x1, y);
  const span = x2 - x1;
  const segs = Math.floor(span / 26);
  for (let i = 1; i <= segs; i++) {
    wire.lineTo(x1 + (span / segs) * i, y + (i % 2 === 0 ? 0 : 5));
  }
  wire.stroke({ width: 1, color: 0x3a4466, alpha: 0.8 });
  c.addChild(wire);
  const dots = [];
  for (let i = 0; i <= segs; i++) {
    const d = new Graphics();
    const col = colors[i % colors.length];
    d.rect(0, 0, 4, 4).fill(col);
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

// ═══════ 交互热点 ═══════
function makeHotspot(parent, x, y, w, h, { tip, tipFn, onTap }) {
  const hs = new Graphics();
  hs.rect(x, y, w, h).fill({ color: 0xffffff, alpha: 0.0001 });
  hs.eventMode = 'static';
  hs.cursor = 'pointer';
  hs.on('pointerover', e => {
    bus.emit('tip:show', { html: tipFn ? tipFn() : tip, gx: e.global.x, gy: e.global.y });
  });
  hs.on('pointermove', e => {
    bus.emit('tip:move', { gx: e.global.x, gy: e.global.y });
  });
  hs.on('pointerout', () => bus.emit('tip:hide'));
  hs.on('pointertap', () => {
    if (scene.wasDrag) return;
    bus.emit('tip:hide');
    onTap?.();
  });
  parent.addChild(hs);
}
