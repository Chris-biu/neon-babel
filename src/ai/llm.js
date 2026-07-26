// 可选：接入 OpenAI 兼容大模型 API，让住户对话变成真 AI
// Key 只存 localStorage，从浏览器直连服务商，绝不经过第三方
import { state } from '../core/state.js';

export function aiEnabled() {
  const ai = state().settings.ai;
  return !!(ai.enabled && ai.base && ai.model && ai.key);
}

export async function chatLLM(systemPrompt, messages, { maxTokens = 400 } = {}) {
  const ai = state().settings.ai;
  const url = ai.base.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ai.key}`,
    },
    body: JSON.stringify({
      model: ai.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.9,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${t.slice(0, 120)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回为空');
  return content.trim();
}

export async function testLLM() {
  return chatLLM('你是一个连通性测试。', [{ role: 'user', content: '回复"连接成功"四个字。' }], { maxTokens: 20 });
}

export function residentSystemPrompt(res, playerName, affinity, memoryNote) {
  return [
    `你在扮演「不夜塔」（一座住满睡不着的人的塔）里的住户「${res.name}」，${res.age}岁，职业：${res.occupation}。`,
    `性格：${res.personality}`,
    `怪癖：${res.quirk}`,
    `说话风格：${res.speech_style}`,
    `你睡不着的原因：${res.sleepless_reason}`,
    affinity >= 5 ? `你的秘密（只对很熟的人吐露）：${res.secret}` : `你有一个不轻易说的秘密，除非对方和你非常熟。`,
    `正在和你聊天的是塔的新住户「${playerName}」，你们的熟悉度是 ${affinity}/10。${memoryNote || ''}`,
    `要求：完全以「${res.name}」的身份口吻回复，保持人设与说话风格，每次回复80-160字，可以有动作描写（用括号），温暖或幽默但不油腻。不要暴露你是AI或在扮演。不要用列表。`,
  ].join('\n');
}
