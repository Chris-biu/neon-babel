// ═══════════════════════════════════════════════════════
// 像素美术引擎：字符网格 → 调色板 → 纹理
// 所有美术均为程序手绘，无外部素材
// ═══════════════════════════════════════════════════════
import { Texture, Sprite, AnimatedSprite } from 'pixi.js';

const texCache = new Map();

/** 把字符网格画进 canvas 并生成纹理（'.'与' '为透明） */
export function gridTexture(grid, palette, key = null) {
  const cacheKey = key || (grid.join('|') + JSON.stringify(palette));
  if (texCache.has(cacheKey)) return texCache.get(cacheKey);
  const h = grid.length;
  const w = Math.max(...grid.map(r => r.length));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  const tex = Texture.from(cv);
  tex.source.scaleMode = 'nearest';
  texCache.set(cacheKey, tex);
  return tex;
}

export function pixelSprite(grid, palette, scale = 3, key = null) {
  const sp = new Sprite(gridTexture(grid, palette, key));
  sp.scale.set(scale);
  return sp;
}

/** 多帧动画精灵 */
export function pixelAnim(frames, palette, scale = 3, speed = 0.04, keyBase = null) {
  const texs = frames.map((f, i) => gridTexture(f, palette, keyBase ? `${keyBase}#${i}` : null));
  const sp = new AnimatedSprite(texs);
  sp.scale.set(scale);
  sp.animationSpeed = speed;
  sp.play();
  return sp;
}

// ═══════════════════════════════════════════════════════
// 角色系统：12×18 像素小人
// 调色板通道：H发 F肤 E眼 C上衣 P裤 B鞋 A围裙/挂饰 X高光
// ═══════════════════════════════════════════════════════

// —— 站立（2帧待机：呼吸起伏） ——
const STAND_A = [
  '............',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHFFFFHH..',
  '..HFEFFEFH..',
  '...FFFFFF...',
  '....FFFF....',
  '...CCCCCC...',
  '..CCCCCCCC..',
  '..FCCCCCCF..',
  '..FCCCCCCF..',
  '...CCCCCC...',
  '...PPPPPP...',
  '...PPPPPP...',
  '...PP..PP...',
  '...PP..PP...',
  '...BB..BB...',
  '............',
];
const STAND_B = [
  '............',
  '............',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHFFFFHH..',
  '..HFEFFEFH..',
  '...FFFFFF...',
  '....FFFF....',
  '...CCCCCC...',
  '..CCCCCCCC..',
  '..FCCCCCCF..',
  '..FCCCCCCF..',
  '...CCCCCC...',
  '...PPPPPP...',
  '...PP..PP...',
  '...PP..PP...',
  '...BB..BB...',
  '............',
];

// —— 行走（2帧） ——
const WALK_A = [
  '............',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHFFFFHH..',
  '..HFEFFEFH..',
  '...FFFFFF...',
  '....FFFF....',
  '...CCCCCC...',
  '..CCCCCCCC..',
  '..FCCCCCCF..',
  '...CCCCCCF..',
  '...CCCCCC...',
  '...PPPPPP...',
  '..PPP..PPP..',
  '..PP....PP..',
  '..BB....PP..',
  '........BB..',
  '............',
];
const WALK_B = [
  '............',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHFFFFHH..',
  '..HFEFFEFH..',
  '...FFFFFF...',
  '....FFFF....',
  '...CCCCCC...',
  '..CCCCCCCC..',
  '..FCCCCCCF..',
  '..FCCCCCC...',
  '...CCCCCC...',
  '...PPPPPP...',
  '...PPPPPP...',
  '....PPPP....',
  '....PP.PP...',
  '....BB.BB...',
  '............',
];

// —— 坐姿（书桌用，面朝左） ——
const SIT = [
  '............',
  '....HHHHHH..',
  '...HHHHHHHH.',
  '...HHFFFFHH.',
  '...HFEFFEFH.',
  '....FFFFFF..',
  '.....FFFF...',
  '....CCCCCC..',
  '...CCCCCCCC.',
  '...FCCCCCC..',
  '...FCCCCCC..',
  '....CCCCCC..',
  '....PPPPPP..',
  '....PPPP....',
  '....PP......',
  '....BB......',
  '............',
  '............',
];

// —— 躺姿（床用，水平） ——
const LIE = [
  '..................',
  '..HHHH............',
  '.HHHHHH.CCCCCCCC..',
  '.HHFFFH.CCCCCCCCP.',
  '.HFEFEH.CCCCCCCCP.',
  '.HFFFFH.CCCCCCCC..',
  '..FFFF............',
  '..................',
];

// 发型变体：通过覆盖顶部几行实现
const HAIRSTYLES = {
  short: null, // 默认
  long: {
    5: '..HFEFFEFH..',
    6: '..HFFFFFFH..',
    7: '..HCCCCCCH..',
    8: '..HCCCCCCH..',
  },
  bun: {
    0: '.....HH.....',
    1: '...HHHHHH...',
  },
  hat: {
    1: '..AAAAAAAA..',
    2: '.AAAAAAAAAA.',
    3: '..HHFFFFHH..',
  },
  bald: {
    1: '....FFFF....',
    2: '..FFFFFFFF..',
    3: '..FFFFFFFF..',
  },
  side: {
    2: '..HHHHHHH...',
    3: '..HHFFFFH...',
  },
};

function applyHair(grid, style) {
  const patch = HAIRSTYLES[style];
  if (!patch) return grid;
  return grid.map((row, i) => patch[i] !== undefined ? patch[i] : row);
}

const SKIN_TONES = ['#f2c9a0', '#eebd92', '#e0a878', '#f5d4b0'];
const HAIR_COLORS = ['#2b2233', '#4a3226', '#6b4a2f', '#8a8d99', '#3d2b4f', '#7a3b3b', '#2f4a5f', '#5a5f2f'];
const CLOTH_COLORS = ['#c65f5f', '#5f8fc6', '#5fc68f', '#c6a05f', '#8f5fc6', '#c65f9e', '#5fb8c6', '#96a05a', '#d98841', '#7f8ac9'];
const PANT_COLORS = ['#3a4466', '#5a3a44', '#44543a', '#4d4d5c', '#6b5340'];

/** 稳定哈希：同一id永远生成同一个形象 */
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/** 由角色id与主色生成外观定义 */
export function characterLook(id, accentColor = null) {
  const h = hashCode(id);
  const styles = Object.keys(HAIRSTYLES);
  return {
    hairstyle: styles[h % styles.length],
    palette: {
      H: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
      F: SKIN_TONES[(h >> 6) % SKIN_TONES.length],
      E: '#20182b',
      C: accentColor || CLOTH_COLORS[(h >> 9) % CLOTH_COLORS.length],
      P: PANT_COLORS[(h >> 12) % PANT_COLORS.length],
      B: '#2b2233',
      A: '#e8e3d0',
      X: '#ffffff',
    },
  };
}

/** 供 2D Canvas 使用：取角色站立网格与调色板（合影卡/房间渲染用） */
export function characterGrid(id, accentColor = null) {
  const look = characterLook(id, accentColor);
  return { grid: applyHair(STAND_A, look.hairstyle), palette: look.palette };
}

/** 生成角色某姿态的动画/精灵 */
export function makeCharacter(id, pose = 'stand', scale = 3, accentColor = null) {
  const look = characterLook(id, accentColor);
  const kb = `char:${id}:${pose}`;
  if (pose === 'stand') {
    return pixelAnim(
      [applyHair(STAND_A, look.hairstyle), applyHair(STAND_B, look.hairstyle)],
      look.palette, scale, 0.018, kb,
    );
  }
  if (pose === 'walk') {
    return pixelAnim(
      [applyHair(WALK_A, look.hairstyle), applyHair(WALK_B, look.hairstyle)],
      look.palette, scale, 0.08, kb,
    );
  }
  if (pose === 'sit') return pixelSprite(applyHair(SIT, look.hairstyle), look.palette, scale, kb);
  if (pose === 'lie') return pixelSprite(LIE, look.palette, scale, kb);
  return pixelSprite(applyHair(STAND_A, look.hairstyle), look.palette, scale, kb);
}

// ═══════════════════════════════════════════════════════
// 家具与道具
// 通道：W木 D深木 L灯罩 G灯光 S屏幕 K书 M床垫 Q被子 T绿植 O盆 R杂色
// ═══════════════════════════════════════════════════════
export const FURN_PAL = {
  W: '#7a5a3a', D: '#54422e', L: '#e8b45a', G: '#ffe9b0',
  S: '#9fd8ff', K: '#b56576', M: '#cfc4a8', Q: '#6d8fb0',
  T: '#5fae6a', O: '#a06a4a', R: '#c98a8a', X: '#ffffff',
  Y: '#e0c56a', Z: '#3a4466',
};

export const FURNITURE = {
  desk: [
    '..GGG.....',
    '..LLL.....',
    '...D......',
    'WWWWWWWWWW',
    '.D......D.',
    '.D......D.',
  ],
  desk_pc: [
    '...SSSS...',
    '...SSSS...',
    '....DD....',
    'WWWWWWWWWW',
    '.D......D.',
    '.D......D.',
  ],
  bed: [
    '.QQQQQQQQQQQ..',
    'MQQQQQQQQQQQM.',
    'MMMMMMMMMMMMM.',
    'D...........D.',
  ],
  shelf: [
    'WWWWWWWW',
    'WKRKYKZW',
    'WWWWWWWW',
    'WYZKRKKW',
    'WWWWWWWW',
  ],
  plant: [
    '..TT..',
    '.TTTT.',
    'T.TT.T',
    '..OO..',
    '.OOOO.',
  ],
  lamp_floor: [
    '.LLL.',
    'LGGGL',
    '.LLL.',
    '..D..',
    '..D..',
    '..D..',
    '.DDD.',
  ],
  tv: [
    'DDDDDDDD',
    'DSSSSSSD',
    'DSSSSSSD',
    'DDDDDDDD',
    '..D..D..',
  ],
  cat: [
    '.R.R....',
    '.RRR..R.',
    '.RRRRRR.',
    '.RR.RR..',
  ],
  books_pile: [
    '.KKKK.',
    'YYYYYY',
    'ZZZZZ.',
  ],
  radio: [
    'DDDDDDD',
    'DGDDDSD',
    'DDDDDDD',
  ],
  pot: [
    '.DDDD.',
    'DGGGGD',
    'DGGGGD',
    '.DDDD.',
  ],
};

export function makeFurniture(kind, scale = 3) {
  const grid = FURNITURE[kind];
  if (!grid) return null;
  return pixelSprite(grid, FURN_PAL, scale, `furn:${kind}`);
}

// ═══════════════════════════════════════════════════════
// 杂项像素元素
// ═══════════════════════════════════════════════════════

/** 像素月亮 */
export const MOON = [
  '....YYYY....',
  '..YYYYYYYY..',
  '.YYYYYYYYXY.',
  '.YYYDYYYYYY.',
  'YYYYYYYYDYYY',
  'YYYYYYYYYYYY',
  'YYDYYYYYYYYY',
  'YYYYYYYDYYYY',
  '.YYYYYYYYYY.',
  '.YXYYYYYYYY.',
  '..YYYYYYYY..',
  '....YYYY....',
];
export const MOON_PAL = { Y: '#f5e6b8', D: '#d9c68f', X: '#fffbe8' };

/** 像素猫（塔里的野猫，会出现在各处） */
export const CAT_FRAMES = [
  [
    '.Y.Y......',
    '.YYY....Y.',
    '.YYYYYYYY.',
    '.YY.YY....',
  ],
  [
    '.Y.Y......',
    '.YYY....Y.',
    '.YYYYYYYY.',
    '..YY..YY..',
  ],
];
export const CAT_PAL = { Y: '#e0a35a' };

/** 像素鱼（多配色，水族层用） */
export function makeFish(color, scale = 3, id = '') {
  const grid = [
    '..FFFF..T',
    '.FFFFFF.TT',
    'FEFFFFFTTT',
    '.FFFFFF.TT',
    '..FFFF..T',
  ];
  return pixelSprite(grid, { F: color, E: '#0b0e1a', T: shade(color, -30) }, scale, `fish:${id || color}:${scale}`);
}

/** 像素水母 */
export function makeJelly(color, scale = 3, id = '') {
  const grid = [
    '..FFFF..',
    '.FFFFFF.',
    'FFFFFFFF',
    'FXFFFXFF',
    '.T.T.T.T',
    'T.T.T.T.',
    '.T.T.T.T',
  ];
  return pixelSprite(grid, { F: color, X: '#ffffff', T: shade(color, -20) }, scale, `jelly:${id || color}:${scale}`);
}

/** 双色混合 t=0..1（0为a） */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round((pa >> 16) + (((pb >> 16) & 255) - (pa >> 16)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** 颜色加深/提亮 */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** hex → pixi 数值色 */
export function hexNum(hex) { return parseInt(hex.slice(1), 16); }
