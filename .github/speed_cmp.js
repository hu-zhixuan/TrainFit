// 临时：v5.4 新旧提示词比速度。12 句常见的记录，流式调真实 Atria，分开量「开口（第一个字）」和「写完（第一个字到最后）」，写完那段不受排队影响。不打印 key。
global.window = global;
const OLD = process.env.PARSER === 'old';
const TF = require(OLD ? './old/web/js/log/parser.js' : '../web/js/log/parser.js');
const TAG = process.env.TAG || (OLD ? '旧' : '新');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
const TEXTS = [['中午吃了一碗牛肉面加个蛋', '12:30'], ['早上两个包子一杯豆浆', '08:00'], ['晚上吃了一份黄焖鸡米饭', '19:00'], ['卧推八十公斤四组八个', '20:00'],
  ['下午喝了杯奶茶', '15:30'], ['早上三个鸡蛋一杯牛奶', '08:00'], ['中午吃了鸡胸肉200克，一碗米饭', '12:30'], ['刚吃了一份猪脚饭', '12:40'],
  ['跑步机跑了30分钟', '21:00'], ['练完喝了一勺蛋白粉', '21:30'], ['晚上吃了麻辣烫和一瓶可乐', '19:30'], ['中午吃了汉堡王的吉士汉堡和一份薯条', '12:30']];
(async () => {
  const rows = [];
  for (const [text, hhmm] of TEXTS) {
    await sleep(Number(process.env.GAP || 15000));
    const [h, mi] = hhmm.split(':').map(Number);
    const ctx = { now: new Date(2026, 9, 2, h, mi), history: [], dayRecords: [], dayLabel: '今天 2026-10-02', lastWeight: 61,
      recent: ['杠铃卧推 80kg 4×8（09-28）', '杠铃深蹲 100kg 5×5（09-27）', '引体向上 自重 4×8（09-27）', '跑步机 30分钟（09-24）'],
      day: { goal: 'fat_loss', budget: 2031, burn: 0, intake: 600, protein: 30, proteinTarget: 140 },
      myFoods: [{ name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] };
    const body = { model, messages: P.buildMessages(text, ctx), temperature: 0.2, stream: true, thinking: { type: 'disabled' } };
    let first = 0, out = '', t0, ok = '';
    for (let tries = 0; ; tries++) {
      t0 = Date.now(); first = 0; out = '';
      const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) }).catch(e => ({ ok: false, status: 0 }));
      if (r.status === 429 && tries < 4) { await sleep(30000); continue; }
      if (!r.ok) { ok = 'HTTP ' + r.status; break; }
      const dec = new TextDecoder(); let buf = '';
      try {
        for await (const part of r.body) {
          buf += dec.decode(part, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim(); if (d === '[DONE]') continue;
            try { const j = JSON.parse(d); const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) { if (!first) first = Date.now() - t0; out += c; } } catch (e) {}
          }
        }
      } catch (e) { ok = '断了 ' + e.message; }
      break;
    }
    const all = Date.now() - t0;
    if (!ok) { try { const r2 = P.normalize(P.extractJson(out), Object.assign({ said: text }, ctx)); ok = r2.meals.map(m => `${m.mealType} ${m.foodSummary} ${m.calories}kcal 蛋白${m.proteinG}`).concat(r2.workouts.map(w => w.exerciseName + ' ' + (w.durationMin ? w.durationMin + '分钟' : w.weightKg + 'kg ' + w.sets + '×' + w.reps))).join('；') + ` · reply「${r2.reply}」`; } catch (e) { ok = '解析失败 ' + e.message; } }
    rows.push({ text, first, gen: first ? all - first : null, chars: out.length, ok });
    console.log(`[${TAG}] ${text}: 开口 ${(first / 1000).toFixed(1)}s · 写完 ${first ? ((all - first) / 1000).toFixed(1) : '-'}s · ${out.length} 字 · ${ok}`);
  }
  const med = (xs) => { const s = xs.filter(x => x != null && x > 0).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
  const avg = (xs) => { const s = xs.filter(x => x != null && x > 0); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0; };
  const sum = `开口中位 ${(med(rows.map(r => r.first)) / 1000).toFixed(1)}s · 写完中位 ${(med(rows.map(r => r.gen)) / 1000).toFixed(1)}s（平均 ${(avg(rows.map(r => r.gen)) / 1000).toFixed(1)}s）· 输出中位 ${med(rows.map(r => r.chars))} 字（平均 ${Math.round(avg(rows.map(r => r.chars)))}）`;
  console.log(`::notice title=[${TAG}] 速度汇总::${esc(sum + '\n' + rows.map(r => `${r.text}: 开口 ${(r.first / 1000).toFixed(1)}s 写完 ${r.gen ? (r.gen / 1000).toFixed(1) : '-'}s ${r.chars}字 ${r.ok}`).join('\n'))}`);
  process.exit(0);
})();
