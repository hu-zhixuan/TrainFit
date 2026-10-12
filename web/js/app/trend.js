/**
 * 趋势页（v12 做了一版带很多卡片的，v12.1 用户：「还是复杂了，可视化不美观，去看 Arena 的审美」）。
 * 照 arena.ai 的样子收简单：暖白底、白卡片一根细边、不加阴影；大标题用衬线体、一个词斜体；数字用等宽；
 * 数据只用一种柔和的蓝，「排行」那种整行就是一根条（条在字后面），好的数绿色 ▲、超了红色 ▲。
 *   一句话（小人说的，衬线大字）→ 记了几天 → 四行（吃、蛋白、练、体重，和上一段比；点一行，下面的图就换成它）
 *   → 一张图（≤10 天一天一行条；30 天一根根细柱；练 = 动作排行；体重 = 七天平均线）→ 过去 30 天划卡片。
 * 动效克制：条从左边伸出来、数字滚上去、线一笔画出来；减少动态效果时都不动。
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

  /** 最上面一句话：「这 7 天，很稳」（衬线大字，最后一个词斜体）+ 小人说的第一句；右边是小人 */
  renderTrendBuddy() {
    const el = document.getElementById('trend-buddy');
    if (!el) return;
    const n = this.trendDays;
    const r = this.trendReview(n);
    const look = this.buddyLook();
    const st = this.buddyState();
    const art = look.show ? TF.Buddy.svg(this.buddyArt({ mood: st.mood, gear: st.gear, pose: this._coachWave ? 'wave' : 'stand' })) : '';
    // 「这一周记了 6 天，很稳」→ 标题「这 7 天，很稳」：逗号后面那个评价斜体
    const word = (r.head.match(/，([^，]+)$/) || [])[1] || '';
    const praise = /记了 \d+ 天/.test(word) ? '' : word;
    const x = this._trendExtra && this._trendExtra.days === n ? this._trendExtra : null;
    const line = x ? x.text : r.lines[0] || '';
    el.innerHTML = `<div class="ar-hero-text"><h1 class="ar-title">这 ${n} 天${praise ? `，<em>${esc(praise)}</em>` : ''}</h1>` +
      (line ? `<p class="ar-sub">${esc(line)}</p>` : '') +
      `<button type="button" class="ar-link ar-ai" data-q="帮我细看这${n}天吃练得怎么样，哪里最该改？">让 AI 细看这 ${n} 天 →</button></div>` +
      (art ? `<button type="button" class="coach-buddy" aria-label="小人">${art}</button>` : '');
    el.querySelectorAll('.ar-ai').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      b.disabled = true;
      window.Haptics && window.Haptics.fire('tick');
      this._trendExtra = null;
      this.switchView('today');
      if (window.QuickLog) window.QuickLog.submit(b.dataset.q, { ask: true });
    }));
  },

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
    // 每次画（切到这页、换天数）进场动画重播一遍
    sec.classList.remove('tr-anim');
    void sec.offsetWidth;
    sec.classList.add('tr-anim');
    sec.querySelectorAll('.tr-card').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 8)));
    document.querySelectorAll('#trend-range .seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.range) === this.trendDays));
    const n = this.trendDays;
    const days = this.trendDaysData(n);
    const cur = this.trendSum(days), prev = this.trendSum(this.trendDaysData(n, 1));
    this._trendDays = days;
    this._trendCur = cur;
    this.renderTrendBuddy();
    $('tr-live').innerHTML = `<i></i><b data-count="${cur.logged}" data-text="${cur.logged}">${cur.logged}</b> / ${n} 天记了`;
    $('tr-cmp').textContent = `和上 ${n} 天比`;
    this.renderTrendKpis($('tr-kpis'), days, cur, prev);
    this.renderTrendPanel();
    this.renderDayCards($('tr-days'));
    this.trendCountUp(sec);
  },

  /**
   * 四行（Arena「New release rankings」那种列表）：吃、蛋白、练、体重。左边一个小图标，中间大字 + 一行小字，右边和上一段比（好的绿、不好的红）。
   * 点一行 = 下面那张图换成它（选中的那行底色是暖米色，像 Arena 的标签）。
   */
  renderTrendKpis(el, days, cur, prev) {
    const simple = this.isSimple();
    const goal = this.profile.goalType || 'fat_loss';
    const kind = this._trendKind || 'energy';
    const delta = (a, b, unit, goodUp, dec) => {
      if (a == null || b == null) return '<span class="ar-d">—</span>';
      const d = dec ? round1(a - b) : Math.round(a - b);
      if (!d) return '<span class="ar-d">持平</span>';
      const cls = goodUp == null ? '' : (d > 0) === goodUp ? ' up' : ' down';
      return `<span class="ar-d${cls}"><i>${d > 0 ? '▲' : '▼'}</i>${Math.abs(d)}${unit}</span>`;
    };
    const num = (v, dec, text) => `<b class="ar-v" data-count="${v}" data-dec="${dec || 0}" data-text="${esc(text)}">${esc(text)}</b>`;
    const rows = [
      ['energy', '吃', cur.intake == null ? '<b class="ar-v">–</b>' : num(Math.round(cur.intake), 0, fmt(cur.intake)), 'kcal / 天',
        cur.budget ? `预算 ${fmt(cur.budget)}${cur.over ? ` · 超了 ${cur.over} 天` : ''}` : '', delta(cur.intake, prev.intake, '', goal === 'muscle_gain' ? true : goal === 'fat_loss' ? false : null)],
      ['protein', '蛋白', cur.protein == null ? '<b class="ar-v">–</b>' : num(Math.round(cur.protein), 0, String(Math.round(cur.protein))), 'g / 天',
        cur.proteinTarget ? `目标 ${cur.proteinTarget}g · 够了 ${cur.proteinOk} 天` : '', delta(cur.protein, prev.protein, 'g', true)]
    ];
    if (!simple) rows.push(['train', '练', num(cur.trainDays, 0, String(cur.trainDays)), `/ ${days.length} 天`,
      cur.volume ? `训练量 ${cur.volume >= 10000 ? round1(cur.volume / 1000) + ' 吨' : fmt(cur.volume) + ' kg'}${cur.minutes ? ` · 有氧 ${cur.minutes} 分` : ''}` : (cur.minutes ? `有氧 ${cur.minutes} 分` : '还没练力量'),
      delta(cur.trainDays, prev.trainDays, ' 天', true)]);
    const dw = cur.wn >= 2 ? round1(cur.w1 - cur.w0) : null;
    rows.push(['weight', '体重', cur.w1 != null ? num(round1(cur.w1), 1, String(round1(cur.w1))) : '<b class="ar-v">–</b>', 'kg',
      cur.wn ? `称了 ${cur.wn} 次` : '这几天没称', dw == null ? '<span class="ar-d">—</span>' : delta(cur.w1, cur.w0, ' kg', goal === 'muscle_gain', true)]);
    const ICON = { energy: 'M4 14c0-4 4-6 4-10 3 2 6 6 6 10a5 5 0 0 1-10 0z', protein: 'M5 9a4 4 0 1 1 8 0v5H5zM7 14v3h4v-3', train: 'M2 9h3M13 9h3M5 6v6M13 6v6M5 9h8', weight: 'M3 15l2-9h8l2 9zM7 6a2 2 0 0 1 4 0' };
    el.innerHTML = rows.map(([k, label, v, unit, sub, d]) => `<button type="button" class="ar-row${k === kind ? ' on' : ''}" data-k="${k}" role="tab" aria-selected="${k === kind}">` +
      `<span class="ar-ic"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="${ICON[k]}"/></svg></span>` +
      `<span class="ar-main"><span class="ar-top"><span class="ar-l">${label}</span>${v}<small>${unit}</small></span><span class="ar-s">${esc(sub)}</span></span>` +
      `${d}<span class="ar-chev" aria-hidden="true">›</span></button>`).join('');
    el.querySelectorAll('.ar-row').forEach(b => b.addEventListener('click', () => {
      if (this._trendKind === b.dataset.k) return;
      this._trendKind = b.dataset.k;
      window.Haptics && window.Haptics.fire('tick');
      el.querySelectorAll('.ar-row').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      this.renderTrendPanel(true);
    }));
  },

  /** 那一张图：吃 / 蛋白 / 练 / 体重，按上面选中的那行 */
  renderTrendPanel(swap) {
    const el = document.getElementById('tr-panel');
    if (!el) return;
    let kind = this._trendKind || 'energy';
    if (kind === 'train' && this.isSimple()) kind = this._trendKind = 'energy';
    const days = this._trendDays || this.trendDaysData(this.trendDays);
    const cur = this._trendCur || this.trendSum(days);
    const html = kind === 'protein' ? this.panelProtein(days, cur) : kind === 'train' ? this.panelTrain(days, cur) : kind === 'weight' ? this.panelWeight(days, cur) : this.panelEnergy(days, cur);
    el.dataset.kind = kind;
    el.innerHTML = html;
    if (swap) { el.classList.remove('ar-swap'); void el.offsetWidth; el.classList.add('ar-swap'); }
    el.querySelectorAll('.ar-bar[data-date]').forEach(b => b.addEventListener('click', () => { window.Haptics && window.Haptics.fire('tick'); this.trendFocusDay(b.dataset.date); }));
    el.querySelectorAll('.ar-bar[data-lift]').forEach(b => b.addEventListener('click', () => this.openLiftSheet(b.dataset.lift)));
    if (el._hover) { el._hover(); el._hover = null; }
    this.trendCountUp(el);
  },

  /** 卡片头：标题 + 一个小标签（Arena 的「Best Overall」那种） */
  panelHead(title, chip) {
    return `<div class="ar-head"><h2>${esc(title)}</h2>${chip ? `<span class="ar-chip">${esc(chip)}</span>` : ''}</div>`;
  },

  /**
   * 一天一行（≤10 天）：条就是这一行的底色，长短 = 这个数 / 最大的那个；左边日子的数字放在小方框里，右边等宽字写数。
   * marks：每行一根细竖线（预算 / 目标的位置）；tone(d) 'over' 时这一行用淡红
   */
  dayRows(days, val, opts) {
    const vals = days.map(val).filter(v => v != null);
    const max = Math.max(opts.mark || 0, ...vals) * 1.04 || 1;
    const today = getTodayDateString();
    return `<div class="ar-bars">` + days.slice().reverse().map((d, i) => {
      const v = val(d);
      const wd = d.date === today ? '今天' : '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()];
      const w = v == null ? 0 : Math.max(0.02, v / max);
      const tone = v != null && opts.tone ? opts.tone(d) : '';
      const mk = opts.mark ? `<i class="ar-mark" style="--m:${(opts.mark / max).toFixed(3)}"></i>` : '';
      return `<button type="button" class="ar-bar${tone ? ' ' + tone : ''}${v == null ? ' empty' : ''}" data-date="${d.date}" style="--p:${w.toFixed(3)}; --d:${i * 45}ms">` +
        `<span class="ar-fill"></span>${mk}<span class="ar-rank">${+d.date.slice(8)}</span><span class="ar-name">${wd}</span>` +
        `<span class="ar-val">${v == null ? '<em>没记</em>' : opts.right(d, v)}</span></button>`;
    }).join('') + '</div>';
  },

  /** 30 天：一根根细柱（同一个蓝，超了的淡红），一根横线是预算 / 目标；手指划过看那天 */
  dayColumns(days, val, opts) {
    const vals = days.map(val).filter(v => v != null);
    if (!vals.length) return '';
    const f = this.trendFrame(days.length, 0, Math.max(opts.mark || 0, ...vals) * 1.08, { h: 160 });
    const bw = Math.min(10, f.slot * 0.62);
    const base = f.y(0);
    const bars = days.map((d, i) => { const v = val(d); return v == null ? '' : this.trendBar(f.cx(i) - bw / 2, bw, base, f.y(v), opts.tone && opts.tone(d) ? 'over' : 'pos', i); }).join('');
    const mark = opts.mark ? `<line class="target draw-h" x1="${f.padL}" x2="${f.W - f.padR}" y1="${f.y(opts.mark).toFixed(1)}" y2="${f.y(opts.mark).toFixed(1)}"/>` : '';
    setTimeout(() => {
      const el = document.querySelector('#tr-panel .chart');
      if (el) this.trendHover(el, f, days, (i) => { const v = val(days[i]); return v == null ? null : opts.tip(days[i], v); });
    }, 0);
    return `<div class="chart"><svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(opts.aria)}">${f.grid}<line class="base" x1="${f.padL}" x2="${f.W - f.padR}" y1="${base}" y2="${base}"/>${bars}${mark}` +
      `${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${base}"/></svg><div class="chart-tip hidden"></div></div>`;
  },

  panelEnergy(days, cur) {
    if (!cur.eatDays) return this.panelHead('每天吃了多少') + '<p class="ar-empty">记几顿饭，这里一天一行画出吃了多少、超没超预算</p>';
    const over = (d) => d.intake > d.budget + 50;
    const right = (d, v) => `${fmt(v)}${over(d) ? `<i class="ar-dn">▲${fmt(v - d.budget)}</i>` : ''}`;
    const body = days.length <= 10
      ? this.dayRows(days, d => (d.hasDiet ? d.intake : null), { mark: cur.budget, tone: d => (over(d) ? 'over' : ''), right })
      : this.dayColumns(days, d => (d.hasDiet ? d.intake : null), { mark: cur.budget, tone: over, aria: '每天吃了多少',
        tip: (d, v) => [[over(d) ? 'neg' : 'pos', '吃了', fmt(v) + ' kcal'], ['target', d.budget - v >= 0 ? '还剩' : '超了', fmt(Math.abs(d.budget - v))]] });
    const simple = this.isSimple();
    const fat = !simple && cur.deficit > 0 ? ` · 赤字折合脂肪 ${round1((cur.deficit * cur.eatDays) / 7700)} kg` : '';
    return this.panelHead('每天吃了多少', `预算 ${fmt(cur.budget)}`) + body +
      `<p class="ar-foot">${days.length <= 10 ? '竖线' : '横线'}是预算 · <span class="ar-sw over"></span>超了的那天${fat}</p>`;
  },

  panelProtein(days, cur) {
    if (!cur.eatDays) return this.panelHead('蛋白质') + '<p class="ar-empty">记几顿饭，这里画出每天吃够蛋白没有</p>';
    const t = cur.proteinTarget;
    const right = (d, v) => `${Math.round(v)}g${t && v >= t ? '<i class="ar-up">✓</i>' : ''}`;
    const body = days.length <= 10
      ? this.dayRows(days, d => (d.hasDiet ? d.protein : null), { mark: t, right })
      : this.dayColumns(days, d => (d.hasDiet ? d.protein : null), { mark: t, aria: '每天的蛋白质', tip: (d, v) => [['pro', '蛋白', round1(v) + 'g']] });
    // 主要靠哪几样（这几天每一样加起来）
    const since = days[0].date;
    const sum = new Map();
    this.diet.filter(d => d.date >= since).forEach(d => (Array.isArray(d.items) && d.items.length ? d.items : [{ name: d.foodSummary, proteinG: d.proteinG }])
      .forEach(it => { if (it.supp) return; const k = String(it.name || '').slice(0, 10); if (k) sum.set(k, (sum.get(k) || 0) + (it.proteinG || 0)); }));
    const tot = [...sum.values()].reduce((a, v) => a + v, 0) || 1;
    const top = [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(x => x[1] > 0);
    return this.panelHead('蛋白质', t ? `目标 ${t}g` : '') + body +
      `<p class="ar-foot">${days.length <= 10 ? '竖线' : '横线'}是目标${top.length ? ' · 主要靠 ' + top.map(([k, v]) => `${esc(k)} ${Math.round((v / tot) * 100)}%`).join('、') : ''}</p>`;
  },

  /** 练：动作排行（Arena 的 Top 10：名次越前条越深）；点一行看这个动作的重量曲线 */
  panelTrain(days, cur) {
    const since = days[0].date;
    let names = [...new Set(this.workouts.filter(w => !w.durationMin && w.date >= since).map(w => w.exerciseName))];
    const recent = !names.length;
    if (recent) {
      names = [];
      this.workouts.filter(w => !w.durationMin).sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)))
        .forEach(w => { if (!names.includes(w.exerciseName)) names.push(w.exerciseName); });
      names = names.slice(0, 6);
    }
    if (!names.length) return this.panelHead('动作排行') + '<p class="ar-empty">练完说一句「卧推 60 公斤 4 组 8 个」，这里排出每个动作涨了多少</p>';
    const rows = names.map(name => {
      const ss = this.liftSessions(name);
      const inRange = ss.filter(s => s.date >= since), before = ss.filter(s => s.date < since);
      const now = (inRange.length ? inRange : ss)[(inRange.length ? inRange : ss).length - 1];
      const ref = before.length ? before[before.length - 1] : (inRange.length > 1 ? inRange[0] : null);
      const gain = ref && ref.e1rm ? (now.e1rm - ref.e1rm) / ref.e1rm : 0;
      return { name, now, ref, gain };
    }).sort((a, b) => b.gain - a.gain).slice(0, 8);
    const max = Math.max(0.02, ...rows.map(r => r.gain));
    const RAMP = 8;
    const body = `<div class="ar-bars rank">` + rows.map((r, i) => {
      const t = r.now.top;
      const g = Math.round(r.gain * 100);
      const w = r.ref ? Math.max(0.18, Math.max(0, r.gain) / max) : 0.18;
      return `<button type="button" class="ar-bar r${Math.min(i, RAMP - 1)}" data-lift="${esc(r.name)}" style="--p:${w.toFixed(3)}; --d:${i * 45}ms">` +
        `<span class="ar-fill"></span><span class="ar-rank">${i + 1}</span><span class="ar-name">${esc(r.name)}<small>${t.weightKg > 0 ? round1(t.weightKg) + 'kg' : '自重'}×${t.reps}</small></span>` +
        `<span class="ar-val">${r.ref ? (g > 0 ? `<i class="ar-up">▲</i>${g}%` : g < 0 ? `<i class="ar-dn">▼</i>${-g}%` : '0%') : '新'}</span></button>`;
    }).join('') + '</div>';
    // 各大肌群：最久没练的点出来
    const today = getTodayDateString();
    const gap = ['胸部', '背部', '腿部', '肩部'].map(g => ({ g, last: this.workouts.filter(w => w.muscleGroup === g).reduce((m, w) => (w.date > m ? w.date : m), '') }))
      .filter(x => x.last).map(x => Object.assign(x, { n: Math.round((new Date(today + 'T00:00:00') - new Date(x.last + 'T00:00:00')) / 86400000) }))
      .sort((a, b) => b.n - a.n)[0];
    return this.panelHead('动作排行', recent ? '最近练过的' : `练了 ${cur.trainDays} 天`) + body +
      `<p class="ar-foot">% 是估算的一次最大重量涨了多少 · 点一行看重量曲线${gap && gap.n >= 6 ? ` · ${gap.g.replace('部', '')}已经 ${gap.n} 天没练` : ''}</p>`;
  },

  /** 体重：每次称的（小方块，淡）+ 七天平均线（实的）；等宽的刻度 */
  panelWeight(days) {
    const pts = days.map((d, i) => (d.weight != null ? [i, d.weight] : null)).filter(Boolean);
    if (pts.length < 2) return this.panelHead('体重', '七天平均') + `<p class="ar-empty">${this.weights.length ? `这 ${days.length} 天称了 ${pts.length} 次，再称几次就有线` : '说「体重 62.5」就能记'}</p>`;
    const avg = days.map((d, i) => {
      const ws = this.weights.filter(w => w.date >= shiftDateString(d.date, -6) && w.date <= d.date);
      return ws.length && (d.weight != null || i === days.length - 1 || (pts.some(p => p[0] < i) && pts.some(p => p[0] > i))) ? [i, ws.reduce((a, w) => a + w.kg, 0) / ws.length] : null;
    }).filter(Boolean);
    const all = pts.map(p => p[1]).concat(avg.map(p => p[1]));
    const lo = Math.min(...all), hi = Math.max(...all), pad = Math.max(0.4, (hi - lo) * 0.3);
    const f = this.trendFrame(days.length, lo - pad, hi + pad, { dec: true, h: 170 });
    const line = this.trendLine(f, avg);
    const first = pts[0], last = pts[pts.length - 1];
    const pill = (p, anchor) => { const x = Math.min(Math.max(f.cx(p[0]), f.padL + 26), f.W - f.padR - 26); return `<g class="ar-pill" style="--d:900ms"><rect x="${(x - 24).toFixed(1)}" y="${(f.y(p[1]) - 24).toFixed(1)}" width="48" height="15" rx="3"/><text x="${x.toFixed(1)}" y="${(f.y(p[1]) - 13).toFixed(1)}" text-anchor="middle">${round1(p[1])}</text></g>`; };
    setTimeout(() => {
      const el = document.querySelector('#tr-panel .chart');
      if (el) this.trendHover(el, f, days, (i) => {
        const d = days[i], a = avg.find(p => p[0] === i);
        if (d.weight == null && !a) return null;
        return [d.weight != null ? ['wt-raw', '这天称', round1(d.weight) + ' kg'] : null, a ? ['wt', '七天平均', round1(a[1]) + ' kg'] : null].filter(Boolean);
      });
    }, 0);
    const diff = round1(last[1] - first[1]);
    return this.panelHead('体重', '七天平均') +
      `<div class="chart"><svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="体重变化">${f.grid}` +
      pts.map(p => `<rect class="ar-sq" style="--d:${p[0] * 25}ms" x="${(f.cx(p[0]) - 3).toFixed(1)}" y="${(f.y(p[1]) - 3).toFixed(1)}" width="6" height="6"/>`).join('') +
      `<path class="line wt draw" pathLength="1" d="${line.d}"/>${pill(first)}${pts.length > 1 ? pill(last) : ''}` +
      `${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${f.H - f.padB}"/></svg><div class="chart-tip hidden"></div></div>` +
      `<p class="ar-foot">${round1(first[1])} → ${round1(last[1])} kg（${diff > 0 ? '+' : ''}${diff}）· 小方块是每次称的，线是七天平均</p>`;
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
  /**
   * 过去 30 天：一天一张卡片（Arena 的「Model Capabilities」卡片那种：白卡片、细边、衬线的日子、一个大数）。
   * 吃了多少对预算一根细条；吃了什么、练了什么各一行；练过的那天能「存成计划」「今天照这天练」。
   */
  renderDayCards(el) {
    const today = getTodayDateString();
    const simple = this.isSimple();
    const cards = [];
    for (let i = 0; i < 30; i++) {
      const d = this.trendDay(shiftDateString(today, -i));
      const wd = '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()];
      const head = `<div class="dc-head"><b>${+d.date.slice(5, 7)}月${+d.date.slice(8)}日</b><span>${i === 0 ? '今天 · ' : i === 1 ? '昨天 · ' : ''}${wd}</span></div>`;
      if (!d.hasLogs) {
        cards.push(`<article class="day-card empty" data-date="${d.date}">${head}<p class="dc-empty">这天没记</p><div class="dc-acts"><button type="button" class="ar-link" data-dc="open">去补一笔 →</button></div></article>`);
        continue;
      }
      const over = d.intake > d.budget + 50;
      const eat = d.meals.slice().sort((a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType)).map(m => m.foodSummary).join('、');
      const lifts = [...new Set(d.ws.map(w => w.exerciseName))];
      cards.push(`<article class="day-card" data-date="${d.date}">${head}` +
        (d.hasDiet ? `<div class="dc-num"><b>${fmt(d.intake)}</b><small>/ ${fmt(d.budget)} kcal</small>${over ? `<i class="ar-dn">▲${fmt(d.intake - d.budget)}</i>` : ''}</div>` +
          `<div class="dc-trk"><i class="${over ? 'over' : ''}" style="--w:${Math.min(100, (d.intake / (d.budget || 1)) * 100).toFixed(1)}%"></i></div>` +
          `<p class="dc-line"><span>蛋白</span>${Math.round(d.protein)}g · 碳水 ${Math.round(d.carbs)}g · 脂肪 ${Math.round(d.fat)}g</p>` : '') +
        (eat ? `<p class="dc-line"><span>吃</span>${esc(eat)}</p>` : '') +
        (lifts.length ? `<p class="dc-line"><span>练</span>${esc(lifts.join('、'))}</p>` : '') +
        (d.weight != null ? `<p class="dc-line"><span>体重</span>${round1(d.weight)} kg</p>` : '') +
        `<div class="dc-acts"><button type="button" class="ar-link" data-dc="open">看这天 →</button>` +
        (d.ws.length && !simple ? `<button type="button" class="ar-link" data-dc="save">存成计划</button>${i ? '<button type="button" class="ar-link" data-dc="redo">今天照这天练</button>' : ''}` : '') +
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
