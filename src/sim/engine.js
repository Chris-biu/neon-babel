// ═══════════════════════════════════════════════════════
// 住户模拟引擎：日程 → 窗户状态 / 气泡 / 事件流 / 楼报
// ═══════════════════════════════════════════════════════
import { RESIDENTS } from '../data/residents.js';
import { EVENT_TEMPLATES, PLACES, TICKER_LINES, NEWSPAPER, ACHIEVEMENTS } from '../data/events.js';
import { hourFloat, dayKey, dateText } from '../core/clock.js';
import { bus } from '../core/bus.js';
import { state, save, unlockMedal } from '../core/state.js';

const EV_KEY = 'neon-babel-events-v1';
let towerApi = null;
let bubbleTimer = 0, eventTimer = 0, hourApplied = -1;

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ── 日程 ──
export function scheduleAt(res, h = hourFloat()) {
  for (const s of res.schedule || []) {
    const from = s.from, to = s.to;
    if (from <= to ? (h >= from && h < to) : (h >= from || h < to)) return s;
  }
  return res.schedule?.[0] || { activity: '发呆', bubbles: [] };
}

export function residentStatus(res, h = hourFloat()) {
  const s = scheduleAt(res, h);
  const act = s.activity || '';
  const sleeping = /睡|补觉|打盹|梦|躺/.test(act) && !/睡不着/.test(act);
  const out = /出门|外勤|巡逻|市场|收集|回访|买|收「布料」|码头|上班|出摊|捡伞|溜达|散步/.test(act);
  return { schedule: s, activity: act, sleeping, present: !out, out };
}

function applyAllStates() {
  for (const r of RESIDENTS) {
    const st = residentStatus(r);
    towerApi?.setResidentState(r.id, { activity: st.activity, present: st.present, sleeping: st.sleeping });
  }
}

// ── 事件存储 ──
function loadEvents() {
  try {
    const raw = JSON.parse(localStorage.getItem(EV_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}
function saveEvents(db) {
  // 只保留最近3天
  const keys = Object.keys(db).sort().slice(-3);
  const trimmed = {};
  for (const k of keys) trimmed[k] = db[k];
  try { localStorage.setItem(EV_KEY, JSON.stringify(trimmed)); } catch {}
}

function fillTemplate(tpl, a, b) {
  return tpl
    .replaceAll('{A}', a?.name || '某位住户')
    .replaceAll('{B}', b?.name || '另一位住户')
    .replaceAll('{place}', pick(PLACES.length ? PLACES : ['电梯间']));
}

function makeEvent(atMinutes = null) {
  const total = EVENT_TEMPLATES.reduce((s, t) => s + (t.weight || 1), 0);
  let roll = Math.random() * total;
  let tpl = EVENT_TEMPLATES[0];
  for (const t of EVENT_TEMPLATES) { roll -= (t.weight || 1); if (roll <= 0) { tpl = t; break; } }
  const a = pick(RESIDENTS);
  let b = pick(RESIDENTS);
  let guard = 0;
  while (b.id === a.id && guard++ < 8) b = pick(RESIDENTS);
  const d = new Date();
  const mins = atMinutes ?? (d.getHours() * 60 + d.getMinutes());
  return {
    t: mins,
    cat: tpl.cat || '日常',
    text: fillTemplate(tpl.text, a, b),
    headline: fillTemplate(tpl.headline || tpl.text, a, b),
    who: [a.name, tpl.needs === 2 ? b.name : null].filter(Boolean),
    rids: [a.id, tpl.needs === 2 ? b.id : null].filter(Boolean),
  };
}

// ── 住户关系记忆：事件会真实写进当事人心里 ──
const REL_KEY = 'neon-babel-rel-v1';
const MOOD_BY_CAT = { '口角': -1, '离谱': 0, '恋爱': 1, '温情': 1, '集体': 1, '日常': 0 };

function loadRel() {
  try { return JSON.parse(localStorage.getItem(REL_KEY) || '{}') || {}; } catch { return {}; }
}
function writeRel(ev) {
  if (!ev.rids?.length) return;
  const db = loadRel();
  for (const rid of ev.rids) {
    db[rid] = { note: ev.text, cat: ev.cat, mood: MOOD_BY_CAT[ev.cat] ?? 0, ts: Date.now() };
  }
  try { localStorage.setItem(REL_KEY, JSON.stringify(db)); } catch {}
}
/** 住户最近的心事（20小时内视为新鲜，聊天时会主动提起） */
export function getRelNote(rid) {
  const r = loadRel()[rid];
  if (!r) return null;
  return { ...r, fresh: Date.now() - r.ts < 20 * 3600 * 1000 };
}

function todayLog() {
  const db = loadEvents();
  return db[dayKey()] || [];
}

function pushEvent(ev) {
  const db = loadEvents();
  const k = dayKey();
  db[k] = db[k] || [];
  db[k].push(ev);
  saveEvents(db);
  writeRel(ev);
  bus.emit('feed', ev);
}

/** 补写：让首次打开时"世界早已发生很多事" */
function backfillToday() {
  const db = loadEvents();
  const k = dayKey();
  const list = db[k] || [];
  const d = new Date();
  const minsNow = d.getHours() * 60 + d.getMinutes();
  const expected = Math.min(26, Math.floor(minsNow / 22) + 3);
  if (list.length >= expected) return;
  const need = expected - list.length;
  for (let i = 0; i < need; i++) {
    const at = Math.floor(Math.random() * Math.max(30, minsNow));
    const ev = makeEvent(at);
    list.push(ev);
    writeRel(ev);
  }
  list.sort((x, y) => x.t - y.t);
  db[k] = list;
  saveEvents(db);
}

// ── 楼报 ──
export function getNewspaper(forDay = null) {
  const S = state();
  const k = forDay || dayKey();
  if (S.newspapers[k] && forDay) return S.newspapers[k]; // 历史报纸用缓存
  const db = loadEvents();
  const list = (db[k] || []).slice();
  // 权重：口角/离谱/恋爱类更容易上头条
  const rank = { '离谱': 5, '口角': 4, '恋爱': 4, '集体': 3, '温情': 3, '日常': 1 };
  list.sort((a, b) => (rank[b.cat] || 1) - (rank[a.cat] || 1));
  const picked = list.slice(0, 6);
  const paper = {
    day: k,
    name: NEWSPAPER.name || '不夜塔晚报',
    slogan: pick(NEWSPAPER.slogans?.length ? NEWSPAPER.slogans : ['睡不着的人都在读']),
    date: dateText(new Date(k + 'T12:00:00')),
    headline: picked[0]?.headline || '塔内今日无大事，本报编辑部集体松了口气',
    items: picked.slice(1).map(e => ({ title: e.headline, body: e.text, cat: e.cat })),
    editor: pick(NEWSPAPER.editor_notes?.length ? NEWSPAPER.editor_notes : ['今晚也请各位，好好失眠。']),
    stats: { events: (db[k] || []).length, wishes: S.wishes.filter(w => w.day === k).length },
  };
  S.newspapers[k] = paper;
  save();
  return paper;
}

export function recentFeed(n = 18) {
  const list = todayLog().slice(-n);
  return list;
}

// ── 成就 ──
const MEDAL_CONDS = [
  () => !!state().created,                                             // 入住
  () => Object.keys(state().visits).length >= 1,                        // 第一次敲门
  () => Object.values(state().affinity).some(v => v >= 5),              // 好感5
  () => state().giftsGiven >= 1,                                        // 第一份礼物
  () => state().wishes.length >= 1,                                     // 第一个心愿
  () => state().gamesPlayed >= 1,                                       // 第一局街机
  () => state().coins >= 500,                                           // 塔币500
  () => Object.keys(state().visits).length >= 6,                        // 敲过6家门
  () => Object.values(state().affinity).filter(v => v >= 5).length >= 3,// 三位挚友
  () => state().wishes.length >= 7,                                     // 七个心愿
  () => state().gamesPlayed >= 10,                                      // 街机常客
  () => Object.values(state().visits).reduce((s, v) => s + v.count, 0) >= 20, // 拜访20次
  () => state().giftsGiven >= 8,                                        // 送礼8次
];

export function medalDefs() {
  return ACHIEVEMENTS.slice(0, MEDAL_CONDS.length).map((a, i) => ({ ...a, idx: i }));
}

export function checkMedals() {
  const defs = medalDefs();
  for (const d of defs) {
    if (MEDAL_CONDS[d.idx]() ) {
      if (unlockMedal(d.id)) bus.emit('medal:new', d);
    }
  }
}

// ── 每日委托（大堂委托板） ──
const QUEST_TAGS = ['暖食', '甜品', '茶咖', '花草', '书籍', '音乐', '手作'];
export function getQuests() {
  const S = state();
  const today = dayKey();
  if (S.quests?.day === today) return S.quests.list;
  // 按日期做种子，选3位住户发委托
  let seed = Number(today.replaceAll('-', '')) % 2147483647;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const pool = [...RESIDENTS].sort(() => rnd() - 0.5).slice(0, 3);
  const types = ['gift', 'visit', 'chat'].sort(() => rnd() - 0.5);
  const list = pool.map((r, i) => {
    const type = types[i];
    const tag = r.gift_love_tags?.[0] || QUEST_TAGS[Math.floor(rnd() * QUEST_TAGS.length)];
    return {
      id: `${today}-${r.id}`, rid: r.id, type, tag,
      text: type === 'gift' ? `给 ${r.name} 送一件「${tag}」类的礼物（夜市有售）`
        : type === 'visit' ? `去敲敲 ${r.name} 的门，看看TA今晚怎么样`
        : `陪 ${r.name} 认真聊一个话题`,
      reward: type === 'gift' ? 60 : 30,
      done: false,
    };
  });
  S.quests = { day: today, list };
  save();
  return list;
}
export function questProgress(kind, rid, tags = []) {
  const S = state();
  if (S.quests?.day !== dayKey()) return;
  for (const q of S.quests.list) {
    if (q.done || q.rid !== rid) continue;
    const hit = (q.type === 'visit' && kind === 'visit')
      || (q.type === 'chat' && kind === 'chat')
      || (q.type === 'gift' && kind === 'gift' && tags.includes(q.tag));
    if (hit) {
      q.done = true;
      save();
      bus.emit('quest:done', q);
    }
  }
}

// ── 主循环 ──
export function startEngine(api) {
  towerApi = api;
  backfillToday();
  applyAllStates();
  hourApplied = Math.floor(hourFloat());
  // 初始动态流
  for (const ev of recentFeed(10)) bus.emit('feed', ev);
  bus.emit('feed', { t: null, text: pick(TICKER_LINES.length ? TICKER_LINES : ['塔今晚也醒着。']), cat: '塔' });

  bubbleTimer = 3000 + Math.random() * 4000;
  eventTimer = 45000 + Math.random() * 60000;
}

export function tickEngine(dms) {
  if (!towerApi) return;
  // 整点换状态
  const h = Math.floor(hourFloat());
  if (h !== hourApplied) { hourApplied = h; applyAllStates(); }

  // 气泡
  bubbleTimer -= dms;
  if (bubbleTimer <= 0) {
    bubbleTimer = 7000 + Math.random() * 9000;
    const candidates = RESIDENTS.filter(r => residentStatus(r).present && !residentStatus(r).sleeping);
    if (candidates.length) {
      const r = pick(candidates);
      const s = scheduleAt(r);
      if (s.bubbles?.length) bus.emit('bubble', { rid: r.id, text: pick(s.bubbles) });
    }
  }

  // 新事件
  eventTimer -= dms;
  if (eventTimer <= 0) {
    eventTimer = 90000 + Math.random() * 120000;
    if (Math.random() < 0.25 && TICKER_LINES.length) {
      bus.emit('feed', { t: null, text: pick(TICKER_LINES), cat: '塔' });
    } else {
      pushEvent(makeEvent());
    }
  }
}
