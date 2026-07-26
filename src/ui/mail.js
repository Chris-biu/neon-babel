// 信件系统：给住户写信，次日在信箱收到回信（AI模式为真回信）
import { RESIDENTS, getResident } from '../data/residents.js';
import { bus } from '../core/bus.js';
import { state, save, addAffinity } from '../core/state.js';
import { sfx } from '../core/audio.js';
import { dayKey } from '../core/clock.js';
import { toast, escapeHtml } from './hud.js';
import { openModal } from './panels.js';
import { aiEnabled, chatLLM, residentSystemPrompt } from '../ai/llm.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function initMail() {
  bus.on('mail:open', openMail);
}

function letters() {
  const S = state();
  if (!S.letters) S.letters = [];
  return S.letters;
}

async function ensureReply(letter) {
  if (letter.reply || dayKey() <= letter.day) return; // 次日才回
  const res = getResident(letter.to);
  if (!res) return;
  if (aiEnabled()) {
    try {
      const sys = residentSystemPrompt(res, state().name, 5, '对方给你写了一封信，请以书信体认真回一封100字左右的信，落款你的名字。');
      letter.reply = await chatLLM(sys, [{ role: 'user', content: letter.text }]);
      save();
      return;
    } catch { /* 回落到本地模板 */ }
  }
  letter.reply = [
    `${state().name}：`,
    `信收到了。你写的那些话，我在灯下读了两遍——第二遍是想确认第一遍没看错。`,
    pick(res.diary_lines || ['塔今晚也醒着，我也是。']),
    `纸短情长，改天来我这儿坐。`,
    `—— ${res.name}`,
  ].join('\n');
  save();
}

function openMail() {
  const today = dayKey();
  const inbox = letters().filter(l => l.reply || dayKey() > l.day);
  const { el } = openModal(`
    <div class="panel grid-panel" style="max-width:560px">
      <button class="modal-close" data-close>✕</button>
      <h2 class="panel-title">📮 信箱墙</h2>
      <p class="panel-sub">写下的信当晚寄出，回信明天到——塔里的邮政有自己的节奏</p>
      <div class="evidence-tabs">
        <button class="etab active" data-mt="write">写信</button>
        <button class="etab" data-mt="inbox">收件箱${inbox.filter(l => l.reply && !l.read).length ? ' ·🔴' : ''}</button>
      </div>
      <div id="mail-write">
        <select id="mail-to" style="margin-bottom:10px">
          ${RESIDENTS.map(r => `<option value="${r.id}">${r.emoji} ${r.name} · ${escapeHtml(r.occupation.slice(0, 12))}</option>`).join('')}
        </select>
        <textarea id="mail-text" rows="5" maxlength="300" placeholder="写点白天说不出口的……"></textarea>
        <div style="text-align:right;margin-top:10px"><button class="btn-glow btn-sm" id="mail-send">投 进 信 箱</button></div>
      </div>
      <div id="mail-inbox" hidden style="max-height:46vh;overflow-y:auto"></div>
    </div>
  `);
  const writeEl = el.querySelector('#mail-write');
  const inboxEl = el.querySelector('#mail-inbox');

  el.querySelectorAll('[data-mt]').forEach(t => t.addEventListener('click', async () => {
    el.querySelectorAll('[data-mt]').forEach(x => x.classList.toggle('active', x === t));
    const isWrite = t.dataset.mt === 'write';
    writeEl.hidden = !isWrite;
    inboxEl.hidden = isWrite;
    if (!isWrite) await renderInbox();
  }));

  el.querySelector('#mail-send').addEventListener('click', () => {
    const to = el.querySelector('#mail-to').value;
    const text = el.querySelector('#mail-text').value.trim();
    if (!text) { toast('信是空的，邮票会伤心', 'pink'); return; }
    if (letters().some(l => l.to === to && l.day === today)) { toast('今天已经给TA写过了——太频繁像催债', 'pink'); return; }
    letters().push({ to, text, day: today, reply: null, read: false });
    save();
    sfx.chime();
    el.querySelector('#mail-text').value = '';
    toast(`📮 信寄出了。${getResident(to)?.name} 明天会回你`);
  });

  async function renderInbox() {
    inboxEl.innerHTML = '<div class="empty-note">邮差正在爬楼…</div>';
    const list = letters().slice().reverse();
    for (const l of list) await ensureReply(l);
    const replied = list.filter(l => l.reply);
    if (!replied.length) {
      inboxEl.innerHTML = '<div class="empty-note">还没有回信。<br>写一封吧——明天这个时候来拆。</div>';
      return;
    }
    inboxEl.innerHTML = replied.map((l, i) => {
      const r = getResident(l.to);
      return `<div class="medal" style="align-items:flex-start;margin-bottom:10px">
        <div class="md-icon">${r?.emoji || '✉️'}</div>
        <div><div class="md-name">${r?.name || l.to} 的回信 <span style="font-size:11px;color:var(--text-dim)">${l.day} 寄出</span>${l.read ? '' : ' <span style="color:var(--neon-pink)">·新</span>'}</div>
        <div class="md-desc" style="white-space:pre-wrap;line-height:1.9;margin-top:6px">${escapeHtml(l.reply)}</div></div>
      </div>`;
    }).join('');
    let gained = 0;
    for (const l of replied) if (!l.read) { l.read = true; addAffinity(l.to, 1); gained++; }
    if (gained) { save(); toast(`💌 拆了 ${gained} 封回信，写信的人都记着你`, 'gold'); }
  }
}
