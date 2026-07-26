// 塔的时间系统：与真实本地时间同步
// 塔的高度随真实日期缓慢增长——所有访客看到同一个数字

const TOWER_EPOCH = Date.UTC(2026, 0, 1); // 2026-01-01 起算
const BASE_HEIGHT = 847;                   // 传说中的起始高度
const FLOORS_PER_DAY = 1.6180339887;       // 每天长高的层数（黄金分割，纯属浪漫）

export function now() { return new Date(); }

export function hourFloat(d = now()) {
  return d.getHours() + d.getMinutes() / 60;
}

export function clockText(d = now()) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function dayKey(d = now()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateText(d = now()) {
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week[d.getDay()]}`;
}

export function towerHeight(d = now()) {
  const days = (d.getTime() - TOWER_EPOCH) / 86400000;
  return Math.floor(BASE_HEIGHT + days * FLOORS_PER_DAY);
}

// 夜晚程度 0(正午)~1(深夜)，驱动天空与窗光
export function nightness(d = now()) {
  const h = hourFloat(d);
  // 12点最亮，0点最暗，平滑过渡
  const x = Math.abs(h - 12) / 12; // 0..1
  return Math.min(1, Math.max(0, (x - 0.25) / 0.55));
}

export function isNight(d = now()) {
  const h = hourFloat(d);
  return h >= 18.5 || h < 6;
}

export function daysBetween(dayKeyA, dayKeyB) {
  const a = new Date(dayKeyA + 'T00:00:00');
  const b = new Date(dayKeyB + 'T00:00:00');
  return Math.round(Math.abs(b - a) / 86400000);
}
