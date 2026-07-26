// 面板集合：模态框 / 夜市商店 / 楼报 / 背包 / 成就 / 设置 / 天台心愿
import { VENDORS, GIFTS, FLOORS_FLAVOR } from '../data/world.js';
import { WISH_REPLIES } from '../data/events.js';
import { bus } from '../core/bus.js';
import { state, save, spendCoins, addItem, addCoins, resetAll } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { dayKey } from '../core/clock.js';
import { toast, escapeHtml } from './hud.js';
import { getNewspaper, medalDefs, checkMedals, getQuests } from '../sim/engine.js';
import { addWishStar } from '../scene/sky.js';
import { aiEnabled, testLLM } from '../ai/llm.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const giftById = id => GIFTS.find(g => g.id === id);

// ── 模态框 ──
let currentModal = null;
export function openModal(html) {
  closeModal();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = html;
  document.getElementById('modal-root').appendChild(mask);
  mask.addEventListener('click', e => {
    if (e.target === mask || e.target.closest('[data-close]')) { sfx.close(); closeModal(); }
  });
  currentModal = mask;
  return { el: mask, close: closeModal };
}
export function closeModal() {
  if (currentModal) { currentModal.remove(); currentModal = null; }
}

export function initPanels() {
  bus.on('shop:open', i => openShop(typeof i === 'number' ? i : 0));
  bus.on('news:open', openNews);
  bus.on('bag:open', openBag);
  bus.on('medals:open', openMedals);
  bus.on('cfg:open', openSettings);
  bus.on('wish:open', openWish);
  bus.on('aquarium:open', () => bus.emit('fishing:open'));
  bus.on('quests:open', openQuests);
  bus.on('quest:done', q => {
    addCoins(q.reward, '· 委托完成');
    toast(`📌 委托完成：${q.text.slice(0, 18)}…`, 'gold');
  });
}

// ── 每日委托板 ──
function openQuests() {
  const list = getQuests();
  openModal(`
    <div class="panel grid-panel">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">📌 今日委托</h2>
      <p class="panel-sub">住户们贴在大堂的小纸条 · 每天零点更新</p>
      <div class="medal-list">
        ${list.map(q => `
          <div class="medal ${q.done ? '' : 'locked'}" style="${q.done ? '' : 'opacity:.9;filter:none'}">
            <div class="md-icon">${q.done ? '✅' : q.type === 'gift' ? '🎁' : q.type === 'visit' ? '🚪' : '💬'}</div>
            <div><div class="md-name">${escapeHtml(q.text)}</div>
            <div class="md-desc">${q.done ? '已完成' : `赏金 🪙 ${q.reward}`}</div></div>
          </div>`).join('')}
      </div>
    </div>
  `);
}

// ── 夜市商店 ──
function openShop(startIdx = 0) {
  const flavor = FLOORS_FLAVOR.find(f => f.key === 'market');
  const { el } = openModal(`
    <div class="panel shop-panel">
      <button class="modal-close" data-close>✕</button>
      <div class="shop-head">
        <h2 class="panel-title">🏮 不夜夜市</h2>
        <p class="panel-sub">${escapeHtml(flavor?.subtitle || '深夜的胃和心都能在这里修好')} · 你有 🪙 <b id="shop-coins">${state().coins}</b></p>
      </div>
      <div class="vendor-tabs" id="vendor-tabs"></div>
      <div class="vendor-line" id="vendor-line"></div>
      <div class="goods-grid" id="goods-grid"></div>
    </div>
  `);
  const tabs = el.querySelector('#vendor-tabs');
  const line = el.querySelector('#vendor-line');
  const grid = el.querySelector('#goods-grid');

  // 每日限量：按日期种子2件缺货；周五夜市全场9折
  const daySeed = Number(dayKey().replaceAll('-', ''));
  const soldOut = new Set(GIFTS.filter((_, i) => (daySeed + i) % Math.ceil(GIFTS.length / 2) === 0).slice(0, 2).map(g => g.id));
  const friday = new Date().getDay() === 5;
  const priceOf = g => friday ? Math.ceil(g.price * 0.9) : g.price;

  const show = idx => {
    const v = VENDORS[idx];
    [...tabs.children].forEach((t, i) => t.classList.toggle('active', i === idx));
    line.textContent = `${v.emoji} ${friday ? '周五夜市，全场九折！——' : ''}${pick(v.lines || [v.persona])}`;
    grid.innerHTML = '';
    for (const gid of v.goods) {
      const g = giftById(gid);
      if (!g) continue;
      const out = soldOut.has(g.id);
      const card = document.createElement('div');
      card.className = 'good-card';
      card.innerHTML = `
        <div class="good-emoji" style="${out ? 'filter:grayscale(1);opacity:.5' : ''}">${g.emoji}</div>
        <div class="good-name">${escapeHtml(g.name)}</div>
        <div class="good-desc">${escapeHtml(g.desc)}</div>
        <div class="good-price">${out ? '<span style="color:var(--text-dim)">今日售罄</span>' : friday ? `<s style="opacity:.5">🪙 ${g.price}</s> 🪙 ${priceOf(g)}` : `🪙 ${g.price}`}</div>
        <button class="good-buy" ${out ? 'disabled' : ''}>${out ? '明日再来' : '买下'}</button>
      `;
      card.querySelector('.good-buy').addEventListener('click', () => {
        if (!spendCoins(priceOf(g))) { sfx.bad(); toast('塔币不够了——去 B1 街机厅赢一点？', 'pink'); return; }
        addItem(g.id);
        sfx.coin();
        el.querySelector('#shop-coins').textContent = state().coins;
        line.textContent = `${v.emoji} ${pick(v.buy_lines || ['成交！'])}`;
        toast(`${g.emoji} 已放进背包（送给住户会加好感）`);
        checkMedals();
      });
      grid.appendChild(card);
    }
  };

  VENDORS.forEach((v, i) => {
    const t = document.createElement('button');
    t.className = 'vendor-tab';
    t.textContent = `${v.emoji} ${v.stall}`;
    t.addEventListener('click', () => { sfx.tap(); show(i); });
    tabs.appendChild(t);
  });
  show(Math.max(0, Math.min(VENDORS.length - 1, startIdx)));
}

// ── 楼报 ──
function openNews() {
  const paper = getNewspaper();
  const { el } = openModal(`
    <div class="panel news-panel">
      <button class="modal-close" data-close>✕</button>
      <div class="news-inner">
        <div class="news-mast">
          <div class="news-name">${escapeHtml(paper.name)}</div>
          <div class="news-slogan">${escapeHtml(paper.slogan)}</div>
          <div class="news-date">${escapeHtml(paper.date)} · 今日事件 ${paper.stats.events} 起 · 心愿 ${paper.stats.wishes} 枚</div>
        </div>
        <div class="news-headline">${escapeHtml(paper.headline)}</div>
        ${paper.items.map(i => `
          <div class="news-item">
            <div class="news-item-title">「${escapeHtml(i.cat)}」 ${escapeHtml(i.title)}</div>
            <div class="news-item-body">${escapeHtml(i.body)}</div>
          </div>
        `).join('')}
        <div class="news-editor"><b>编 者 按</b>${escapeHtml(paper.editor)}</div>
        <div style="text-align:center;padding-top:16px">
          <button class="btn-plain" id="btn-news-share" style="color:#55462f;border-color:rgba(107,90,62,.5)">📸 保存楼报长图（发给朋友）</button>
        </div>
      </div>
    </div>
  `);
  el.querySelector('#btn-news-share')?.addEventListener('click', () => { sfx.coin(); exportNewsImage(paper); });
  checkMedals();
}

// ── 楼报 → 可分享的长图 PNG ──
function exportNewsImage(paper) {
  const W = 720, PAD = 46, TW = W - PAD * 2;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const serif = '"Noto Serif SC","Source Han Serif SC","SimSun",serif';
  const wrap = (text, font, maxW) => {
    g.font = font;
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (g.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  };
  // 预排版计算高度
  const blocks = [];
  const push = (lines, font, size, color, gap = 8, lh = 1.55) => blocks.push({ lines, font, size, color, gap, lh });
  push([paper.name], `900 44px ${serif}`, 44, '#33291c', 6);
  push([paper.slogan], `13px ${serif}`, 13, '#7a6a4d', 4);
  push([`${paper.date} · 今日事件 ${paper.stats.events} 起 · 心愿 ${paper.stats.wishes} 枚`], `12px ${serif}`, 12, '#7a6a4d', 18);
  push(wrap(paper.headline, `900 26px ${serif}`, TW), `900 26px ${serif}`, 26, '#2a2014', 18);
  for (const it of paper.items.slice(0, 4)) {
    push(wrap(`「${it.cat}」${it.title}`, `700 17px ${serif}`, TW), `700 17px ${serif}`, 17, '#33291c', 6);
    push(wrap(it.body, `14px ${serif}`, TW), `14px ${serif}`, 14, '#55462f', 16);
  }
  push(wrap(`编者按：${paper.editor}`, `14px ${serif}`, TW - 30), `14px ${serif}`, 14, '#55462f', 14);
  let h = 70;
  for (const b of blocks) h += b.lines.length * b.size * b.lh + b.gap;
  h += 74;
  cv.width = W; cv.height = Math.ceil(h);
  // 绘制
  g.fillStyle = '#f4ecd9'; g.fillRect(0, 0, W, cv.height);
  g.fillStyle = '#e9dfc4'; g.fillRect(0, cv.height - 120, W, 120);
  let y = 70;
  g.textAlign = 'center';
  blocks.forEach((b, i) => {
    g.font = b.font; g.fillStyle = b.color;
    const centered = i < 4;
    g.textAlign = centered ? 'center' : 'left';
    for (const line of b.lines) {
      g.fillText(line, centered ? W / 2 : PAD, y);
      y += b.size * b.lh;
    }
    y += b.gap;
    if (i === 2) { g.strokeStyle = '#6b5a3e'; g.lineWidth = 2; g.beginPath(); g.moveTo(PAD, y - 10); g.lineTo(W - PAD, y - 10); g.stroke(); y += 8; }
  });
  g.textAlign = 'center';
  g.font = `12px ${serif}`; g.fillStyle = '#7a6a4d';
  g.fillText('—— 不夜塔 NEON BABEL · 一座为睡不着的人而建的塔 ——', W / 2, cv.height - 30);
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = `不夜塔晚报-${paper.day}.png`;
  a.click();
  toast('📰 楼报长图已保存，可以直接发朋友圈');
}

// ── 背包 ──
function openBag() {
  const inv = state().inventory;
  const entries = Object.entries(inv).filter(([, n]) => n > 0);
  openModal(`
    <div class="panel grid-panel">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">🎁 随身物品</h2>
      <p class="panel-sub">敲开住户的门，在对话里选「送礼物」——投其所好会更快熟络</p>
      ${entries.length ? `<div class="bag-grid">${entries.map(([id, n]) => {
        const g = giftById(id);
        return g ? `<div class="bag-item"><div class="b-emoji">${g.emoji}</div><div class="b-name">${escapeHtml(g.name)}</div><div class="b-count">× ${n}</div></div>` : '';
      }).join('')}</div>`
      : `<div class="empty-note">背包空空如也。<br>9F 夜市的摊主们等你很久了。</div>`}
    </div>
  `);
}

// ── 成就 ──
function openMedals() {
  const defs = medalDefs();
  const owned = new Set(state().medals);
  openModal(`
    <div class="panel grid-panel">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">🏅 成就</h2>
      <p class="panel-sub">已点亮 ${defs.filter(d => owned.has(d.id)).length} / ${defs.length}</p>
      <div class="medal-list">
        ${defs.map(d => `
          <div class="medal ${owned.has(d.id) ? '' : 'locked'}">
            <div class="md-icon">${d.icon || '🏅'}</div>
            <div><div class="md-name">${escapeHtml(d.name)}</div><div class="md-desc">${escapeHtml(d.desc)}</div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 设置 ──
function openSettings() {
  const ai = state().settings.ai;
  const { el } = openModal(`
    <div class="panel grid-panel">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">⚙️ 设置</h2>
      <p class="panel-sub">${escapeHtml(state().name ? `${state().avatar} ${state().name} · ${state().room}` : '尚未入住')}</p>

      <div class="cfg-block">
        <h4>AI 住户对话（可选）</h4>
        <div class="cfg-row">
          <span>接入大模型 API，让住户「自由聊天」变成真 AI</span>
          <button class="switch ${ai.enabled ? 'on' : ''}" id="ai-switch" aria-label="AI开关"></button>
        </div>
        <div class="cfg-grid" id="ai-fields" style="${ai.enabled ? '' : 'display:none'}">
          <div class="form-line"><label>API 地址</label><input id="ai-base" value="${escapeHtml(ai.base)}" placeholder="https://api.deepseek.com/v1"></div>
          <div class="form-line"><label>模型名</label><input id="ai-model" value="${escapeHtml(ai.model)}" placeholder="deepseek-chat"></div>
          <div class="form-line"><label>API Key</label><input id="ai-key" type="password" value="${escapeHtml(ai.key)}" placeholder="sk-…"></div>
          <div class="form-line"><label></label><div><button class="btn-plain" id="ai-test">保存并测试</button> <span id="ai-test-r" style="font-size:12.5px"></span></div></div>
        </div>
        <p class="cfg-note">Key 只保存在你本机浏览器，对话从浏览器直连服务商。不配置也完全可玩——住户自带完整对话剧本。部分服务商浏览器直连会遇到 CORS 限制。</p>
      </div>

      <div class="cfg-block">
        <h4>数据</h4>
        <div class="cfg-row">
          <span>存档备份（含好感/心愿/塔的记忆）</span>
          <span><button class="btn-plain" id="btn-exp">导出</button> <button class="btn-plain" id="btn-imp">导入</button></span>
        </div>
        <div class="cfg-row">
          <span>清空存档（住户会忘了你）</span>
          <button class="btn-plain" id="btn-reset">重开人生</button>
        </div>
      </div>
      <p class="cfg-note">《不夜塔》没有服务器——你的名字、好感、心愿全部只存在这台设备的浏览器里。</p>
    </div>
  `);

  el.querySelector('#ai-switch').addEventListener('click', e => {
    ai.enabled = !ai.enabled;
    e.target.classList.toggle('on', ai.enabled);
    el.querySelector('#ai-fields').style.display = ai.enabled ? '' : 'none';
    save();
  });
  el.querySelector('#ai-test')?.addEventListener('click', async () => {
    ai.base = el.querySelector('#ai-base').value.trim();
    ai.model = el.querySelector('#ai-model').value.trim();
    ai.key = el.querySelector('#ai-key').value.trim();
    save();
    const r = el.querySelector('#ai-test-r');
    r.textContent = '测试中…'; r.style.color = '#8b93b8';
    try {
      await testLLM();
      r.textContent = '✓ 连接成功'; r.style.color = '#5fd4a2';
    } catch (err) {
      r.textContent = '✗ ' + (err.message || '连接失败'); r.style.color = '#ff5f8f';
    }
  });
  // 存档导出/导入
  const SAVE_KEYS = ['neon-babel-save-v1', 'neon-babel-events-v1', 'neon-babel-rel-v1'];
  el.querySelector('#btn-exp').addEventListener('click', () => {
    const data = { __neonBabel: 1, exported: new Date().toISOString() };
    for (const k of SAVE_KEYS) data[k] = localStorage.getItem(k);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `不夜塔存档-${dayKey()}.json`;
    a.click();
    toast('📦 存档已导出');
  });
  el.querySelector('#btn-imp').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          if (!data.__neonBabel) throw new Error('不是不夜塔的存档文件');
          for (const k of SAVE_KEYS) if (data[k]) localStorage.setItem(k, data[k]);
          location.reload();
        } catch (e2) { toast('导入失败：' + e2.message, 'pink'); }
      };
      rd.readAsText(file);
    };
    inp.click();
  });

  let resetArmed = false;
  el.querySelector('#btn-reset').addEventListener('click', e => {
    if (!resetArmed) { resetArmed = true; e.target.textContent = '再点一次确认清空'; return; }
    resetAll();
    location.reload();
  });
}

// ── 天台心愿 ──
function openWish() {
  const today = dayKey();
  const todayCount = state().wishes.filter(w => w.day === today).length;
  const { el } = openModal(`
    <div class="panel wish-panel">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">🌙 天台 · 心愿投递</h2>
      <p class="panel-sub">写下一个心愿，塔会把它挂到夜空上（已挂 ${state().wishes.length} 颗）</p>
      <textarea id="wish-input" rows="3" maxlength="60" placeholder="写给夜空，没人偷看……"></textarea>
      <div class="wish-reply" id="wish-reply"></div>
      <button class="btn-glow btn-sm" id="wish-send">放 上 夜 空</button>
      <p class="wish-count" style="margin-top:12px">${todayCount === 0 ? '今天第一个心愿，塔会回赠 10 塔币' : `今天已许 ${todayCount} 个心愿`}</p>
    </div>
  `);
  el.querySelector('#wish-send').addEventListener('click', () => {
    const v = el.querySelector('#wish-input').value.trim();
    if (!v) { toast('心愿是空的，夜空挂不住', 'pink'); return; }
    const first = state().wishes.filter(w => w.day === today).length === 0;
    state().wishes.push({ text: v, day: today });
    save();
    sfx.wish();
    addWishStar(true);
    if (first) addCoins(10, '· 心愿回礼');
    const reply = pick(WISH_REPLIES.length ? WISH_REPLIES : ['塔收到了。今晚它替你亮着。']);
    el.querySelector('#wish-reply').textContent = `「${reply}」`;
    el.querySelector('#wish-input').value = '';
    checkMedals();
  });
}
