// 临时：v5.4 提速。时间花在哪：提示词长短对「第一个字多久出来」有没有影响、有没有缓存、少写空字段能省多少。只调 Atria，不打印 key。
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
const note = (t, m) => console.log(`::notice title=${t}::${esc(m)}`);

const ctx = { now: new Date(2026, 9, 2, 12, 30), history: [], dayRecords: [{ ref: 'r1', text: '早餐 肉包2个 460kcal 蛋白16 碳水60 脂肪16' }], dayLabel: '今天 2026-10-02', lastWeight: 61,
  recent: ['杠铃卧推 80kg 4×8（09-28）', '杠铃深蹲 100kg 5×5（09-27）', '引体向上 自重 4×8（09-27）', '哑铃推举 22kg 3×10（09-26）', '传统硬拉 120kg 3×5（09-25）', '跑步机 30分钟（09-24）'],
  day: { goal: 'fat_loss', budget: 2031, burn: 0, intake: 460, protein: 16, proteinTarget: 140 }, memo: ['叫阿程', '健身新手'],
  myFoods: [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350, proteinG: 10, carbsG: 50, fatG: 11 }, { name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] };
const TEXT = '中午吃了一碗牛肉面加个蛋';
const full = P.buildMessages(TEXT, ctx);
const sys = full[0].content;
const DROP = /^(10\.|11\.|   回答|   写成几行|   回答了问题|   练什么|   answer 是|   要排好几天|   下面有「|   补剂和药|   一顿说不清|   连锁店)/;
const half = sys.split('\n').filter(l => !DROP.test(l)).join('\n');
const tiny = sys.split('\n').slice(0, 7).join('\n') + '\n规则：mealType 只能是：早餐、午餐、晚餐、加餐/补剂。克数按熟重估。';
const OMIT = '\n输出时值为 null、[]、0、false 的字段都不要写（没有就省掉），只写有内容的。';
const V = {
  '完整': [sys, full[1].content],
  '去掉无关规则': [half, full[1].content],
  '极短': [tiny, full[1].content],
  '完整+不写空字段': [sys + OMIT, full[1].content],
};

async function once(name, stream) {
  const [s, u] = V[name];
  const body = { model, messages: [{ role: 'system', content: s }, { role: 'user', content: u }], temperature: 0.2, stream, thinking: { type: 'disabled' } };
  for (let tries = 0; ; tries++) {
    const t0 = Date.now();
    let first = 0, text = '', status = 0, usage = null;
    try {
      const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      status = r.status;
      if (r.status === 429 && tries < 4) { await sleep(30000); continue; }
      if (!r.ok) return { name, err: 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200) };
      if (!stream) { const j = await r.json(); text = j.choices[0].message.content; usage = j.usage; first = Date.now() - t0; }
      else {
        const dec = new TextDecoder(); let buf = '';
        for await (const part of r.body) {
          buf += dec.decode(part, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim(); if (d === '[DONE]') continue;
            try { const j = JSON.parse(d); if (j.usage) usage = j.usage; const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) { if (!first) first = Date.now() - t0; text += c; } } catch (e) {}
          }
        }
      }
      const all = Date.now() - t0;
      let ok = '';
      try { const r2 = P.normalize(P.extractJson(text), Object.assign({ said: TEXT }, ctx)); ok = r2.meals.map(m => `${m.mealType} ${m.foodSummary} ${m.calories}kcal 蛋白${m.proteinG}`).join('；') || '(没记)'; } catch (e) { ok = '解析失败 ' + e.message; }
      return { name, first, all, chars: text.length, usage, ok, head: text.slice(0, 160) };
    } catch (e) { return { name, err: (e && e.message) + ' status ' + status }; }
  }
}

(async () => {
  const lines = [];
  try {
    const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + key } });
    const j = await r.json().catch(() => ({}));
    note('Atria 能用的模型', `HTTP ${r.status} ` + JSON.stringify((j.data || []).map(m => m.id)).slice(0, 1500));
  } catch (e) { note('Atria 能用的模型', '出错 ' + e.message); }
  note('提示词长度（字）', Object.entries(V).map(([k, v]) => `${k}: system ${v[0].length} + user ${v[1].length}`).join('\n'));
  const res = {};
  const GAP = Number(process.env.GAP || 15000);
  for (let k = 0; k < 4; k++) {
    for (const name of Object.keys(V)) {
      await sleep(GAP);
      const r = await once(name, true);
      (res[name] = res[name] || []).push(r);
      const msg = r.err ? `${name} #${k + 1} 出错 ${r.err}` : `${name} #${k + 1}: 第一个字 ${(r.first / 1000).toFixed(1)}s · 全部 ${(r.all / 1000).toFixed(1)}s · 输出 ${r.chars} 字 · ${r.ok}`;
      console.log(msg); lines.push(msg);
    }
  }
  // 缓存：同一份完整提示词隔 2 秒连发两次，第二次快不快
  for (let k = 0; k < 2; k++) {
    await sleep(GAP);
    const a = await once('完整', true);
    await sleep(2000);
    const b = await once('完整', true);
    const msg = `缓存 #${k + 1}: 第一次 第一个字 ${((a.first || 0) / 1000).toFixed(1)}s / 全部 ${((a.all || 0) / 1000).toFixed(1)}s；隔2秒再发 第一个字 ${((b.first || 0) / 1000).toFixed(1)}s / 全部 ${((b.all || 0) / 1000).toFixed(1)}s ${a.err || ''} ${b.err || ''}`;
    console.log(msg); lines.push(msg);
  }
  // 非流式各一次，看 usage（token 数）
  for (const name of ['完整', '完整+不写空字段']) {
    await sleep(GAP);
    const r = await once(name, false);
    const msg = `${name} 非流式: 全部 ${((r.first || 0) / 1000).toFixed(1)}s · usage ${JSON.stringify(r.usage)} · 开头 ${r.head || r.err}`;
    console.log(msg); lines.push(msg);
  }
  const med = (xs) => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] / 1000).toFixed(1) + 's' : '-'; };
  const sum = Object.entries(res).map(([k, rs]) => `${k}: 第一个字中位 ${med(rs.map(r => r.first))}（${rs.map(r => r.first ? (r.first / 1000).toFixed(1) : 'x').join(' / ')}）· 全部中位 ${med(rs.map(r => r.all))}（${rs.map(r => r.all ? (r.all / 1000).toFixed(1) : 'x').join(' / ')}）`);
  note('汇总', sum.join('\n'));
  note('明细', lines.join('\n'));
  process.exit(0);
})();
