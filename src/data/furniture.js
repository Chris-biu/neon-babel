// 玩家房间家具目录（kind 对应 pixels.js FURNITURE 图样）
export const FURN_CATALOG = [
  { id: 'fur_bed', name: '云朵单人床', kind: 'bed', slot: 'floor', price: 80, desc: '据说梦见的雨都是温的。' },
  { id: 'fur_desk', name: '守夜书桌', kind: 'desk', slot: 'floor', price: 60, desc: '台灯永远亮着，像有人在等你。' },
  { id: 'fur_pc', name: '旧电脑桌', kind: 'desk_pc', slot: 'floor', price: 90, desc: '屏幕的光是这个时代的篝火。' },
  { id: 'fur_shelf', name: '折角书架', kind: 'shelf', slot: 'wall', price: 55, desc: '卷叔亲手做的，送两本没人退的书。' },
  { id: 'fur_plant', name: '夜来香盆栽', kind: 'plant', slot: 'floor', price: 35, desc: '只在夜里开花，很懂这栋楼。' },
  { id: 'fur_lamp', name: '暖黄落地灯', kind: 'lamp_floor', slot: 'floor', price: 45, desc: '灯伯调过的色温：不刺眼的陪伴。' },
  { id: 'fur_tv', name: '雪花电视机', kind: 'tv', slot: 'floor', price: 70, desc: '没信号也开着，图个响。' },
  { id: 'fur_radio', name: '深夜收音机', kind: 'radio', slot: 'wall', price: 40, desc: '两点档会自动调到晚仔的频率。' },
  { id: 'fur_cat', name: '猫窝（含猫）', kind: 'cat', slot: 'floor', price: 120, desc: '主任夫人的孩子，塔猫编制内。' },
  { id: 'fur_books', name: '床头书堆', kind: 'books_pile', slot: 'floor', price: 25, desc: '压住失眠的三本半小说。' },
];
export const ROOM_SLOTS = [
  { id: 's1', slot: 'floor', x: 30 },
  { id: 's2', slot: 'floor', x: 150 },
  { id: 's3', slot: 'floor', x: 270 },
  { id: 's4', slot: 'floor', x: 380 },
  { id: 'w1', slot: 'wall', x: 90 },
  { id: 'w2', slot: 'wall', x: 300 },
];
