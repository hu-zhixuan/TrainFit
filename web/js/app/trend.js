/**
 * 趋势页（v12 重做，用户：「最近几天、7 天、10 天、30 天的趋势更可视化…精美的动效…参考 Arena 的布局…
 * 7 天 30 天的运动和饮食总结…重量追踪…划卡片看过去 30 天的每一天」）：
 *  小人点评（+ 让 AI 细看）→ 四个数（和上一段比）→ 每天吃了多少（对预算）→ 蛋白质 → 热量从哪儿来 → 训练（每天训练量 + 各部位）→ 体重（七天平均线）
 *  → 动作排行（点开看重量曲线）→ 吃的排行（蛋白 / 热量靠什么）→ 过去 30 天划卡片（存成计划、照这天练）。
 * 图都是手写 SVG：柱子从底下长出来、线一笔画出来、数字滚上去（减少动态效果时都不动）；手指划过图有竖线和数，点一下跳到那天的卡片。
 * 颜色按用途：单个系列一个颜色，超预算用状态色（图例写着），三大营养素用验证过的三色（dataviz 参考色板前三位）。
 */
Object.assign(FitnessApp.prototype, {
  /**
   * 趋势页最上面：小人用几句大白话点评这段时间（本机算，不调大模型）。
   * 记了几天、热量赤字照这样一个月大概少多少、蛋白够不够、练了几天哪个动作涨了、体重往哪走。最多 3 句。
   */
  trendReview(n) {
    const today = getTodayDateString();
    const simple = this.isSimple();
    const dates = [];
    for (let i = n - 1; i >= 0; i--) dates.push(shiftDateString(today, -i));
    const sums = dates.map(d => ({ d, s: this.getDaySummary(d) }));
    const logged = sums.filter(x => x.s.hasLogs).length;
    const name = this.callName ? this.callName() : '';
    const range = n === 7 ? '这一周' : `这 ${n} 天`;
    if (logged < 2) {
      return { head: `${name ? name + '，' : ''}${range}只记了 ${logged} 天`, lines: ['吃完一顿随口说一句就算一条，记上三天，我就能看出点门道。'] };
    }
    // 刚开始用的人，按开始用以来的天数算记得勤不勤
    const first = this.recordDates ? this.recordDates().reduce((m, d) => (d < m ? d : m), today) : dates[0];
    const span = Math.min(n, Math.round((new Date(today + 'T00:00:00') - new Date(first + 'T00:00:00')) / 86400000) + 1);
    const praise = logged >= span * 0.8 ? '，很稳' : logged >= span * 0.5 ? '，还行' : '，断得有点多';
    const head = `${name ? name + '，' : ''}${range}记了 ${logged} 天${praise}`;
    const lines = [];
    const eat = sums.filter(x => x.s.hasDiet);
    const goal = this.profile.goalType || 'fat_loss';
    if (eat.length >= 2) {
      if (simple) {
        const over = eat.filter(x => x.s.remaining < 0).length;
        lines.push(over ? `有 ${over} 天吃超了，其他天都在预算里` : '每天都没超预算，厉害');
      } else {
        const avg = Math.round(eat.reduce((a, x) => a + x.s.deficit, 0) / eat.length);
        const kg = round1(Math.abs(avg) * 30 / 7700);
        if (goal === 'muscle_gain') lines.push(avg < 0 ? `平均每天多吃 ${-avg} kcal，增肌够用` : `增肌得吃够，现在平均每天还少吃 ${avg} kcal`);
        else if (goal === 'maintain') lines.push(Math.abs(avg) < 250 ? '热量基本持平，稳' : avg > 0 ? `平均每天少吃 ${avg} kcal，比保持体重要的少` : `平均每天多吃 ${-avg} kcal，体重可能会往上走`);
        else if (avg >= 900) lines.push(`热量赤字平均 ${avg}，有点大，可能有几顿没记上；真吃这么少容易掉肌肉`);
        else if (avg >= 300) lines.push(`平均每天热量赤字 ${avg}，照这样一个月大概少 ${kg} kg 脂肪`);
        else if (avg > 0) lines.push(`热量赤字平均 ${avg}，有点小，想快一点每天少吃一口`);
        else lines.push(`平均每天多吃了 ${-avg} kcal，减脂的话得收一收`);
        const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : (this.profile.targetProteinG || 0);
        const p = Math.round(eat.reduce((a, x) => a + x.s.protein, 0) / eat.length);
        if (target > 0) {
          if (p >= target * 0.9) lines.push(`蛋白平均 ${p}g，够了`);
          else {
            const bfDays = eat.map(x => this.diet.filter(r => r.date === x.d && r.mealType === '早餐')).filter(l => l.length);
            const bf = bfDays.length ? bfDays.reduce((a, l) => a + l.reduce((t, r) => t + (r.proteinG || 0), 0), 0) / bfDays.length : null;
            lines.push(`蛋白平均 ${p}g，离 ${Math.round(target)}g 还差 ${Math.round(target - p)}g` + (bf !== null && bf < 12 ? '，早餐加个蛋、一杯奶' : ''));
          }
        }
      }
    }
    if (!simple) {
      const lifts = this.workouts.filter(w => w.date >= dates[0] && w.date <= today);
      const trainDays = new Set(lifts.map(w => w.date)).size;
      if (!trainDays) lines.push(`${range}还没练，找一天动一动`);
      else {
        // 这段时间里涨得最多的动作（同一个动作第一次和最后一次比）
        let best = null;
        [...new Set(lifts.filter(w => !w.durationMin && w.weightKg > 0).map(w => w.exerciseName))].forEach(nm => {
          const l = lifts.filter(w => w.exerciseName === nm && !w.durationMin).sort((x, y) => (x.date === y.date ? recordTs(x) - recordTs(y) : (x.date > y.date ? 1 : -1)));
          const up = l.length > 1 ? l[l.length - 1].weightKg - l[0].weightKg : 0;
          if (up > 0 && (!best || up > best.up)) best = { nm, from: l[0].weightKg, to: l[l.length - 1].weightKg, up };
        });
        lines.push(`练了 ${trainDays} 天` + (best ? `，${best.nm} ${round1(best.from)} → ${round1(best.to)}kg，有进步` : ''));
      }
    }
    const ws = this.weights.filter(w => w.date >= dates[0] && w.date <= today).sort((a, b) => (a.date > b.date ? 1 : -1));
    if (ws.length >= 2) {
      const diff = round1(ws[ws.length - 1].kg - ws[0].kg);
      const dir = diff < 0 ? '在往下走' : diff > 0 ? (goal === 'muscle_gain' ? '在往上长' : '涨了点，别慌，一两天的起伏正常') : '没变';
      lines.push(`体重 ${round1(ws[0].kg)} → ${round1(ws[ws.length - 1].kg)}kg，${dir}`);
    }
    return { head, lines: lines.slice(0, 3) };
  },

  renderTrendBuddy() {
    const el = document.getElementById('trend-buddy');
    if (!el) return;
    const r = this.trendReview(this.trendDays);
    const look = this.buddyLook();
    const st = this.buddyState();
    const art = look.show ? TF.Buddy.svg(this.buddyArt({ mood: st.mood, gear: st.gear, pose: this._coachWave ? 'wave' : 'stand' })) : '';
    // 在这页看了半天，小人补的那一句（trendNudge）
    const x = this._trendExtra && this._trendExtra.days === this.trendDays ? this._trendExtra : null;
    const more = x ? `<p class="coach-more">${esc(x.text)}</p>` + (x.next.length ? `<div class="buddy-next">${x.next.map(q => `<button class="next-chip" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '') : '';
    // v12：让健康大脑细看这几天（带上这几天一天一行的数）
    const ai = `<button class="tr-ai" type="button" data-q="帮我细看这${this.trendDays}天吃练得怎么样，哪里最该改？"><span aria-hidden="true">✦</span>让 AI 细看这 ${this.trendDays} 天</button>`;
    el.innerHTML = `<div class="coach">${art ? `<button type="button" class="coach-buddy" aria-label="小人">${art}</button>` : ''}` +
      `<div class="coach-bubble"><p class="coach-head">${esc(r.head)}</p>${r.lines.map(l => `<p>${esc(l)}</p>`).join('')}${more}${ai}</div></div>`;
    el.querySelectorAll('.next-chip, .tr-ai').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      b.disabled = true;
      window.Haptics && window.Haptics.fire('tick');
      this._trendExtra = null; // 问过了，这句收起来
      this.switchView('today');
      if (window.QuickLog) window.QuickLog.submit(b.dataset.q, { ask: true });
    }));
  },

  // ---------------------------------------------------------------------------
  // 数据
  // ---------------------------------------------------------------------------

  /** 一天的数：吃了多少、预算、三大营养素、练了啥、训练量、有氧分钟、体重 */
  trendDay(date) {
    const s = this.getDaySummary(date);
    const meals = this.diet.filter(d => d.date === date);
    const ws = this.workouts.filter(w => w.date === date);
    const lifts = ws.filter(w => !w.durationMin);
    const cardio = ws.filter(w => w.durationMin);
    const wt = this.weightOn ? this.weightOn(date) : null;
    return {
      date, s, meals, ws, lifts, cardio,
      hasDiet: s.hasDiet, hasLogs: s.hasLogs || !!wt,
      intake: Math.round(s.intake), budget: Math.round(s.budget), protein: round1(s.protein),
      carbs: round1(meals.reduce((a, d) => a + (d.carbsG || 0), 0)), fat: round1(s.fat),
      burn: Math.round(s.workoutBurn), volume: Math.round(s.totalVolume),
      minutes: cardio.reduce((a, w) => a + (w.durationMin || 0), 0),
      weight: wt ? wt.kg : null
    };
  },

  /** n 天（从今天往前，最早的在前）；back：再往前挪几段（上一段用来比） */
  trendDaysData(n, back) {
    const today = getTodayDateString();
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(this.trendDay(shiftDateString(today, -i - (back || 0) * n)));
    return out;
  },

  /** 一段时间的汇总：平均吃多少、平均预算、平均蛋白、蛋白达标几天、练了几天、总训练量、有氧分钟、体重变化 */
  trendSum(days) {
    const eat = days.filter(d => d.hasDiet);
    const avg = (k) => (eat.length ? eat.reduce((a, d) => a + d[k], 0) / eat.length : null);
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : (this.profile.targetProteinG || 0);
    const ws = days.filter(d => d.weight != null);
    return {
      eatDays: eat.length, logged: days.filter(d => d.hasLogs).length,
      intake: avg('intake'), budget: avg('budget'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat'),
      deficit: eat.length ? eat.reduce((a, d) => a + d.s.deficit, 0) / eat.length : null,
      over: eat.filter(d => d.intake > d.budget + 50).length,
      proteinTarget: Math.round(target), proteinOk: eat.filter(d => target && d.protein >= target * 0.9).length,
      trainDays: days.filter(d => d.ws.length).length, volume: days.reduce((a, d) => a + d.volume, 0), minutes: days.reduce((a, d) => a + d.minutes, 0),
      w0: ws.length ? ws[0].weight : null, w1: ws.length ? ws[ws.length - 1].weight : null, wn: ws.length
    };
  },

  // ---------------------------------------------------------------------------
  // 画
  // ---------------------------------------------------------------------------

  renderTrend() {
    const $ = (id) => document.getElementById(id);
    const sec = $('view-trend');
    // 每次画（切到这页、换天数）都重新播一遍进场动画
    sec.classList.remove('tr-anim');
    void sec.offsetWidth;
    sec.classList.add('tr-anim');
    sec.querySelectorAll('.tr-card').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
    this.renderTrendBuddy();
    document.querySelectorAll('#trend-range .seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.range) === this.trendDays));
    const n = this.trendDays;
    const days = this.trendDaysData(n);
    const cur = this.trendSum(days), prev = this.trendSum(this.trendDaysData(n, 1));
    this._trendDays = days;
    this.renderTrendKpis($('tr-kpis'), days, cur, prev);
    this.drawEnergyChart(days, cur);
    this.drawProteinChart(days, cur);
    this.drawMacros($('tr-macro-body'), cur);
    this.drawTrainChart(days, cur);
    this.drawWeightChart($('weight-chart'), days);
    this.renderProgressList($('progress-list'));
    this.renderFoodBoard();
    this.renderDayCards($('tr-days'));
    this.trendCountUp(sec);
  },

  /** 数字从 0 滚上去（0.7 秒，先快后慢）；减少动态效果时直接显示 */
  trendCountUp(root) {
    const els = [...root.querySelectorAll('[data-count]')];
    const fin = (el) => { el.textContent = el.dataset.text; };
    if (this.reducedMotion && this.reducedMotion()) { els.forEach(fin); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      els.forEach(el => {
        const v = parseFloat(el.dataset.count) * e;
        const dec = +el.dataset.dec || 0;
        el.textContent = k >= 1 ? el.dataset.text : (el.dataset.sign && v > 0 ? '+' : '') + (dec ? v.toFixed(dec) : fmt(Math.round(v)));
      });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /** 四个数：平均吃多少 / 平均蛋白 / 练了几天 / 体重变化，各带一条小线和「比上一段」 */
  renderTrendKpis(el, days, cur, prev) {
    const simple = this.isSimple();
    const goal = this.profile.goalType || 'fat_loss';
    const num = (v, dec, text, sign) => `<b class="kpi-v" data-count="${v}" data-dec="${dec || 0}" data-text="${esc(text)}"${sign ? ' data-sign="1"' : ''}>${esc(text)}</b>`;
    const delta = (a, b, unit, goodUp, dec) => {
      if (a == null || b == null) return '<span class="kpi-d">上一段没记</span>';
      const d = dec ? round1(a - b) : Math.round(a - b);
      if (!d) return '<span class="kpi-d">和上一段一样</span>';
      const good = goodUp == null ? '' : (d > 0) === goodUp ? ' good' : ' bad';
      return `<span class="kpi-d${good}">${d > 0 ? '↑' : '↓'} ${Math.abs(d)}${unit} <i>比上 ${days.length} 天</i></span>`;
    };
    const spark = (vals, cls) => {
      const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
      if (pts.length < 2) return '<svg class="kpi-spark" viewBox="0 0 100 24" aria-hidden="true"></svg>';
      const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
      const x = (i) => (i / Math.max(1, vals.length - 1)) * 96 + 2, y = (v) => 21 - ((v - lo) / Math.max(1e-6, hi - lo)) * 18;
      const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
      const last = pts[pts.length - 1];
      return `<svg class="kpi-spark ${cls || ''}" viewBox="0 0 100 24" aria-hidden="true"><path class="draw" pathLength="1" d="${d}"/><circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="2.6"/></svg>`;
    };
    const tiles = [];
    tiles.push(`<div class="kpi"><span class="kpi-l">平均每天吃</span><div class="kpi-row">${cur.intake == null ? '<b class="kpi-v">–</b>' : num(Math.round(cur.intake), 0, fmt(cur.intake))}<small>kcal</small></div>` +
      `${spark(days.map(d => (d.hasDiet ? d.intake : null)))}${delta(cur.intake, prev.intake, '', goal === 'muscle_gain' ? true : goal === 'fat_loss' ? false : null)}` +
      `<span class="kpi-x">${cur.budget ? `预算 ${fmt(cur.budget)}` : ''}${!simple && cur.deficit != null ? ` · 赤字 ${fmt(cur.deficit)}` : ''}</span></div>`);
    tiles.push(`<div class="kpi"><span class="kpi-l">平均蛋白</span><div class="kpi-row">${cur.protein == null ? '<b class="kpi-v">–</b>' : num(Math.round(cur.protein), 0, String(Math.round(cur.protein)))}<small>g</small></div>` +
      `${spark(days.map(d => (d.hasDiet ? d.protein : null)), 'pro')}${delta(cur.protein, prev.protein, 'g', true)}` +
      `<span class="kpi-x">${cur.proteinTarget ? `目标 ${cur.proteinTarget}g · 够了 ${cur.proteinOk} 天` : ''}</span></div>`);
    if (simple) {
      tiles.push(`<div class="kpi"><span class="kpi-l">记了</span><div class="kpi-row">${num(cur.logged, 0, String(cur.logged))}<small>/ ${days.length} 天</small></div>` +
        `${spark(days.map(d => (d.hasLogs ? 1 : 0)))}${delta(cur.logged, prev.logged, ' 天', true)}<span class="kpi-x">超预算 ${cur.over} 天</span></div>`);
    } else {
      tiles.push(`<div class="kpi"><span class="kpi-l">练了</span><div class="kpi-row">${num(cur.trainDays, 0, String(cur.trainDays))}<small>/ ${days.length} 天</small></div>` +
        `${spark(days.map(d => d.volume || (d.minutes ? 1 : 0)), 'lift')}${delta(cur.trainDays, prev.trainDays, ' 天', true)}` +
        `<span class="kpi-x">${cur.volume ? `训练量 ${cur.volume >= 10000 ? round1(cur.volume / 1000) + ' 吨' : fmt(cur.volume) + ' kg'}` : '还没练力量'}${cur.minutes ? ` · 有氧 ${cur.minutes} 分` : ''}</span></div>`);
    }
    const dw = cur.wn >= 2 ? round1(cur.w1 - cur.w0) : null;
    tiles.push(`<div class="kpi"><span class="kpi-l">体重</span><div class="kpi-row">${dw == null ? `<b class="kpi-v">${cur.w1 != null ? round1(cur.w1) : '–'}</b><small>${cur.w1 != null ? 'kg' : ''}</small>` : num(dw, 1, (dw > 0 ? '+' : '') + dw, true) + '<small>kg</small>'}</div>` +
      `${spark(days.map(d => d.weight), 'wt')}` +
      `<span class="kpi-d${dw ? ((dw < 0) === (goal !== 'muscle_gain') ? ' good' : ' bad') : ''}">${dw == null ? (cur.wn ? '再称一次就有变化' : '这几天没称') : `${round1(cur.w0)} → ${round1(cur.w1)}`}</span><span class="kpi-x">称了 ${cur.wn} 次</span></div>`);
    el.innerHTML = tiles.join('');
  },

  /** 图的骨架：x 位置、y 比例、网格；min/max 按「好看的刻度」取整 */
  trendFrame(n, lo, hi, opts) {
    opts = opts || {};
    const W = 340, H = opts.h || 168, padL = 38, padR = 8, padT = 12, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    const niceStep = (range) => {
      const raw = range / (opts.ticks || 3);
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      const k = raw / mag;
      return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * mag;
    };
    const step = niceStep((hi - lo) || 1);
    const max = Math.ceil(hi / step) * step || step, min = Math.floor(lo / step) * step;
    const slot = iw / n;
    const y = (v) => padT + ((max - v) / (max - min || 1)) * ih;
    const cx = (i) => padL + i * slot + slot / 2;
    let grid = '';
    for (let v = min; v <= max + 1e-6; v += step) {
      const t = opts.dec ? round1(v) : Math.abs(v) >= 1000 ? round1(v / 1000) + 'k' : fmt(v);
      grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis-text" x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${t}</text>`;
    }
    return { W, H, padL, padR, padT, padB, iw, ih, slot, y, cx, min, max, grid };
  },

  /** x 轴的字：7 天以内写周几，多了隔几天写一个日期 */
  trendXLabels(days, f) {
    const n = days.length;
    const every = n <= 7 ? 1 : n <= 10 ? 2 : 5;
    return days.map((d, i) => {
      if ((n - 1 - i) % every) return '';
      const t = d.date === getTodayDateString() ? '今天' : n <= 7 ? '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()] : d.date.slice(5).replace('-', '/').replace(/^0/, '');
      return `<text class="axis-text" x="${f.cx(i).toFixed(1)}" y="${f.H - 6}" text-anchor="middle">${t}</text>`;
    }).join('');
  },

  /** 一根柱子（数据那头 4px 圆角、底下直角），从 base 长到 top */
  trendBar(x, w, base, top, cls, i) {
    const up = top <= base;
    const h = Math.abs(base - top);
    if (h < 0.5) return '';
    const r = Math.min(4, w / 2, h);
    const t = Math.min(base, top), b = Math.max(base, top);
    const d = up
      ? `M${x},${b} V${t + r} Q${x},${t} ${x + r},${t} H${x + w - r} Q${x + w},${t} ${x + w},${t + r} V${b} Z`
      : `M${x},${t} V${b - r} Q${x},${b} ${x + r},${b} H${x + w - r} Q${x + w},${b} ${x + w},${b - r} V${t} Z`;
    return `<path class="bar ${cls}${up ? '' : ' down'}" style="--d:${Math.min(i, 30) * 22}ms" d="${d}"/>`;
  },

  /**
   * 手指 / 鼠标划过：竖线跟着走、停在最近的那天，旁边写这天的数；点一下：下面的 30 天卡片划到这天。
   * rows(i) → [[颜色类, 名字, 值], …]，这天没数返回 null
   */
  trendHover(el, f, days, rows) {
    const svg = el.querySelector('svg');
    const tip = el.querySelector('.chart-tip');
    const hair = svg.querySelector('.xhair');
    if (!svg || !tip) return;
    const pick = (ev) => {
      const box = svg.getBoundingClientRect();
      const x = ((ev.clientX - box.left) / box.width) * f.W;
      const i = Math.max(0, Math.min(days.length - 1, Math.floor((x - f.padL) / f.slot)));
      return { i, box };
    };
    const show = (ev) => {
      const { i, box } = pick(ev);
      const r = rows(i);
      const d = days[i];
      const label = `${+d.date.slice(5, 7)}月${+d.date.slice(8)}日 周${WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()]}`;
      tip.innerHTML = '';
      const h = document.createElement('div');
      h.className = 'tip-date';
      h.textContent = label;
      tip.appendChild(h);
      (r || [['', '这天没记', '']]).forEach(([cls, name, val]) => {
        const row = document.createElement('div');
        row.className = 'tip-row';
        row.innerHTML = cls ? `<i class="tip-key ${cls}"></i>` : '';
        const b = document.createElement('b'); b.textContent = val; row.appendChild(b);
        const s = document.createElement('span'); s.textContent = name; row.appendChild(s);
        tip.appendChild(row);
      });
      const scale = box.width / f.W;
      hair.setAttribute('x1', f.cx(i)); hair.setAttribute('x2', f.cx(i));
      hair.classList.remove('hidden');
      tip.classList.remove('hidden');
      const left = f.cx(i) * scale;
      tip.style.left = Math.min(Math.max(left, tip.offsetWidth / 2 + 4), box.width - tip.offsetWidth / 2 - 4) + 'px';
      return i;
    };
    const hide = () => { tip.classList.add('hidden'); hair.classList.add('hidden'); };
    svg.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') show(ev); });
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
    svg.addEventListener('click', (ev) => {
      const i = show(ev);
      window.Haptics && window.Haptics.fire('tick');
      this.trendFocusDay(days[i].date);
      clearTimeout(this._tipT);
      this._tipT = setTimeout(hide, 3200);
    });
  },

  /** 每天吃了多少：柱子对着那天的预算，超了的用「超预算」的颜色；虚线是这几天的平均预算 */
  drawEnergyChart(days, cur) {
    const el = document.getElementById('trend-chart');
    const legend = document.getElementById('tr-energy-legend');
    const sub = document.getElementById('tr-energy-sub');
    if (!cur.eatDays) {
      legend.innerHTML = '';
      sub.textContent = '';
      el.innerHTML = '<div class="chart-empty">记几顿饭，这里会画出每天吃了多少、超没超预算</div>';
      return;
    }
    legend.innerHTML = '<span><i class="sw sw-pos"></i>没超</span><span><i class="sw sw-neg"></i>超预算</span><span><i class="sw sw-target"></i>预算</span>';
    const simple = this.isSimple();
    sub.innerHTML = `平均 <b>${fmt(cur.intake)}</b> kcal · ${cur.over ? `超了 <b>${cur.over}</b> 天` : '没超过预算'}` +
      (!simple && cur.deficit != null ? ` · 赤字合计折合脂肪 <b>${round1(Math.max(0, cur.deficit * cur.eatDays) / 7700)}</b> kg` : '');
    const vals = days.filter(d => d.hasDiet).map(d => d.intake);
    const f = this.trendFrame(days.length, 0, Math.max(...vals, cur.budget || 0) * 1.08);
    const bw = Math.min(24, f.slot * (days.length > 14 ? 0.62 : 0.56));
    const base = f.y(0);
    const bars = days.map((d, i) => (d.hasDiet ? this.trendBar(f.cx(i) - bw / 2, bw, base, f.y(d.intake), d.intake > d.budget + 50 ? 'neg' : 'pos', i) : '')).join('');
    const avgB = f.y(cur.budget || 0);
    // 最多的那天在柱子顶上写个数（只写这一个）
    const top = days.reduce((m, d, i) => (d.hasDiet && (m < 0 || d.intake > days[m].intake) ? i : m), -1);
    const peak = top >= 0 && days.length <= 14 ? `<text class="val-text" x="${f.cx(top).toFixed(1)}" y="${(f.y(days[top].intake) - 5).toFixed(1)}" text-anchor="middle">${fmt(days[top].intake)}</text>` : '';
    el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="每天吃了多少的柱状图">${f.grid}` +
      `<line class="base" x1="${f.padL}" x2="${f.W - f.padR}" y1="${base}" y2="${base}"/>${bars}` +
      (cur.budget ? `<line class="target draw-h" x1="${f.padL}" x2="${f.W - f.padR}" y1="${avgB.toFixed(1)}" y2="${avgB.toFixed(1)}"/>` : '') +
      `${peak}${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${base}"/></svg><div class="chart-tip hidden"></div>`;
    this.trendHover(el, f, days, (i) => {
      const d = days[i];
      if (!d.hasDiet) return null;
      const left = d.budget - d.intake;
      return [[d.intake > d.budget + 50 ? 'neg' : 'pos', '吃了', fmt(d.intake) + ' kcal'], ['target', left >= 0 ? '还剩' : '超了', fmt(Math.abs(left))], ['pro', '蛋白', round1(d.protein) + 'g']];
    });
  },

  /** 蛋白质：一条线 + 淡淡的面积，横线是每天的目标；最后一个点写数 */
  drawProteinChart(days, cur) {
    const el = document.getElementById('tr-protein-chart');
    const sub = document.getElementById('tr-protein-sub');
    const legend = document.getElementById('tr-protein-legend');
    const pts = days.map((d, i) => (d.hasDiet ? [i, d.protein] : null)).filter(Boolean);
    if (!pts.length) { el.innerHTML = '<div class="chart-empty">记几顿饭，这里会画出每天吃够蛋白没有</div>'; sub.textContent = ''; legend.innerHTML = ''; return; }
    const target = cur.proteinTarget;
    legend.innerHTML = `<span><i class="sw sw-line pro"></i>蛋白</span>${target ? '<span><i class="sw sw-target"></i>目标</span>' : ''}`;
    sub.innerHTML = `平均 <b>${Math.round(cur.protein)}</b>g` + (target ? ` · 目标 ${target}g · 够了 <b>${cur.proteinOk}</b> / ${cur.eatDays} 天` : '');
    const f = this.trendFrame(days.length, 0, Math.max(target || 0, ...pts.map(p => p[1])) * 1.12);
    const line = this.trendLine(f, pts);
    const last = pts[pts.length - 1];
    const dots = days.length <= 10 ? pts.map(p => `<circle class="dot pro" style="--d:${p[0] * 40 + 300}ms" cx="${f.cx(p[0]).toFixed(1)}" cy="${f.y(p[1]).toFixed(1)}" r="4"/>`).join('') :
      `<circle class="dot pro" style="--d:700ms" cx="${f.cx(last[0]).toFixed(1)}" cy="${f.y(last[1]).toFixed(1)}" r="4"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="每天蛋白质的折线图">${f.grid}` +
      (target ? `<line class="target draw-h" x1="${f.padL}" x2="${f.W - f.padR}" y1="${f.y(target).toFixed(1)}" y2="${f.y(target).toFixed(1)}"/>` : '') +
      `<defs><linearGradient id="tr-gpro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs pro"/><stop offset="1" class="gs pro end"/></linearGradient></defs>` +
      `<path class="area pro" fill="url(#tr-gpro)" d="${line.area}"/><path class="line pro draw" pathLength="1" d="${line.d}"/>${dots}` +
      `<text class="val-text" x="${Math.min(f.cx(last[0]), f.W - f.padR - 12).toFixed(1)}" y="${(f.y(last[1]) - 9).toFixed(1)}" text-anchor="middle">${Math.round(last[1])}g</text>` +
      `${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${f.y(0)}"/></svg><div class="chart-tip hidden"></div>`;
    this.trendHover(el, f, days, (i) => {
      const d = days[i];
      if (!d.hasDiet) return null;
      return [['pro', '蛋白', round1(d.protein) + 'g'], ['target', target ? (d.protein >= target ? '够了' : '还差') : '', target ? (d.protein >= target ? '✓' : Math.round(target - d.protein) + 'g') : '']].filter(r => r[1]);
    });
  },

  /** 折线（没记的日子断开）和它下面的面积 */
  trendLine(f, pts) {
    let d = '', area = '', seg = [];
    const flush = () => {
      if (!seg.length) return;
      const xy = seg.map(p => [f.cx(p[0]), f.y(p[1])]);
      d += xy.map((q, k) => `${k ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ') + ' ';
      if (xy.length > 1) area += `M${xy[0][0].toFixed(1)},${f.y(f.min).toFixed(1)} ` + xy.map(q => `L${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ') + ` L${xy[xy.length - 1][0].toFixed(1)},${f.y(f.min).toFixed(1)} Z `;
      seg = [];
    };
    pts.forEach((p, k) => { if (k && p[0] - pts[k - 1][0] > 1) flush(); seg.push(p); });
    flush();
    return { d: d.trim(), area: area.trim() };
  },

  /** 热量从哪儿来：一根横着的堆叠条（蛋白 / 碳水 / 脂肪各占多少热量），下面写每天平均几克 */
  drawMacros(el, cur) {
    const note = document.getElementById('tr-macro-note');
    if (!cur.eatDays) { el.innerHTML = '<div class="chart-empty">记几顿饭就知道热量主要从哪儿来</div>'; note.textContent = ''; return; }
    const k = [['pro', '蛋白质', cur.protein * 4, cur.protein], ['carb', '碳水', cur.carbs * 4, cur.carbs], ['fat', '脂肪', cur.fat * 9, cur.fat]];
    const tot = k.reduce((a, x) => a + x[2], 0) || 1;
    const pct = k.map(x => Math.round((x[2] / tot) * 100));
    pct[1] = 100 - pct[0] - pct[2]; // 加起来正好 100
    note.textContent = `每天平均 · ${cur.eatDays} 天`;
    const goal = this.profile.goalType || 'fat_loss';
    const tip = pct[0] < 20 ? '蛋白占得少，每顿先吃一份肉蛋奶豆' : pct[2] > 38 ? '脂肪占得有点多，油大的少点' : goal === 'muscle_gain' && pct[1] < 40 ? '增肌碳水可以再多点，练前练后吃' : '比例挺好';
    el.innerHTML = `<div class="macro-bar" role="img" aria-label="蛋白质 ${pct[0]}%，碳水 ${pct[1]}%，脂肪 ${pct[2]}%">` +
      k.map((x, i) => `<i class="m-${x[0]}" style="--w:${Math.max(pct[i], 0)}%; --d:${i * 90}ms"></i>`).join('') + '</div>' +
      `<div class="macro-legend">${k.map((x, i) => `<div><i class="sw m-${x[0]}"></i><span>${x[1]}</span><b>${pct[i]}%</b><small>${Math.round(x[3])}g</small></div>`).join('')}</div>` +
      `<p class="tr-tip">${esc(tip)}</p>`;
  },

  /** 训练：每天的训练量（力量的 重量×组×次）柱子；有氧写在提示里；下面各部位练了几次，最久没练的点出来 */
  drawTrainChart(days, cur) {
    const el = document.getElementById('tr-train-chart');
    const sub = document.getElementById('tr-train-sub');
    const note = document.getElementById('tr-train-note');
    const box = document.getElementById('tr-muscles');
    note.textContent = cur.trainDays ? `练了 ${cur.trainDays} 天` : '';
    if (!cur.trainDays) {
      sub.textContent = '';
      el.innerHTML = '<div class="chart-empty">练完说一句「卧推 60 公斤 4 组 8 个」，这里会画出每天的训练量</div>';
    } else {
      sub.innerHTML = `力量训练量 <b>${cur.volume >= 10000 ? round1(cur.volume / 1000) + '</b> 吨' : fmt(cur.volume) + '</b> kg'}` + (cur.minutes ? ` · 有氧 <b>${cur.minutes}</b> 分钟` : '') + ' <span class="tr-why">（重量 × 组 × 次）</span>';
      const hi = Math.max(1, ...days.map(d => d.volume));
      const f = this.trendFrame(days.length, 0, hi * 1.1, { h: 150 });
      const bw = Math.min(24, f.slot * (days.length > 14 ? 0.62 : 0.56));
      const base = f.y(0);
      // 只练了有氧的那天：底下一个小点
      const bars = days.map((d, i) => (d.volume ? this.trendBar(f.cx(i) - bw / 2, bw, base, f.y(d.volume), 'lift', i) : d.minutes ? `<circle class="dot cardio" style="--d:${i * 22}ms" cx="${f.cx(i).toFixed(1)}" cy="${(base - 6).toFixed(1)}" r="4"/>` : '')).join('');
      el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="每天训练量的柱状图">${f.grid}<line class="base" x1="${f.padL}" x2="${f.W - f.padR}" y1="${base}" y2="${base}"/>${bars}` +
        `${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${base}"/></svg><div class="chart-tip hidden"></div>`;
      this.trendHover(el, f, days, (i) => {
        const d = days[i];
        if (!d.ws.length) return null;
        const names = [...new Set(d.ws.map(w => w.exerciseName))];
        return [d.volume ? ['lift', '训练量', fmt(d.volume) + ' kg'] : null, d.minutes ? ['cardio', '有氧', d.minutes + ' 分钟'] : null, ['', names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' : ''), '']].filter(Boolean);
      });
    }
    // 各部位：这几天练了几次（同一天同一个部位算一次）；最久没练的大肌群点出来（薄肌要练得匀）
    const groups = ['胸部', '背部', '腿部', '肩部', '手臂', '核心'];
    const cnt = groups.map(g => new Set(days.filter(d => d.lifts.some(w => w.muscleGroup === g)).map(d => d.date)).size);
    const max = Math.max(1, ...cnt);
    const today = getTodayDateString();
    const lastOf = (g) => this.workouts.filter(w => w.muscleGroup === g).reduce((m, w) => (w.date > m ? w.date : m), '');
    const gap = groups.slice(0, 4).map(g => ({ g, last: lastOf(g) })).filter(x => x.last)
      .map(x => Object.assign(x, { days: Math.round((new Date(today + 'T00:00:00') - new Date(x.last + 'T00:00:00')) / 86400000) }))
      .sort((a, b) => b.days - a.days)[0];
    box.innerHTML = cur.trainDays || this.workouts.length ? `<div class="mus-head">各部位练了几天</div>` + groups.map((g, i) => `<div class="mus-row"><span>${g.replace('部', '')}</span>` +
      `<div class="mus-track"><i style="--w:${(cnt[i] / max) * 100}%; --d:${i * 60}ms"></i></div><b>${cnt[i]}</b></div>`).join('') +
      (gap && gap.days >= 6 ? `<p class="tr-tip">${gap.g.replace('部', '')}已经 ${gap.days} 天没练了，下次安排上</p>` : '') : '';
  },

  /** 体重：每次称的点（淡）+ 七天平均线（实的，看走向不看一天的起伏） */
  drawWeightChart(el, days) {
    const legend = document.getElementById('weight-legend');
    const sub = document.getElementById('weight-sub');
    const tr = this.weightTrend();
    legend.textContent = tr ? `最新 ${round1(tr.last.kg)} kg` : '';
    const pts = days.map((d, i) => (d.weight != null ? [i, d.weight] : null)).filter(Boolean);
    if (pts.length < 2) {
      sub.textContent = '';
      el.innerHTML = `<div class="chart-empty">${this.weights.length ? `这 ${days.length} 天称了 ${pts.length} 次，再称几次就有曲线` : '说「体重 62.5」就能记，记几天后这里会画出曲线'}</div>`;
      return;
    }
    // 七天平均：每个点往前 7 天里称过的平均（用全部记录算，不只这几天）
    const avg = days.map((d, i) => {
      const from = shiftDateString(d.date, -6);
      const ws = this.weights.filter(w => w.date >= from && w.date <= d.date);
      return ws.length && (d.weight != null || i === days.length - 1 || pts.some(p => p[0] < i) && pts.some(p => p[0] > i)) ? [i, ws.reduce((a, w) => a + w.kg, 0) / ws.length] : null;
    }).filter(Boolean);
    const all = pts.map(p => p[1]).concat(avg.map(p => p[1]));
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = Math.max(0.4, (hi - lo) * 0.25);
    const f = this.trendFrame(days.length, lo - pad, hi + pad, { dec: true });
    const diff = round1(pts[pts.length - 1][1] - pts[0][1]);
    sub.innerHTML = `${round1(pts[0][1])} → <b>${round1(pts[pts.length - 1][1])}</b> kg（${diff > 0 ? '+' : ''}${diff}）· 线是七天平均`;
    const line = this.trendLine(f, avg);
    el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="体重变化">${f.grid}` +
      pts.map(p => `<circle class="dot wt-raw" style="--d:${p[0] * 30}ms" cx="${f.cx(p[0]).toFixed(1)}" cy="${f.y(p[1]).toFixed(1)}" r="4"/>`).join('') +
      `<path class="line wt draw" pathLength="1" d="${line.d}"/>` +
      `${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${f.H - f.padB}"/></svg><div class="chart-tip hidden"></div>`;
    this.trendHover(el, f, days, (i) => {
      const d = days[i];
      const a = avg.find(p => p[0] === i);
      if (d.weight == null && !a) return null;
      return [d.weight != null ? ['wt-raw', '这天称', round1(d.weight) + ' kg'] : null, a ? ['wt', '七天平均', round1(a[1]) + ' kg'] : null].filter(Boolean);
    });
  },

  // ---------------------------------------------------------------------------
  // 排行（Arena 那种表：名次、名字、一根细条、数）
  // ---------------------------------------------------------------------------

  /** 一个动作每次练的最重一组（按天），最早的在前；e1rm 按 Epley 估的一次最大 */
  liftSessions(name) {
    const byDay = new Map();
    this.workouts.filter(w => w.exerciseName === name && !w.durationMin).forEach(w => {
      const e1rm = w.weightKg > 0 ? w.weightKg * (1 + Math.min(w.reps || 1, 12) / 30) : 0;
      const cur = byDay.get(w.date);
      const vol = (w.weightKg || 0) * (w.sets || 0) * (w.reps || 0);
      if (!cur) byDay.set(w.date, { date: w.date, top: w, e1rm, volume: vol, sets: [w] });
      else {
        cur.volume += vol;
        cur.sets.push(w);
        if ((w.weightKg || 0) > (cur.top.weightKg || 0) || ((w.weightKg || 0) === (cur.top.weightKg || 0) && (w.reps || 0) > (cur.top.reps || 0))) cur.top = w;
        cur.e1rm = Math.max(cur.e1rm, e1rm);
      }
    });
    return [...byDay.values()].sort((a, b) => (a.date > b.date ? 1 : -1));
  },

  /** 动作排行：这几天练过的动作，按这段时间涨了多少排；一行一个，带最近几次的小折线；点开看重量曲线 */
  renderProgressList(el) {
    const since = shiftDateString(getTodayDateString(), -(this.trendDays - 1));
    let names = [...new Set(this.workouts.filter(w => !w.durationMin && w.date >= since).map(w => w.exerciseName))];
    const recent = !names.length;
    if (recent) {
      names = [];
      this.workouts.filter(w => !w.durationMin).sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)))
        .forEach(w => { if (!names.includes(w.exerciseName)) names.push(w.exerciseName); });
      names = names.slice(0, 6);
    }
    if (!names.length) {
      el.innerHTML = '<div class="empty">记几次力量训练后，这里会排出每个动作涨了多少，点开看重量曲线</div>';
      return;
    }
    const rows = names.map(name => {
      const ss = this.liftSessions(name);
      const inRange = ss.filter(s => s.date >= since);
      const before = ss.filter(s => s.date < since);
      const now = (inRange.length ? inRange : ss)[(inRange.length ? inRange : ss).length - 1];
      const ref = before.length ? before[before.length - 1] : (inRange.length > 1 ? inRange[0] : null);
      const gain = ref && ref.e1rm ? (now.e1rm - ref.e1rm) / ref.e1rm : 0;
      const best = ss.reduce((m, s) => Math.max(m, s.top.weightKg || 0), 0);
      const pr = (now.top.weightKg || 0) > 0 && (now.top.weightKg || 0) >= best && ss.length > 1 && ss.slice(0, -1).every(s => (s.top.weightKg || 0) < now.top.weightKg);
      return { name, ss, now, ref, gain, pr, p: this.exerciseProgress(name) };
    }).sort((a, b) => b.gain - a.gain || b.ss.length - a.ss.length);
    const maxGain = Math.max(0.05, ...rows.map(r => Math.abs(r.gain)));
    el.innerHTML = (recent ? `<p class="tr-tip">这 ${this.trendDays} 天没练力量，下面是最近练过的</p>` : '') +
      `<div class="board">` + rows.slice(0, 10).map((r, i) => {
        const t = r.now.top;
        const pts = r.ss.slice(-8).map(s => s.top.weightKg || s.e1rm || 0);
        const lo = Math.min(...pts), hi = Math.max(...pts);
        const sp = pts.length > 1 ? `<svg class="board-spark" viewBox="0 0 60 20" aria-hidden="true"><path class="draw" pathLength="1" d="${pts.map((v, k) => `${k ? 'L' : 'M'}${(k / (pts.length - 1) * 56 + 2).toFixed(1)},${(17 - ((v - lo) / Math.max(1e-6, hi - lo)) * 14).toFixed(1)}`).join(' ')}"/></svg>` : '<span class="board-spark"></span>';
        const g = Math.round(r.gain * 100);
        return `<button type="button" class="board-row" data-lift="${esc(r.name)}">` +
          `<span class="board-rank">${i + 1}</span>` +
          `<span class="board-name"><span class="bn-top">${esc(r.name)}${r.pr ? '<em class="pr">新纪录</em>' : ''}</span><small>${t.weightKg > 0 ? round1(t.weightKg) + 'kg' : '自重'} × ${t.reps} · ${esc(r.p ? r.p.next.text : '')}</small></span>` +
          sp +
          `<span class="board-val${g > 0 ? ' up' : g < 0 ? ' down' : ''}">${r.ref ? (g > 0 ? '+' : '') + g + '%' : '新'}<i class="board-bar" style="--w:${Math.min(100, (Math.abs(r.gain) / maxGain) * 100)}%; --d:${i * 50}ms"></i></span></button>`;
      }).join('') + '</div>' +
      '<p class="tr-why">% 是这段时间估算的一次最大重量涨了多少（按重量和次数算），看得出加次数的进步</p>';
    el.querySelectorAll('.board-row').forEach(b => b.addEventListener('click', () => this.openLiftSheet(b.dataset.lift)));
  },

  /** 一个动作的重量曲线：每次最重的一组（点）+ 估算一次最大（线）；最近几次的明细；下次练多少 */
  openLiftSheet(name) {
    const ov = document.getElementById('lift-sheet');
    const body = document.getElementById('lift-sheet-body');
    if (!ov || !body) return;
    const ss = this.liftSessions(name);
    if (!ss.length) return;
    const p = this.exerciseProgress(name);
    document.getElementById('lift-sheet-title').textContent = name;
    const best = ss.reduce((m, s) => (s.top.weightKg > (m.top.weightKg || 0) ? s : m), ss[0]);
    const bestE = ss.reduce((m, s) => Math.max(m, s.e1rm), 0);
    const show = ss.slice(-24);
    const days = show.map(s => ({ date: s.date }));
    const vals = show.map(s => s.top.weightKg || 0).concat(show.map(s => s.e1rm));
    let chart = '';
    if (show.length >= 2 && Math.max(...vals) > 0) {
      const lo = Math.min(...vals.filter(v => v > 0)), hi = Math.max(...vals);
      const f = this.trendFrame(show.length, Math.max(0, lo - (hi - lo) * 0.2 - 2), hi + (hi - lo) * 0.15 + 2, { h: 170 });
      const eLine = this.trendLine(f, show.map((s, i) => [i, s.e1rm]).filter(q => q[1] > 0));
      const every = Math.ceil(show.length / 5);
      const labels = show.map((s, i) => ((show.length - 1 - i) % every ? '' : `<text class="axis-text" x="${f.cx(i).toFixed(1)}" y="${f.H - 6}" text-anchor="middle">${s.date.slice(5).replace('-', '/').replace(/^0/, '')}</text>`)).join('');
      chart = `<div class="chart lift-chart"><svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(name)}的重量曲线">${f.grid}` +
        `<path class="line e1rm draw" pathLength="1" d="${eLine.d}"/>` +
        show.map((s, i) => (s.top.weightKg > 0 ? `<circle class="dot lift${s === best ? ' best' : ''}" style="--d:${i * 30}ms" cx="${f.cx(i).toFixed(1)}" cy="${f.y(s.top.weightKg).toFixed(1)}" r="${s === best ? 5 : 4}"/>` : '')).join('') +
        `${labels}<line class="xhair hidden" y1="${f.padT}" y2="${f.H - f.padB}"/></svg><div class="chart-tip hidden"></div></div>` +
        '<div class="legend lift-legend"><span><i class="sw sw-dot lift"></i>每次最重的一组</span><span><i class="sw sw-line e1rm"></i>估算一次最大</span></div>';
      setTimeout(() => {
        const el = body.querySelector('.lift-chart');
        if (el) this.trendHover(el, f, days, (i) => {
          const s = show[i];
          return [['lift', '最重一组', `${s.top.weightKg > 0 ? round1(s.top.weightKg) + 'kg' : '自重'} × ${s.top.reps}`], ['e1rm', '估算一次最大', s.e1rm ? round1(s.e1rm) + 'kg' : '–'], ['', `${s.sets.length} 条 · 训练量 ${fmt(s.volume)}kg`, '']];
        });
      }, 0);
    }
    const list = ss.slice(-6).reverse().map(s => `<div class="lift-row"><span>${+s.date.slice(5, 7)}月${+s.date.slice(8)}日</span>` +
      `<b>${s.sets.map(w => `${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}`).join('，')}</b><small>${fmt(s.volume)}kg</small></div>`).join('');
    body.innerHTML = `<div class="lift-stats">` +
      `<div><span>最重</span><b>${best.top.weightKg > 0 ? round1(best.top.weightKg) + '<small>kg</small>' : '自重'}</b><small>${+best.date.slice(5, 7)}/${+best.date.slice(8)}</small></div>` +
      `<div><span>估算一次最大</span><b>${bestE ? round1(bestE) + '<small>kg</small>' : '–'}</b><small>按重量和次数算</small></div>` +
      `<div><span>练过</span><b>${ss.length}<small>次</small></b><small>${+ss[0].date.slice(5, 7)}/${+ss[0].date.slice(8)} 起</small></div></div>` +
      chart +
      (p ? `<div class="lift-next"><span>下次</span><b>${esc(p.next.text)}</b></div>` : '') +
      `<div class="lift-list">${list}</div>`;
    ov.classList.remove('hidden');
    history.pushState({ liftSheet: true }, '');
    const close = () => {
      ov.classList.add('hidden');
      if (history.state && history.state.liftSheet) { this._editorBack = true; history.back(); } // 只关面板，别跟着回今天页
    };
    document.getElementById('lift-sheet-close').onclick = close;
    ov.onclick = (e) => { if (e.target === ov) close(); };
    this._liftSheetClose = () => ov.classList.add('hidden');
  },

  /** 吃的排行：这段时间蛋白（或热量）主要靠哪几样（按记录里的每一样加起来） */
  renderFoodBoard() {
    const seg = document.getElementById('tr-foods-seg');
    const list = document.getElementById('tr-foods-list');
    const title = document.getElementById('tr-foods-title');
    if (!seg || !list) return;
    const mode = this._foodBoard || 'protein';
    seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.v === mode));
    if (!seg.dataset.bound) {
      seg.dataset.bound = '1';
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        this._foodBoard = b.dataset.v;
        this.renderFoodBoard();
      });
    }
    title.textContent = mode === 'protein' ? '蛋白主要靠' : '热量大头';
    const since = shiftDateString(getTodayDateString(), -(this.trendDays - 1));
    const sum = new Map();
    this.diet.filter(d => d.date >= since).forEach(d => {
      const items = Array.isArray(d.items) && d.items.length ? d.items : [{ name: d.foodSummary, calories: d.calories, proteinG: d.proteinG }];
      items.forEach(it => {
        if (it.supp) return;
        const k = String(it.name || '').replace(/\s+/g, '').slice(0, 14);
        if (!k) return;
        const x = sum.get(k) || { name: k, kcal: 0, pro: 0, times: 0 };
        x.kcal += it.calories || 0; x.pro += it.proteinG || 0; x.times += 1;
        sum.set(k, x);
      });
    });
    const key = mode === 'protein' ? 'pro' : 'kcal';
    const all = [...sum.values()];
    const total = all.reduce((a, x) => a + x[key], 0);
    const rows = all.filter(x => x[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 6);
    if (!rows.length) { list.innerHTML = '<div class="empty">这几天还没记吃的</div>'; return; }
    const max = rows[0][key];
    list.innerHTML = '<div class="board">' + rows.map((x, i) => `<div class="board-row static">` +
      `<span class="board-rank">${i + 1}</span><span class="board-name">${esc(x.name)}<small>${x.times} 次</small></span>` +
      `<span class="board-val wide">${key === 'pro' ? Math.round(x.pro) + 'g' : fmt(x.kcal) + ' kcal'}<small>${Math.round((x[key] / (total || 1)) * 100)}%</small>` +
      `<i class="board-bar ${key}" style="--w:${(x[key] / max) * 100}%; --d:${i * 50}ms"></i></span></div>`).join('') + '</div>';
  },

  // ---------------------------------------------------------------------------
  // 过去 30 天：一天一张卡片，左右划
  // ---------------------------------------------------------------------------

  renderDayCards(el) {
    const today = getTodayDateString();
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : (this.profile.targetProteinG || 0);
    const simple = this.isSimple();
    const cards = [];
    for (let i = 0; i < 30; i++) {
      const d = this.trendDay(shiftDateString(today, -i));
      const wd = '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()];
      const when = i === 0 ? '今天' : i === 1 ? '昨天' : wd;
      const head = `<div class="dc-head"><b>${+d.date.slice(5, 7)}月${+d.date.slice(8)}日</b><span>${when}${i > 1 ? '' : ' · ' + wd}</span></div>`;
      if (!d.hasLogs) {
        cards.push(`<article class="day-card empty" data-date="${d.date}">${head}<div class="dc-empty">这天没记</div>` +
          `<div class="dc-acts"><button type="button" class="chip" data-dc="open">去补一笔</button></div></article>`);
        continue;
      }
      const ratio = d.budget > 0 ? d.intake / d.budget : 0;
      const C = 2 * Math.PI * 30;
      const over = d.intake > d.budget + 50;
      const ring = d.hasDiet ? `<svg class="dc-ring" viewBox="0 0 72 72" aria-hidden="true"><circle class="trk" cx="36" cy="36" r="30"/>` +
        `<circle class="val${over ? ' over' : ''}" cx="36" cy="36" r="30" stroke-dasharray="${C.toFixed(1)}" style="--off:${(C * (1 - Math.min(1, ratio))).toFixed(1)}; --c:${C.toFixed(1)}"/></svg>` +
        `<div class="dc-ring-n"><b>${fmt(d.intake)}</b><small>/ ${fmt(d.budget)}</small></div>` : '';
      const bars = d.hasDiet ? [['pro', '蛋白', d.protein, target || 100, 'g'], ['carb', '碳水', d.carbs, Math.max(1, (d.budget * 0.5) / 4), 'g'], ['fat', '脂肪', d.fat, Math.max(1, (d.budget * 0.28) / 9), 'g']]
        .map(([c, n, v, t, u]) => `<div class="dc-bar"><span>${n}</span><div class="dc-trk"><i class="m-${c}" style="--w:${Math.min(100, (v / t) * 100)}%"></i></div><b>${Math.round(v)}${u}</b></div>`).join('') : '';
      const meals = d.meals.slice().sort((a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType))
        .slice(0, 4).map(m => `<li><span>${esc((m.mealType || '').replace('/补剂', ''))}</span>${esc(m.foodSummary)}<b>${fmt(m.calories)}</b></li>`).join('');
      const works = d.ws.slice(0, 4).map(w => `<li><span>${esc(TF.workoutTag ? TF.workoutTag(w).label : '训练')}</span>${esc(w.exerciseName)}<b>${w.durationMin ? w.durationMin + '分' : (w.weightKg > 0 ? round1(w.weightKg) + 'kg ' : '') + w.sets + '×' + w.reps}</b></li>`).join('');
      const more = (d.meals.length > 4 ? d.meals.length - 4 : 0) + (d.ws.length > 4 ? d.ws.length - 4 : 0);
      const lifts = d.ws.length && !simple;
      cards.push(`<article class="day-card" data-date="${d.date}">${head}` +
        (d.hasDiet ? `<div class="dc-top"><div class="dc-ring-box">${ring}</div><div class="dc-bars">${bars}</div></div>` : '') +
        (meals ? `<ul class="dc-list">${meals}</ul>` : '') + (works ? `<ul class="dc-list lift">${works}</ul>` : '') +
        (more ? `<div class="dc-more">还有 ${more} 条</div>` : '') +
        (d.weight != null ? `<div class="dc-wt">体重 <b>${round1(d.weight)}</b> kg</div>` : '') +
        `<div class="dc-acts"><button type="button" class="chip" data-dc="open">看这天</button>` +
        (lifts ? `<button type="button" class="chip" data-dc="save">存成计划</button>${i ? '<button type="button" class="chip chip-primary" data-dc="redo">今天照这天练</button>' : ''}` : '') +
        `</div></article>`);
    }
    el.innerHTML = cards.join('');
    el.scrollLeft = 0;
    el.querySelectorAll('[data-dc]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const date = b.closest('.day-card').dataset.date;
      const act = b.dataset.dc;
      window.Haptics && window.Haptics.fire('tick');
      if (act === 'open') { this.selectedDate = date; this.switchView('today'); return; }
      const ws = this.workouts.filter(w => w.date === date);
      if (act === 'save') {
        // 这天练的存进计划本（v12：「运动计划的保存」）：以后说「明天练 X」就放过去
        const e2 = this.savePlanBook && this.savePlanBook({ workouts: ws.map(w => ({ exerciseName: w.exerciseName, muscleGroup: w.muscleGroup, weightKg: w.weightKg, sets: w.sets, reps: w.reps, durationMin: w.durationMin, burnedCalories: w.burnedCalories })) }, '');
        if (!e2) return;
        this.saveData();
        b.disabled = true;
        b.textContent = '✓ 已存';
        this.showToast(`存成「${e2.name}」了，以后说「明天练${e2.name}」就行`);
      } else if (act === 'redo') {
        const off = Math.round((new Date(date + 'T00:00:00') - new Date(getTodayDateString() + 'T00:00:00')) / 86400000);
        const r = this.runActs && this.runActs([{ do: 'copyDay', from: off, to: 0, what: 'workouts' }], getTodayDateString());
        if (!r || !r.ok) { this.showToast('没放上，换一天试试'); return; }
        this.saveData();
        if (window.QuickLog) window.QuickLog.showUndo('✓ 放进今天的计划了', r.lines, r.undo);
        this.jumpToPlans(getTodayDateString());
      }
    }));
  },

  /** 图上点了某天：下面的卡片划到这天，亮一下 */
  trendFocusDay(date) {
    const box = document.getElementById('tr-days');
    const card = box && box.querySelector(`.day-card[data-date="${date}"]`);
    if (!card) return;
    box.scrollTo({ left: card.offsetLeft - box.offsetLeft - 16, behavior: this.reducedMotion && this.reducedMotion() ? 'auto' : 'smooth' });
    box.querySelectorAll('.day-card.focus').forEach(c => c.classList.remove('focus'));
    card.classList.add('focus');
    clearTimeout(this._focusT);
    this._focusT = setTimeout(() => card.classList.remove('focus'), 1600);
  }
});
