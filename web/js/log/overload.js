/**
 * 练食AI · 渐进超负荷（v12.2，用户：「运动重量的积攒要更加智能，我们要做 progressive overload」）。纯函数，node 能测。
 *
 * 以前（v4.x～v12.1）只看最后一条记录：复合动作做到 8 次、别的 12 次就加 2.5 / 1kg，卡住了一直说「冲 N+1 次」。
 * 现在看这个动作的整段历史，本机算，不问大模型：
 *  - 一天合成一次（sessions）：最重的那个重量是正式组，几条记录加起来几组、最少做了几次；轻的是热身 / 递减组，不当成绩。
 *    数字是大模型估的（notes 带「估计」）不算，除非只有估的。
 *  - 次数区间按你自己的习惯：最近三次次数都一样（老是 4×8）就是固定次数，做满了加重量、次数不变；
 *    别的按最近几次的中位数挑区间（5×5 的人不会被逼着做到 10 个）；记得少按动作：深蹲硬拉 5～8、卧推划船推举 6～10、
 *    腿举臀推 8～12、手臂 / 夹胸 / 腿屈伸 10～15、侧平举面拉卷腹 12～20。
 *  - 每次加多少按你的器械：用过的重量的公约数（哑铃 10、12、14 → 2kg；7.5、10 → 2.5kg；器械 45、50 → 5kg），
 *    一次不超过重量的 3.5%（深蹲硬拉 6%），至少一档。加了重量做几次按估算一次最大（Epley，算上还剩几个的余力）推，不是一律少两次；
 *    一档跨太大（6kg 的侧平举加到 8kg）先加组，组数够了第一组先换上去。
 *  - 没到区间顶：每次多一个（还能加的多两个）；到顶了组数不到 3 组先加组。
 *  - 很吃力、或者同一个重量比上次少做了：这次先保持 / 冲回上次；连着两次 → 退 10% 再往上冲。
 *  - 同一个重量连着三次没多做一个（卡住了）：减脂期能保住就是赚（四次再退），别的退 10% 再冲。
 *  - 比你之前最好的重量轻（隔久了回来、退过一次）：按上次的成绩直接往回加，不用一档一档爬。
 *  - 隔了两周以上：先轻 10%（四周 15%、八周 20%）找回感觉。
 *  - 自重（引体、双杠、俯卧撑、卷腹）：次数到顶了，引体双杠挂负重，别的加组、再放慢下放；助力引体的助力越练越少。
 * 返回 { kind, text, why, weightKg, reps, sets, lo, hi, inc, fixed, stuck?, up?, upSets?, upReps? }：text 一句短的（今天页、提示条、趋势页），
 * why 为什么（趋势页的动作详情、问「卧推下次多少」）。kind：weight / reps / sets / keep / deload / back / load / harder /
 * mix（一档跨太大：前 upSets 组用 up 做 upReps 个，其余照旧 weightKg）。
 */
(function (root) {
  const TF = root.TF = root.TF || {};

  const DAY = 86400000;
  const r2 = (x) => Math.round(x * 100) / 100;
  const kg = (w) => `${r2(w)}kg`;
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
  const isEst = (r) => /估计/.test((r && r.notes) || '');
  const ts = (r) => { if (r.ts) return r.ts; const m = /_(\d{12,})/.exec(r.id || ''); return m ? Number(m[1]) : 0; };

  /** 估算一次最大（Epley），rir = 还能再做几个 */
  function e1rm(w, reps, rir) {
    return w > 0 ? w * (1 + Math.min((reps || 1) + (rir || 0), 15) / 30) : 0;
  }
  /** 练完说的感受（rpe 7 / 8 / 9.5）→ 还能再做几个；没说按 2 个 */
  const rirOf = (rpe) => (rpe ? Math.max(0, Math.min(4, 10 - rpe)) : 2);

  /** 一天合成一次：最重的重量是正式组 */
  function sessions(records) {
    const by = new Map();
    (records || []).forEach(r => {
      if (!r || !r.date || r.durationMin) return;
      if (!by.has(r.date)) by.set(r.date, []);
      by.get(r.date).push(r);
    });
    return [...by.keys()].sort().map(date => {
      const rs = by.get(date).slice().sort((a, b) => ts(a) - ts(b));
      const w = Math.max(0, ...rs.map(r => +r.weightKg || 0));
      const tops = rs.filter(r => (+r.weightKg || 0) === w);
      const sets = tops.reduce((s, r) => s + Math.max(1, +r.sets || 1), 0);
      const reps = Math.min(...tops.map(r => +r.reps || 0));
      const felt = rs.filter(r => r.rpe).pop();
      const rpe = felt ? +felt.rpe : 0;
      // 比正式组轻一点的（六成以上）：一组一组换重量时剩下那几组、递减组
      const lighter = rs.filter(r => (+r.weightKg || 0) < w && (+r.weightKg || 0) >= w * 0.6);
      const backW = Math.max(0, ...lighter.map(r => +r.weightKg || 0));
      const backs = lighter.filter(r => +r.weightKg === backW);
      const backSets = backs.reduce((t, r) => t + Math.max(1, +r.sets || 1), 0);
      const backReps = backs.length ? Math.min(...backs.map(r => +r.reps || 0)) : 0;
      return { date, w, sets, reps, rpe, e1: e1rm(w, reps), backW, backSets, backReps, top: tops[tops.length - 1], recs: rs };
    });
  }

  /** 动作的样子：什么器械、默认次数区间、一次最多加百分之几 */
  function profileOf(name) {
    const n = String(name || '');
    const assist = /助力|辅助/.test(n);
    const db = /哑铃/.test(n), kb = /壶铃/.test(n);
    const machine = !db && !kb && !/史密斯|杠铃/.test(n) && /器械|绳索|龙门|悍马|坐姿|下拉|夹胸|蝴蝶|腿屈伸|腿弯举|腿举|倒蹬|哈克|下压|面拉|机/.test(n);
    const eq = db ? 'db' : kb ? 'kb' : machine ? 'machine' : 'bar';
    const lowerMain = !db && !kb && /深蹲|硬拉/.test(n) && !/罗马尼亚|直腿|单腿|保加利亚|高脚杯|分腿|跳/.test(n);
    let band;
    if (lowerMain) band = [5, 8];
    else if (/腿举|倒蹬|哈克|臀推/.test(n)) band = [8, 12];
    else if (/侧平举|前平举|后束|反向飞鸟|面拉|腕|提踵|卷腹|转体/.test(n)) band = [12, 20];
    else if (/弯举|下压|臂屈伸|夹胸|飞鸟|腿屈伸|腿弯举|蝴蝶|三头|二头|颈后/.test(n)) band = [10, 15];
    else if (/卧推|推举|划船|引体|双杠|下拉|深蹲|硬拉|挺举|高翻|推胸|箭步|弓步|分腿/.test(n)) band = [6, 10];
    else band = [8, 12];
    // 自重做的时候的区间
    let bw = [8, 20];
    if (/引体/.test(n)) bw = [4, 12];
    else if (/双杠|臂屈伸/.test(n)) bw = [6, 15];
    else if (/俯卧撑/.test(n)) bw = [10, 25];
    else if (/卷腹|仰卧起坐|举腿|两头起|死虫|转体|登山/.test(n)) bw = [15, 30];
    else if (/蹲|箭步|弓步|臀桥|提踵/.test(n)) bw = [12, 25];
    const harder = /俯卧撑/.test(n) ? '下斜俯卧撑' : /深蹲|蹲/.test(n) ? '保加利亚分腿蹲' : /卷腹|仰卧起坐/.test(n) ? '抱着杠铃片卷腹' : /臀桥/.test(n) ? '单腿臀桥' : '';
    return { eq, band, bw, pct: lowerMain ? 0.06 : 0.035, assist, loadable: /引体|双杠|臂屈伸/.test(n) && !assist, harder };
  }

  /** 每次能加多少：你用过的重量的公约数，按器械挑常见的那一档 */
  const PREFS = { bar: [2.5, 2, 1, 0.5], db: [2, 2.5, 1, 0.5], kb: [4, 2, 1, 0.5], machine: [5, 2.5, 2, 1, 0.5] };
  function incOf(eq, weights) {
    const q = [...new Set(weights.filter(w => w > 0).map(w => Math.round(w * 4)))].sort((a, b) => a - b);
    const prefs = PREFS[eq] || PREFS.bar;
    if (!q.length) return prefs[0];
    let g = q.length > 1 ? 0 : q[0];
    for (let i = 1; i < q.length; i++) g = gcd(g, q[i] - q[i - 1]);
    if (eq === 'machine' && q.length > 1 && g % 10 && g <= 40) return g / 4; // 器械片 4kg、7kg 一档的
    for (const p of prefs) if (g % Math.round(p * 4) === 0) return p;
    return 0.25;
  }

  /**
   * 次数区间。固定次数：最近 5 次里至少 3 次是同一个整数目标（5、6、8、10、12…）、别的都没超过它（老是 4×8，偶尔少一个）——
   * 7、9 这种多半是没做到 8、10，不算目标。别的按最近几次的中位数挑区间。
   */
  const BANDS = [[3, 5], [4, 6], [5, 8], [6, 10], [8, 12], [10, 15], [12, 20], [15, 25], [20, 30]];
  const ROUND = [3, 5, 6, 8, 10, 12, 15, 20, 25, 30];
  function bandOf(ss, dflt) {
    const recent = ss.slice(-6).map(s => s.reps).filter(r => r > 0);
    const last5 = recent.slice(-5);
    const mode = ROUND.filter(r => last5.filter(x => x === r).length >= 3)[0];
    if (mode && last5.every(x => x <= mode)) return { lo: mode, hi: mode, fixed: true };
    const m = recent.length >= 3 ? median(recent) : (recent.length ? recent[recent.length - 1] : 0);
    const inside = (b, x) => x >= b[0] && x <= b[1];
    // 只有一两次的：离默认区间远了才换（一次 15 个的卧推不是你的习惯区间就是 6～10）
    if (!m || (recent.length >= 3 ? inside(dflt, m) : (m >= dflt[0] - 2 && m <= dflt[1] + 2))) return { lo: dflt[0], hi: dflt[1], fixed: false };
    const b = BANDS.filter(x => inside(x, m)).sort((x, y) => Math.abs((x[0] + x[1]) / 2 - m) - Math.abs((y[0] + y[1]) / 2 - m))[0] || dflt;
    return { lo: b[0], hi: b[1], fixed: false };
  }

  /** 换了重量能做几次：按 Epley 推（不封顶，只在相近的重量之间换算），余力和上次一样 */
  function repsAt(s, w2) {
    const rir = rirOf(s.rpe);
    return Math.round((s.reps + rir + 30) * s.w / w2 - 30 - rir);
  }

  /** 同一个重量连着几次没多做（含这次） */
  function stuckCount(ss) {
    const s = ss[ss.length - 1];
    let i = ss.length - 1;
    while (i > 0 && ss[i - 1].w === s.w && days(ss[i - 1].date, ss[i].date) <= 21) i--;
    const run = ss.slice(i);
    let best = run[0], at = 0;
    run.forEach((x, k) => { if (x.reps > best.reps || (x.reps === best.reps && x.sets > best.sets)) { best = x; at = k; } });
    return run.length - at;
  }

  /** 往下退 pct（落在你的档位上，至少一档） */
  function down(w, inc, pct) {
    return r2(Math.max(inc, w - Math.max(1, Math.round(w * pct / inc)) * inc));
  }

  /**
   * 下次练多少。records：这个动作的记录（力量的）；opts：{ today, cut（目标是减脂）, extra（排好几天计划时前面几天假设做到了的） }
   */
  function next(records, name, opts) {
    opts = opts || {};
    const all = (records || []).filter(r => r && !r.durationMin);
    const real = all.filter(r => !isEst(r));
    let ss = sessions(real.length ? real : all);
    if (opts.extra && opts.extra.length) ss = ss.concat(opts.extra.filter(x => !ss.length || x.date > ss[ss.length - 1].date));
    if (!ss.length || !(ss[ss.length - 1].reps > 0)) return null; // 没记次数的说不出下次
    const pf = profileOf(name);
    const s = ss[ss.length - 1], prev = ss[ss.length - 2], prev2 = ss[ss.length - 3];
    const today = opts.today || s.date;
    const gap = Math.max(0, days(s.date, today));
    const easy = s.rpe && s.rpe <= 7, hard = s.rpe >= 9.5;
    let lo, hi, fixed, inc;
    const out = (kind, text, why, w, reps, sets, extra) => Object.assign({ kind, text, why, weightKg: r2(w), reps: Math.max(1, reps), sets: sets || s.sets, lo, hi, inc, fixed }, extra || {});

    // 自重
    if (!(s.w > 0)) {
      ({ lo, hi, fixed } = bandOf(ss.filter(x => !(x.w > 0)), pf.bw));
      inc = 2.5;
      if (gap >= 14) return out('back', `隔了 ${gap} 天，先做 ${Math.max(3, s.reps - 2)} 个`, `隔了 ${gap} 天没练，先少做两个找回感觉`, 0, Math.max(3, s.reps - 2));
      if (hard) return out('keep', `保持 ${s.reps} 个，做稳了再加`, '上次说很吃力', 0, s.reps);
      if (s.reps >= hi || (easy && s.reps >= hi - 2)) {
        if (pf.loadable) return out('load', `下次挂 ${easy ? 5 : 2.5}kg 负重 × ${Math.max(lo, hi - 4)}`, `${s.reps} 个都做到了，可以负重了`, easy ? 5 : 2.5, Math.max(lo, hi - 4));
        if (s.sets < 4) return out('sets', `下次做 ${s.sets + 1} 组`, `${s.reps} 个做满了，先多一组`, 0, s.reps, s.sets + 1);
        return out('harder', pf.harder ? `下次试试${pf.harder}` : '下次放慢，下去数 3 秒', `${s.sets}×${s.reps} 都做满了，光加次数意义不大了`, 0, s.reps);
      }
      const step = (hi >= 20 ? 2 : 1) * (easy ? 2 : 1);
      const to = Math.min(hi, s.reps + step);
      return out('reps', `下次冲 ${to} 个`, `${lo}～${hi} 个一组，做到 ${hi} 个再加难度`, 0, to);
    }

    ({ lo, hi, fixed } = bandOf(ss.filter(x => x.w > 0 && !(x.backSets > x.sets)), pf.band)); // 一组一组换重量的那几次不算习惯
    inc = incOf(pf.eq, ss.map(x => x.w).concat(all.map(r => +r.weightKg || 0)));
    const range = fixed ? `每次 ${lo} 个` : `${lo}～${hi} 个一组`;

    // 助力的：助力越少越难
    if (pf.assist) {
      if (hard) return out('keep', `保持助力 ${kg(s.w)}，做稳了再减`, '上次说很吃力', s.w, s.reps);
      if (s.reps >= hi && s.w - inc > 0) return out('weight', `下次助力减到 ${kg(s.w - inc)}`, `${s.reps} 个做满了，助力少一档`, s.w - inc, Math.max(lo, hi - 2));
      return out('reps', `下次冲 ${Math.min(hi, s.reps + 1)} 次`, `${range}，做到 ${hi} 个就减助力`, s.w, Math.min(hi, s.reps + 1));
    }

    // 隔了两周以上：先轻一点
    if (gap >= 14) {
      const w2 = down(s.w, inc, gap >= 56 ? 0.2 : gap >= 28 ? 0.15 : 0.1);
      return out('back', `先 ${kg(w2)} × ${s.reps} 找回感觉`, `隔了 ${gap} 天没练，先轻一点，两三次就能回到 ${kg(s.w)}`, w2, s.reps);
    }

    // 很吃力 / 同一个重量少做了：一次先保持，连着两次退一点
    const dropped = (a, b0) => !!(a && b0 && a.w === b0.w && a.reps < b0.reps);
    const bad = (x, y) => !!x && (x.rpe >= 9.5 || dropped(x, y));
    const bad0 = bad(s, prev), bad1 = bad(prev, prev2);
    if (bad0 && bad1 && days(prev.date, s.date) <= 21) {
      const w2 = down(s.w, inc, 0.1);
      const r = Math.min(hi, Math.max(lo, repsAt(s, w2)));
      return out('deload', `先退到 ${kg(w2)} × ${r}，再加回来`, `连着两次${hard ? '很吃力' : '没做到上次的数'}，退一点练顺了再冲`, w2, r);
    }
    if (bad0) {
      if (dropped(s, prev)) return out('keep', `下次 ${kg(s.w)} 冲回 ${prev.reps} 次`, `比上次少了 ${prev.reps - s.reps} 个，没睡好、吃得少都会这样，先找回来`, s.w, prev.reps);
      return out('keep', `保持 ${kg(s.w)} × ${s.reps}，练扎实了再加`, '上次说很吃力', s.w, s.reps);
    }

    // 正在一组一组换重量（上次前几组用了新的重量，剩下的还是原来的）：做够了就多换一组，全换上去以后照常
    const fromW = prev && s.backSets > 0 && (prev.w === s.backW || (prev.w === s.w && prev.backW === s.backW)) ? s.backW : 0;
    if (fromW && s.w > fromW) {
      const total = s.sets + s.backSets;
      const head = (k) => (k === 1 ? '第一组' : `前 ${k} 组`);
      if (s.reps < lo) return out('mix', `下次${head(s.sets)} ${kg(s.w)} 冲 ${s.reps + 1} 个`, `${kg(s.w)} 先做到 ${lo} 个，再多换一组`, fromW, s.backReps, total, { up: s.w, upSets: s.sets, upReps: s.reps + 1 });
      if (s.sets + 1 >= total) return out('reps', `下次 ${total} 组都用 ${kg(s.w)}`, `${kg(s.w)} 能做 ${s.reps} 个了，全换上去`, s.w, Math.max(lo, s.reps - 1), total);
      return out('mix', `下次${head(s.sets + 1)} ${kg(s.w)}，其余 ${kg(fromW)}`, `${kg(s.w)} 能做 ${s.reps} 个了，再多换一组`, fromW, s.backReps, total, { up: s.w, upSets: s.sets + 1, upReps: s.reps });
    }

    // 比之前最好的轻（隔久了回来、退过一次）：按上次的成绩直接往回加
    const best = Math.max(0, ...ss.slice(0, -1).filter(x => days(x.date, s.date) <= 56).map(x => x.w));
    if (best > s.w) {
      let pick = null;
      const cap = Math.min(best, s.w + Math.max(inc, s.w * 0.08)); // 一次最多往回加 8%，两三次回去
      for (let w2 = r2(s.w + inc); w2 <= cap + 1e-6; w2 = r2(w2 + inc)) {
        const r = repsAt(s, w2);
        if (r >= lo) pick = { w: w2, r: Math.min(fixed ? lo : hi - 1, r) };
        else break;
      }
      if (pick) return out('weight', `下次试 ${kg(pick.w)} × ${pick.r}`, `离你之前的 ${kg(best)} 还差一点，按上次的成绩往回加`, pick.w, pick.r);
    }

    // 到区间顶了：先补够组数，再加重量
    const habitSets = median(ss.slice(-6).map(x => x.sets));
    const minSets = ss.length >= 3 && habitSets <= 2 ? habitSets : 3;
    const top = s.reps >= hi || (easy && !fixed && s.reps >= hi - 2);
    if (top) {
      if (s.sets < minSets) return out('sets', `下次做 ${minSets} 组 × ${s.reps}`, `${s.reps} 个做满了，先补够 ${minSets} 组再加重量`, s.w, s.reps, minSets);
      let k = Math.max(1, Math.floor((s.w * pf.pct + 1e-9) / inc));
      if (easy) k = Math.max(k, Math.min(k * 2, Math.floor((s.w * 0.1 + 1e-9) / inc)));
      const w2 = r2(s.w + k * inc);
      const match = repsAt(s, w2);
      // 你以前就这么跳过、次数没掉（器械 45 → 50 → 55 都是 4×10）：照你的来
      const proven = ss.some((x, i) => i > 0 && x.w - ss[i - 1].w >= w2 - s.w - 1e-6 && x.w > ss[i - 1].w && x.reps >= ss[i - 1].reps);
      // 一档就跨很多（6kg 的哑铃加到 8kg）：先多一组；组数够了就第一组先换上去，一组一组换
      if (match < lo - 2 && !proven) {
        if (s.sets < 4) return out('sets', `下次做 ${s.sets + 1} 组 × ${s.reps}`, `往上一档就是 ${kg(w2)}，跨度大，先多做一组`, s.w, s.reps, s.sets + 1);
        return out('mix', `下次第一组试 ${kg(w2)}，其余 ${kg(s.w)}`, `${kg(s.w)} 往上一档就是 ${kg(w2)}，跨度大，一组一组换上去`, s.w, s.reps, 0, { up: w2, upSets: 1, upReps: Math.max(lo, match) });
      }
      const r = fixed && (w2 / s.w <= 1.075 || proven) ? lo : Math.max(lo, Math.min(match, fixed ? lo : hi - 1));
      return out('weight', `下次${easy ? '直接' : ''}试 ${kg(w2)} × ${r}`,
        easy ? '上次说还能加，多加一点' : fixed ? `上次 ${s.sets}×${s.reps} 都做满了，加 ${kg(w2 - s.w)}` : `${s.sets} 组都做到 ${s.reps} 个了（${range}），加重量`, w2, r);
    }

    // 卡住了：同一个重量连着三次没多做一个
    const stuck = stuckCount(ss);
    if (stuck >= (opts.cut ? 4 : 3)) {
      const w2 = down(s.w, inc, 0.1);
      const r = Math.min(hi, Math.max(lo, repsAt(s, w2)));
      return out('deload', `先退到 ${kg(w2)} × ${r}，再加回来`, `连着 ${stuck} 次卡在 ${kg(s.w)}，退一点练顺了，通常就冲过去了`, w2, r, 0, { stuck });
    }
    if (stuck >= 3) return out('keep', `保住 ${kg(s.w)} 就是赚`, `连着 ${stuck} 次在 ${kg(s.w)} 没多做一个；减脂期热量少，能保住就是在进步，再卡一次就退一点`, s.w, s.reps, 0, { stuck });

    // 往上爬次数
    const to = Math.min(hi, s.reps + (easy ? 2 : 1));
    return out('reps', `下次冲 ${to} 次`, fixed ? `每次 ${lo} 个，做满 ${s.sets} 组就加重量` : `${range}，做到 ${hi} 个就加重量`, s.w, to);
  }

  /** 排好几天的计划：假设这次照着做到了，当成一次记录接在后面 */
  function asSession(n, date) {
    return { date, w: n.weightKg || 0, sets: n.sets || 3, reps: n.reps || 8, rpe: 8, e1: e1rm(n.weightKg, n.reps), sim: true };
  }

  TF.Overload = { next, sessions, profileOf, incOf, bandOf, e1rm, asSession };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Overload;
})(typeof window !== 'undefined' ? window : globalThis);
