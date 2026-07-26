// 把内容工作流的产出 JSON 转成 src/data/ 下的 ES 模块
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2];
if (!outputPath) { console.error('用法: node integrate-content.mjs <workflow-output.json>'); process.exit(1); }

const raw = JSON.parse(readFileSync(outputPath, 'utf8'));
const R = raw.result || raw;

const banner = '// ⚠ 本文件由 tools/integrate-content.mjs 从内容工作流产出自动生成\n\n';
const dataDir = resolve(here, '../src/data');

// —— 住户 ——
const residents = [
  ...(R.residentsA?.residents || []),
  ...(R.residentsB?.residents || []),
].map(r => ({ ...r, floor: Math.min(8, Math.max(2, Number(r.floor) || 2)) }));

if (residents.length < 8) { console.error(`住户数量异常: ${residents.length}`); process.exit(1); }

writeFileSync(resolve(dataDir, 'residents.js'),
  banner +
  `export const RESIDENTS = ${JSON.stringify(residents, null, 2)};\n\n` +
  `export function getResident(id) {\n  return RESIDENTS.find(r => r.id === id);\n}\n`
);
console.log(`residents.js: ${residents.length} 位住户`);

// —— 世界（守门人/摊主/礼物/楼层） ——
const lobby = R.lobby || {};
const gifts = lobby.gifts || [];
const giftIds = new Set(gifts.map(g => g.id));
const vendors = (lobby.vendors || []).map(v => ({
  ...v,
  goods: (v.goods || []).filter(id => giftIds.has(id)),
}));
// 没被任何摊主卖的礼物，塞给货最少的摊主
const sold = new Set(vendors.flatMap(v => v.goods));
for (const g of gifts) {
  if (!sold.has(g.id) && vendors.length) {
    vendors.reduce((a, b) => (a.goods.length <= b.goods.length ? a : b)).goods.push(g.id);
  }
}

writeFileSync(resolve(dataDir, 'world.js'),
  banner +
  `export const GATEKEEPER = ${JSON.stringify(lobby.gatekeeper, null, 2)};\n\n` +
  `export const VENDORS = ${JSON.stringify(vendors, null, 2)};\n\n` +
  `export const GIFTS = ${JSON.stringify(gifts, null, 2)};\n\n` +
  `export const FLOORS_FLAVOR = ${JSON.stringify(lobby.floors_flavor || [], null, 2)};\n`
);
console.log(`world.js: 守门人「${lobby.gatekeeper?.name}」 + ${vendors.length} 摊主 + ${gifts.length} 礼物`);

// —— 事件与文案 ——
const ev = R.events || {};
writeFileSync(resolve(dataDir, 'events.js'),
  banner +
  `export const EVENT_TEMPLATES = ${JSON.stringify(ev.event_templates || [], null, 2)};\n\n` +
  `export const PLACES = ${JSON.stringify(ev.places || [], null, 2)};\n\n` +
  `export const TICKER_LINES = ${JSON.stringify(ev.ticker_lines || [], null, 2)};\n\n` +
  `export const NEWSPAPER = ${JSON.stringify(ev.newspaper || { name: '不夜塔晚报', slogans: [], editor_notes: [] }, null, 2)};\n\n` +
  `export const WISH_REPLIES = ${JSON.stringify(ev.wishes_replies || [], null, 2)};\n\n` +
  `export const LOADING_LINES = ${JSON.stringify(ev.loading_lines || [], null, 2)};\n\n` +
  `export const TAGLINES = ${JSON.stringify(ev.taglines || [], null, 2)};\n\n` +
  `export const ACHIEVEMENTS = ${JSON.stringify(ev.achievements || [], null, 2)};\n`
);
console.log(`events.js: ${ev.event_templates?.length || 0} 事件 + ${ev.ticker_lines?.length || 0} 动态 + ${ev.achievements?.length || 0} 成就`);
console.log('✔ 内容整合完成');
