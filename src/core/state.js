// 存档与玩家状态（全部 localStorage，本地私有）
import { bus } from './bus.js';
import { dayKey } from './clock.js';

const KEY = 'neon-babel-save-v1';

function defaults() {
  return {
    created: null,            // 入住日 dayKey
    name: '',
    avatar: '🌙',
    room: '',
    coins: 120,
    inventory: {},            // giftId -> count
    affinity: {},             // residentId -> number
    visits: {},               // residentId -> { count, lastDay, topicsToday: [], dayOfTopics }
    wishes: [],               // { text, day }
    medals: [],               // 已解锁成就 id
    bestScores: {},           // gameId -> best
    gamesPlayed: 0,
    giftsGiven: 0,
    newspapers: {},           // dayKey -> 生成好的报纸对象（缓存）
    lastSeenDay: null,
    settings: {
      sound: true,
      ai: { enabled: false, base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: '' },
    },
  };
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults();
    const parsed = JSON.parse(raw);
    return { ...d, ...parsed, settings: { ...d.settings, ...parsed.settings, ai: { ...d.settings.ai, ...(parsed.settings?.ai || {}) } } };
  } catch { return defaults(); }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 存不下就算了 */ }
}

export function state() { return S; }

export function resetAll() {
  S = defaults();
  localStorage.removeItem(KEY);
}

export function isNewPlayer() { return !S.created; }

export function createPlayer(name, avatar, room) {
  S.created = dayKey();
  S.name = name;
  S.avatar = avatar;
  S.room = room;
  save();
}

export function addCoins(n, reason = '') {
  S.coins = Math.max(0, S.coins + n);
  save();
  bus.emit('coins', { coins: S.coins, delta: n, reason });
}

export function spendCoins(n) {
  if (S.coins < n) return false;
  S.coins -= n;
  save();
  bus.emit('coins', { coins: S.coins, delta: -n });
  return true;
}

export function addItem(id, n = 1) {
  S.inventory[id] = (S.inventory[id] || 0) + n;
  save();
}

export function removeItem(id, n = 1) {
  if (!S.inventory[id]) return false;
  S.inventory[id] -= n;
  if (S.inventory[id] <= 0) delete S.inventory[id];
  save();
  return true;
}

export function getAffinity(rid) { return S.affinity[rid] || 0; }

export function addAffinity(rid, n) {
  S.affinity[rid] = (S.affinity[rid] || 0) + n;
  save();
  bus.emit('affinity', { rid, value: S.affinity[rid] });
}

// 拜访记录：返回 { first, daysSince, count }
export function recordVisit(rid) {
  const today = dayKey();
  const v = S.visits[rid] || { count: 0, lastDay: null, topicsToday: [], dayOfTopics: today };
  const info = {
    first: v.count === 0,
    daysSince: v.lastDay ? Math.round((new Date(today) - new Date(v.lastDay)) / 86400000) : 0,
    count: v.count,
  };
  v.count += 1;
  v.lastDay = today;
  if (v.dayOfTopics !== today) { v.topicsToday = []; v.dayOfTopics = today; }
  S.visits[rid] = v;
  save();
  return info;
}

export function topicUsedToday(rid, topicId) {
  const v = S.visits[rid];
  if (!v) return false;
  return v.dayOfTopics === dayKey() && v.topicsToday.includes(topicId);
}

export function markTopicUsed(rid, topicId) {
  const v = S.visits[rid];
  if (!v) return;
  if (v.dayOfTopics !== dayKey()) { v.topicsToday = []; v.dayOfTopics = dayKey(); }
  if (!v.topicsToday.includes(topicId)) v.topicsToday.push(topicId);
  save();
}

export function unlockMedal(id) {
  if (S.medals.includes(id)) return false;
  S.medals.push(id);
  save();
  bus.emit('medal', id);
  return true;
}
