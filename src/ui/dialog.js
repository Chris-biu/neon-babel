// 住户对话：敲门 → 问候（带记忆）→ 话题树 / 送礼 / AI自由聊天
import { getResident } from '../data/residents.js';
import { bus } from '../core/bus.js';
import {
  state, save, getAffinity, addAffinity, recordVisit,
  topicUsedToday, markTopicUsed, removeItem,
} from '../core/state.js';
import { sfx } from '../core/audio.js';
import { toast, escapeHtml } from './hud.js';
import { openModal, giftById } from './panels.js';
import { residentStatus, checkMedals, getRelNote, questProgress } from '../sim/engine.js';
import { aiEnabled, chatLLM, residentSystemPrompt } from '../ai/llm.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
let towerApi = null;

export function initDialog(api) {
  towerApi = api;
  bus.on('resident:open', open);
}

function heartsHtml(aff) {
  const n = Math.max(0, Math.min(10, aff));
  return '♥'.repeat(n).padEnd(10, '♡');
}

async function open(rid) {
  const res = getResident(rid);
  if (!res) return;
  const st = residentStatus(res);
  towerApi?.knock?.(rid);
  sfx.knock();

  // 睡着/外出：吃闭门羹（但深夜世界观里大多数人醒着）
  if (!st.present) {
    await wait(420);
    toast(`${res.emoji} ${res.name} 不在家——${st.activity}去了`, '');
    return;
  }
  if (st.sleeping) {
    await wait(420);
    toast(`${res.emoji} ${res.name} 难得睡着了……还是别敲了`, '');
    return;
  }

  await wait(380);
  const visit = recordVisit(rid);
  questProgress('visit', rid);
  const aff = getAffinity(rid);

  const { el } = openModal(`
    <div class="panel chat-panel">
      <button class="modal-close" data-close>✕</button>
      <div class="chat-head" style="border-bottom-color:${res.color}33">
        <div class="chat-avatar" style="border-color:${res.color}66; box-shadow:0 0 22px ${res.color}33"><img class="pt" src="/portraits/${res.id}.png" alt="" onerror="this.remove()"><span>${res.emoji}</span></div>
        <div class="chat-title">
          <div class="chat-name">${escapeHtml(res.name)}</div>
          <div class="chat-meta">${res.floor}F · ${escapeHtml(res.occupation)}</div>
        </div>
        <div class="chat-aff">
          <div class="chat-aff-hearts" style="color:${res.color}">${heartsHtml(aff)}</div>
          <div class="chat-aff-label">熟悉度 ${aff}/10</div>
        </div>
      </div>
      <div class="chat-body" id="chat-body"></div>
      <div class="chat-options" id="chat-opts"></div>
    </div>
  `);
  const body = el.querySelector('#chat-body');
  const opts = el.querySelector('#chat-opts');
  const affEl = el.querySelector('.chat-aff-hearts');
  const affLabel = el.querySelector('.chat-aff-label');

  const refreshAff = () => {
    const a = getAffinity(rid);
    affEl.textContent = heartsHtml(a);
    affLabel.textContent = `熟悉度 ${a}/10`;
  };

  const push = (who, text, sys = false) => {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (who === 'player' ? ' from-player' : '') + (sys ? ' sys' : '');
    const ava = who === 'player' ? state().avatar : res.emoji;
    div.innerHTML = `<span class="m-ava">${sys ? '·' : ava}</span><div class="m-text">${escapeHtml(text)}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  };

  /** 逐字输出住户台词 */
  const speak = text => new Promise(resolve => {
    const div = push('res', '');
    const target = div.querySelector('.m-text');
    let i = 0;
    const iv = setInterval(() => {
      if (i >= text.length) { clearInterval(iv); resolve(); return; }
      target.textContent += text[i++];
      body.scrollTop = body.scrollHeight;
    }, 26);
  });

  // ── 问候 ──
  let greeting;
  if (visit.first) greeting = pick(res.greetings.first);
  else if (aff >= 8) greeting = pick(res.greetings.close);
  else greeting = pick(res.greetings.familiar);
  await speak(fillPlayer(greeting, res));

  // 记忆台词（隔了1天以上再来）
  if (!visit.first && visit.daysSince >= 1 && res.memory_lines?.length) {
    const mem = pick(res.memory_lines)
      .replaceAll('{days}', visit.daysSince)
      .replaceAll('{visits}', visit.count + 1)
      .replaceAll('{player}', state().name);
    await speak(mem);
  }

  // 世界的记忆：楼里刚发生过和TA有关的事，TA会主动提起
  const rel = getRelNote(rid);
  if (rel?.fresh && rel.note) {
    const line = rel.mood < 0
      ? `……跟你说件事。${rel.note}。唉，今晚心里有点堵，别介意我话少。`
      : rel.mood > 0
        ? `对了——${rel.note}。哈，今晚心情不错，就冲这个。`
        : `对了，${rel.note}。这栋塔里就没有秘密。`;
    await speak(line);
  }

  renderOptions();
  checkMedals();

  // ── 选项区 ──
  function renderOptions(followups = null) {
    opts.innerHTML = '';
    if (followups) {
      for (const fu of followups) {
        addOpt(escapeHtml(fu.player_line), async () => {
          push('player', fu.player_line);
          opts.innerHTML = '';
          await speak(fillPlayer(fu.reply, res));
          renderOptions();
        });
      }
      addOpt('（换个话题）', () => renderOptions());
      return;
    }

    const a = getAffinity(rid);
    const topics = (res.topics || []).filter(t => (t.min_affinity || 0) <= a);
    const locked = (res.topics || []).filter(t => (t.min_affinity || 0) > a);
    for (const t of topics.slice(0, 5)) {
      const used = topicUsedToday(rid, t.id);
      addOpt(`${used ? '<span class="opt-tag">已聊</span>' : ''}${escapeHtml(t.player_line)}`, async () => {
        push('player', t.player_line);
        opts.innerHTML = '';
        await speak(fillPlayer(t.reply, res));
        if (!used) { addAffinity(rid, 1); refreshAff(); markTopicUsed(rid, t.id); questProgress('chat', rid); checkMedals(); }
        renderOptions(t.followups?.length ? t.followups : null);
      });
    }
    if (locked.length) {
      const lockEl = document.createElement('button');
      lockEl.className = 'chat-opt locked';
      lockEl.innerHTML = `🔒 还有 ${locked.length} 个话题……等你们更熟一点`;
      opts.appendChild(lockEl);
    }

    const row = document.createElement('div');
    row.className = 'chat-opt-row';
    row.appendChild(makeBtn('🎁 送礼物', () => renderGiftPicker()));
    if (aiEnabled()) row.appendChild(makeBtn('💬 自由聊天', () => renderFreeChat()));
    row.appendChild(makeBtn('🚪 告辞', () => { sfx.close(); el.querySelector('[data-close]').click(); }));
    opts.appendChild(row);
  }

  function makeBtn(html, fn) {
    const b = document.createElement('button');
    b.className = 'chat-opt';
    b.innerHTML = html;
    b.addEventListener('click', () => { sfx.tap(); fn(); });
    return b;
  }
  function addOpt(html, fn) { opts.appendChild(makeBtn(html, fn)); }

  // ── 送礼 ──
  function renderGiftPicker() {
    opts.innerHTML = '';
    const inv = Object.entries(state().inventory).filter(([, n]) => n > 0);
    if (!inv.length) {
      push('sys', '你摸了摸口袋——空的。9F 夜市在营业。', true);
      renderOptions();
      return;
    }
    for (const [gid, n] of inv.slice(0, 6)) {
      const g = giftById(gid);
      if (!g) continue;
      addOpt(`${g.emoji} 送出「${escapeHtml(g.name)}」 × ${n}`, async () => {
        removeItem(gid);
        state().giftsGiven += 1;
        save();
        push('player', `（递上 ${g.name}）`);
        opts.innerHTML = '';
        const loved = (g.tags || []).some(t => (res.gift_love_tags || []).includes(t));
        sfx.chime();
        await speak(pick(loved ? res.gift_lines.love : res.gift_lines.ok));
        addAffinity(rid, loved ? 2 : 1);
        questProgress('gift', rid, g.tags || []);
        refreshAff();
        if (loved) push('sys', `${res.name} 很喜欢！熟悉度 +2`, true);
        else push('sys', `熟悉度 +1`, true);
        checkMedals();
        renderOptions();
      });
    }
    addOpt('（还是算了）', () => renderOptions());
  }

  // ── AI 自由聊天 ──
  const aiHistory = [];
  function renderFreeChat() {
    opts.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'chat-free-row';
    row.innerHTML = `<input type="text" maxlength="200" placeholder="想说什么就说什么（AI 模式）"><button class="btn-glow btn-sm">说</button>`;
    const input = row.querySelector('input');
    const btn = row.querySelector('button');
    const send = async () => {
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      push('player', v);
      aiHistory.push({ role: 'user', content: v });
      const thinking = push('sys', `${res.name} 正在想怎么回你……`, true);
      btn.disabled = true;
      try {
        const visitInfo = state().visits[rid];
        const memNote = visitInfo ? `TA已拜访你${visitInfo.count}次。` : '';
        const sys = residentSystemPrompt(res, state().name, getAffinity(rid), memNote);
        const reply = await chatLLM(sys, aiHistory.slice(-10));
        thinking.remove();
        aiHistory.push({ role: 'assistant', content: reply });
        await speak(reply);
      } catch (err) {
        thinking.remove();
        push('sys', `（信号被雨打断了：${err.message}）`, true);
      }
      btn.disabled = false;
      input.focus();
    };
    btn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    opts.appendChild(row);
    const back = makeBtn('（回到话题）', () => renderOptions());
    opts.appendChild(back);
    input.focus();
  }
}

function fillPlayer(text, res) {
  return text
    .replaceAll('{player}', state().name || '你')
    .replaceAll('{name}', res.name);
}

const wait = ms => new Promise(r => setTimeout(r, ms));
