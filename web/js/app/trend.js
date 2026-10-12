/**
 * 趋势页（v12.5 重做，用户：「审美交给你重构，最好和主页面契合」「热量赤字每天还是柱状图」「卡片一张一张像社交软件 Profile 那样左右滑」
 * 「再搞几个有逼格、动效精美的趋势分析」）。布局不变：一句话 → 三个数（点一个换下面的图）→ 一张图 → 趋势分析 → 每一天。
 * 样子跟今天页一套：深色底、圆角卡片一根细边、右上角一点品牌绿的光、粗体数字；数据颜色：热量赤字用品牌绿（多吃了的用红、往下长），
 * 蛋白 / 碳水 / 脂肪用验证过的三色（--m-pro / --m-carb / --m-fat），日历用一种绿由浅到深。
 * 趋势分析四张：累计热量赤字（折线 + 面积，和「照目标走」的虚线比）、三大营养素（环形）、练了哪些部位（雷达）、五周打卡（日历）。
 * 每一天：一张一张左右划，像个人主页——封面、头像位置是这天吃了多少的圆环、一句话、三个数、吃了哪几顿、练了什么。
 * 动效：卡片浮上来、柱子长出来、线一笔画出来、环转一圈、雷达从中间撑开、日历一格格亮起；减少动态效果时都不动。
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

  /** 最上面一张卡：「这 7 天，很稳」（评价那个词用品牌绿）+ 小人说的一句 + 让 AI 细看；小人在右边 */
  renderTrendBuddy() {
    const el = document.getElementById('trend-buddy');
    if (!el) return;
    const n = this.trendDays;
    const r = this.trendReview(n);
    const look = this.buddyLook();
    const st = this.buddyState();
    const art = look.show ? TF.Buddy.svg(this.buddyArt({ mood: st.mood, gear: st.gear, pose: this._coachWave ? 'wave' : 'stand' })) : '';
    const word = (r.head.match(/，([^，]+)$/) || [])[1] || '';
    const praise = /记了 \d+ 天/.test(word) ? '' : word;
    const x = this._trendExtra && this._trendExtra.days === n ? this._trendExtra : null;
    const line = x ? x.text : r.lines[0] || '';
    el.classList.toggle('meh', /断/.test(praise));
    el.innerHTML = `<div class="th-text"><span class="th-eye">这 ${n} 天 · 和上 ${n} 天比</span>` +
      `<h1 class="th-title">${praise ? `<em>${esc(praise)}</em>` : `记了 ${this._trendCur ? this._trendCur.logged : 0} 天`}</h1>` +
      (line ? `<p class="th-sub">${esc(line)}</p>` : '') +
      `<button type="button" class="th-ai" data-q="帮我细看这${n}天吃练得怎么样，哪里最该改？"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.4 3.6 3.6 1.4-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4zM12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>让 AI 细看这 ${n} 天</button></div>` +
      (art ? `<button type="button" class="coach-buddy" aria-label="小人">${art}</button>` : '');
    el.querySelectorAll('.th-ai').forEach(b => b.addEventListener('click', (e) => {
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
    this.renderTrendKpis($('tr-kpis'), days, cur, prev);
    this.renderTrendPanel();
    this.renderInsights($('tr-insights'), days);
    this.renderDayCards($('tr-days'));
    this.trendCountUp(sec);
  },

  /**
   * 三个数（今天页大卡片下面那排「已吃 / 训练消耗 / 蛋白质」的样子）：热量赤字、蛋白质、训练（只记吃的模式：吃了多少、蛋白质）。
   * 每个：小标签、大数（滚上去）、单位、和上一段比（好的绿、不好的红）。点一个 = 下面那张图换成它。
   * 目标、够了几天这些写在下面那张图的标题里（v12.6 简化：小字和图上的重复了）。
   */
  renderTrendKpis(el, days, cur, prev) {
    const simple = this.isSimple();
    const gap = this.trendGap();
    if (simple && this._trendKind === 'train') this._trendKind = '';
    const kind = this._trendKind || (simple ? 'energy' : 'gap');
    const delta = (a, b, unit, goodUp) => {
      if (a == null || b == null) return '<span class="tk-d">—</span>';
      const d = Math.round(a - b);
      if (!d) return '<span class="tk-d">持平</span>';
      const cls = goodUp == null ? '' : (d > 0) === goodUp ? ' up' : ' down';
      return `<span class="tk-d${cls}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit}</span>`;
    };
    const num = (v, text) => `<b class="tk-v" data-count="${v}" data-text="${esc(text)}">${esc(text)}</b>`;
    const avgGap = (sum) => (sum.deficit == null ? null : gap.gain ? -sum.deficit : sum.deficit);
    const g = avgGap(cur), gp = avgGap(prev);
    const tiles = [];
    if (simple) tiles.push(['energy', '吃了', cur.intake == null ? '<b class="tk-v">–</b>' : num(Math.round(cur.intake), fmt(cur.intake)), 'kcal/天',
      delta(cur.intake, prev.intake, '', false)]);
    else tiles.push(['gap', gap.label, g == null ? '<b class="tk-v">–</b>' : num(Math.round(g), fmt(g)), 'kcal/天', delta(g, gp, '', true)]);
    tiles.push(['protein', '蛋白质', cur.protein == null ? '<b class="tk-v">–</b>' : num(Math.round(cur.protein), String(Math.round(cur.protein))), 'g/天',
      delta(cur.protein, prev.protein, 'g', true)]);
    if (!simple) tiles.push(['train', '训练', num(cur.trainDays, String(cur.trainDays)), `/ ${days.length} 天`, delta(cur.trainDays, prev.trainDays, '', true)]);
    el.style.setProperty('--n', tiles.length);
    el.innerHTML = tiles.map(([k, label, v, unit, d]) => `<button type="button" class="tr-kpi${k === kind ? ' on' : ''}" data-k="${k}" role="tab" aria-selected="${k === kind}">` +
      `<span class="tk-l"><i class="tk-dot ${k}"></i>${label}</span><span class="tk-num">${v}<small>${unit}</small></span>${d}</button>`).join('');
    el.querySelectorAll('.tr-kpi').forEach(b => b.addEventListener('click', () => {
      if (this._trendKind === b.dataset.k) return;
      this._trendKind = b.dataset.k;
      window.Haptics && window.Haptics.fire('tick');
      el.querySelectorAll('.tr-kpi').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      this.renderTrendPanel(true);
    }));
  },

  /** 那一张图：热量赤字 / 吃了多少 / 蛋白 / 训练，按上面选中的那个 */
  renderTrendPanel(swap) {
    const el = document.getElementById('tr-panel');
    if (!el) return;
    const simple = this.isSimple();
    let kind = this._trendKind || (simple ? 'energy' : 'gap');
    if (simple && (kind === 'train' || kind === 'gap')) kind = 'energy';
    if (!simple && kind === 'energy') kind = 'gap';
    const days = this._trendDays || this.trendDaysData(this.trendDays);
    const cur = this._trendCur || this.trendSum(days);
    const html = kind === 'protein' ? this.panelProtein(days, cur) : kind === 'train' ? this.panelTrain(days, cur) : kind === 'gap' ? this.panelGap(days, cur) : this.panelEnergy(days, cur);
    el.dataset.kind = kind;
    el.innerHTML = html;
    if (swap) { el.classList.remove('tp-swap'); void el.offsetWidth; el.classList.add('tp-swap'); }
    el.querySelectorAll('[data-lift]').forEach(b => b.addEventListener('click', () => this.openLiftSheet(b.dataset.lift)));
    const chart = el.querySelector('.chart');
    if (chart && chart._bind) chart._bind();
    this.trendCountUp(el);
  },

  /** 卡片头：标题 + 一行说明，右边一个小标签 */
  panelHead(title, sub, chip) {
    return `<div class="tp-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${chip ? `<span class="tp-chip">${esc(chip)}</span>` : ''}</div>`;
  },

  /**
   * 一天一根柱子（v12.5：「热量赤字每天还是柱状图」）。≤10 天柱子宽、顶上写数；30 天细柱。
   * opts：{ target（虚线）, tone(d, v) → 'pos' | 'over' | 'pro' | 'low', label(d, v)（顶上的字）, tip(d, v), aria }
   * 往下的（多吃了）从 0 往下长。点一根：看这天的数，下面的卡片划到这天。
   */
  trendColumns(days, val, opts) {
    const vals = days.map(val).filter(v => v != null);
    if (!vals.length) return '';
    const n = days.length, wide = n <= 10;
    const lo = Math.min(0, ...vals), hi = Math.max(opts.target || 0, ...vals);
    const f = this.trendFrame(n, lo < 0 ? lo * 1.25 : 0, hi * (wide ? 1.22 : 1.1), { h: wide ? 196 : 176 });
    const bw = wide ? Math.min(28, f.slot * 0.56) : Math.min(9, f.slot * 0.62);
    const base = f.y(0);
    const today = getTodayDateString();
    const uid = 'g' + Math.random().toString(36).slice(2, 7);
    const grad = (id, a, b) => `<linearGradient id="${uid}${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(${a})"/><stop offset="1" style="stop-color:var(${a});stop-opacity:${b}"/></linearGradient>`;
    const defs = `<defs>${grad('pos', '--accent', 0.45)}${grad('pro', '--m-pro', 0.45)}${grad('over', '--danger', 0.4)}</defs>`;
    let labels = '';
    const bars = days.map((d, i) => {
      const v = val(d);
      if (v == null) return wide ? `<circle class="nodata" cx="${f.cx(i).toFixed(1)}" cy="${base - 4}" r="2"/>` : '';
      const tone = opts.tone ? opts.tone(d, v) : 'pos';
      const bar = this.trendBar(f.cx(i) - bw / 2, bw, base, f.y(v), tone + (d.date === today ? ' today' : ''), i)
        .replace('<path ', `<path fill="url(#${uid}${tone === 'over' ? 'over' : tone === 'pro' || tone === 'low' ? 'pro' : 'pos'})" `);
      if (wide && opts.label) {
        const y = v < 0 ? f.y(v) + 13 : f.y(v) - 6;
        labels += `<text class="bar-val${v < 0 ? ' neg' : ''}" style="--d:${i * 40 + 350}ms" x="${f.cx(i).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(opts.label(d, v))}</text>`;
      }
      return bar;
    }).join('');
    const ty = opts.target ? f.y(opts.target) : 0;
    const mark = opts.target ? `<line class="target draw-h" x1="${f.padL}" x2="${f.W - f.padR}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}"/>` +
      `<text class="target-l" x="${f.W - f.padR}" y="${(ty - 5).toFixed(1)}" text-anchor="end">目标 ${fmt(opts.target)}</text>` : '';
    const id = 'c' + uid;
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el._bind = () => this.trendHover(el, f, days, (i) => { const v = val(days[i]); return v == null ? null : opts.tip(days[i], v); });
      if (el && el.isConnected) el._bind();
    }, 0);
    return `<div class="chart cols${wide ? ' wide' : ''}" id="${id}"><svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(opts.aria)}">${defs}${f.grid}` +
      `<line class="base" x1="${f.padL}" x2="${f.W - f.padR}" y1="${base}" y2="${base}"/>${bars}${mark}${labels}` +
      `${this.trendXLabels(days, f)}<line class="xhair hidden" y1="${f.padT}" y2="${f.H - f.padB}"/></svg><div class="chart-tip hidden"></div></div>`;
  },

  /** 热量赤字：一天一根（多吃了的往下、红色），虚线是目标 */
  panelGap(days, cur) {
    const gap = this.trendGap();
    if (!cur.eatDays) return this.panelHead(gap.label) + '<p class="tp-empty">记几顿饭，这里一天一根柱子画出每天的热量赤字</p>';
    const sum = days.reduce((a, d) => a + Math.max(0, gap.val(d) || 0), 0);
    const neg = days.filter(d => (gap.val(d) || 0) < 0).length;
    const avg = Math.round(days.filter(d => gap.val(d) != null).reduce((a, d) => a + gap.val(d), 0) / cur.eatDays);
    const body = this.trendColumns(days, gap.val, {
      target: gap.target, aria: gap.label,
      tone: (d, v) => (v < 0 ? 'over' : 'pos'),
      label: (d, v) => (v < 0 ? '−' + fmt(-v) : fmt(v)),
      tip: (d, v) => [[v < 0 ? 'neg' : 'pos', v < 0 ? (gap.gain ? '少吃了' : '多吃了') : gap.label, fmt(Math.abs(v)) + ' kcal'], ['', `吃了 ${fmt(d.intake)} / 预算 ${fmt(d.budget)}`, '']]
    });
    return this.panelHead(gap.label, `平均每天 <b>${fmt(avg)}</b> kcal${gap.target ? ` · 目标 ${fmt(gap.target)}` : ''}`, gap.gain ? '' : `≈ ${round1(sum / 7700)} kg 脂肪`) + body +
      `<p class="tp-foot">${neg ? `<i class="sw over"></i>${gap.gain ? '少吃' : '多吃'}了 ${neg} 天 · ` : ''}${gap.gain ? '' : `一共 ${fmt(sum)} kcal`} · 点一根看那天</p>`;
  },

  panelEnergy(days, cur) {
    if (!cur.eatDays) return this.panelHead('每天吃了多少') + '<p class="tp-empty">记几顿饭，这里一天一根柱子画出吃了多少、超没超预算</p>';
    const over = (d) => d.intake > d.budget + 50;
    const body = this.trendColumns(days, d => (d.hasDiet ? d.intake : null), {
      target: cur.budget, aria: '每天吃了多少', tone: (d) => (over(d) ? 'over' : 'pos'), label: (d, v) => fmt(v),
      tip: (d, v) => [[over(d) ? 'neg' : 'pos', '吃了', fmt(v) + ' kcal'], ['', d.budget - v >= 0 ? `还剩 ${fmt(d.budget - v)}` : `超了 ${fmt(v - d.budget)}`, '']]
    });
    return this.panelHead('每天吃了多少', `平均 <b>${fmt(cur.intake)}</b> kcal · 预算 ${fmt(cur.budget)}`, cur.over ? `超了 ${cur.over} 天` : '') + body +
      '<p class="tp-foot">虚线是预算 · 点一根看那天</p>';
  },

  panelProtein(days, cur) {
    if (!cur.eatDays) return this.panelHead('蛋白质') + '<p class="tp-empty">记几顿饭，这里画出每天吃够蛋白没有</p>';
    const t = cur.proteinTarget;
    const body = this.trendColumns(days, d => (d.hasDiet ? d.protein : null), {
      target: t, aria: '每天的蛋白质', tone: (d, v) => (t && v < t * 0.9 ? 'low' : 'pro'), label: (d, v) => String(Math.round(v)),
      tip: (d, v) => [['pro', '蛋白', round1(v) + 'g'], ['', t ? (v >= t * 0.9 ? '够了' : `还差 ${Math.round(t - v)}g`) : '', '']]
    });
    // 主要靠哪几样（这几天每一样加起来）
    const since = days[0].date;
    const sum = new Map();
    this.diet.filter(d => d.date >= since).forEach(d => (Array.isArray(d.items) && d.items.length ? d.items : [{ name: d.foodSummary, proteinG: d.proteinG }])
      .forEach(it => { if (it.supp) return; const k = String(it.name || '').slice(0, 10); if (k) sum.set(k, (sum.get(k) || 0) + (it.proteinG || 0)); }));
    const tot = [...sum.values()].reduce((a, v) => a + v, 0) || 1;
    const top = [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(x => x[1] > 0);
    return this.panelHead('蛋白质', `平均每天 <b>${Math.round(cur.protein)}</b> g${t ? ` · 目标 ${t}g` : ''}`, t ? `够了 ${cur.proteinOk}/${cur.eatDays} 天` : '') + body +
      `<p class="tp-foot">${top.length ? '主要靠 ' + top.map(([k, v]) => `${esc(k)} ${Math.round((v / tot) * 100)}%`).join('、') : '点一根看那天'}</p>`;
  },

  /** 热量赤字 / 盈余（增肌的人看盈余）：这天的数（没记吃的是 null）、叫法、目标 */
  trendGap() {
    const gain = (this.profile.goalType || 'fat_loss') === 'muscle_gain';
    const target = (this.profile.targetDeficitKcal || 0) * (gain ? -1 : 1);
    return { gain, label: gain ? '热量盈余' : '热量赤字', target: target > 0 ? target : 0, val: (d) => (d.hasDiet ? Math.round(gain ? -d.s.deficit : d.s.deficit) : null) };
  },

  /**
   * 这几天练过的力量动作，每个：现在最重的一组、这段时间开头（或之前最后一次）的一组、估算一次最大涨了多少、是不是新纪录、下次练多少、
   * 最近 8 次最重一组的走势。都没练过就拿最近练过的 6 个（recent）。
   */
  trendLiftRows(days) {
    const since = days[0].date;
    let names = [...new Set(this.workouts.filter(w => !w.durationMin && w.date >= since).map(w => w.exerciseName))];
    const recent = !names.length;
    if (recent) {
      names = [];
      this.workouts.filter(w => !w.durationMin).sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)))
        .forEach(w => { if (!names.includes(w.exerciseName)) names.push(w.exerciseName); });
      names = names.slice(0, 6);
    }
    const rows = names.map(name => {
      const ss = this.liftSessions(name);
      const inRange = ss.filter(s => s.date >= since), before = ss.filter(s => s.date < since);
      const now = (inRange.length ? inRange : ss)[(inRange.length ? inRange : ss).length - 1];
      const ref = before.length ? before[before.length - 1] : (inRange.length > 1 ? inRange[0] : null);
      // 带重量的按估算一次最大比，自重的按次数比（引体 10 → 12 个也是在涨）
      const score = (x) => x.e1rm || (!(x.top.weightKg > 0) ? (x.top.reps || 0) : 0);
      const gain = ref && score(ref) && (ref.e1rm > 0) === (now.e1rm > 0) ? (score(now) - score(ref)) / score(ref) : 0;
      const prior = ss.filter(s => s.date < now.date).reduce((m, s) => Math.max(m, s.top.weightKg || 0), 0);
      const pr = (now.top.weightKg || 0) > 0 && ss.length > 1 && (now.top.weightKg || 0) > prior && inRange.includes(now);
      const p = this.exerciseProgress(name);
      return { name, ss, now, ref, gain, pr, next: p ? p.next : null, spark: ss.slice(-8).map(s => s.top.weightKg || 0) };
    }).sort((a, b) => b.gain - a.gain || b.ss.length - a.ss.length);
    return { rows, recent };
  },

  /**
   * 训练：动作排行。每行：名次、动作（新纪录小标签）、重量从多少到多少、一根细条（涨了多少）、右边最近几次的小走势 + 百分比，
   * 下面一行「下次 · …」。点一行看这个动作的重量曲线和每次的明细。
   */
  panelTrain(days, cur) {
    const { rows: all, recent } = this.trendLiftRows(days);
    if (!all.length) return this.panelHead('动作排行') + '<p class="tp-empty">练完说一句「卧推 60 公斤 4 组 8 个」，这里记下每个动作的重量怎么涨的</p>';
    const rows = all.slice(0, 8);
    const max = Math.max(0.02, ...rows.map(r => r.gain));
    const kg = (w) => (w > 0 ? round1(w) + 'kg' : '自重');
    const change = (r) => {
      const a = r.ref && r.ref.top, b = r.now.top;
      if (!a) return `${kg(b.weightKg)} × ${b.reps}`;
      if ((a.weightKg || 0) !== (b.weightKg || 0)) return `${kg(a.weightKg).replace('kg', '')} → ${kg(b.weightKg)}`;
      if (a.reps !== b.reps) return `${kg(b.weightKg)} · ${a.reps} → ${b.reps} 次`;
      return `${kg(b.weightKg)} × ${b.reps}`;
    };
    const spark = (pts) => {
      if (pts.length < 2) return '<span class="tl-spark"></span>';
      const lo = Math.min(...pts), hi = Math.max(...pts);
      return `<svg class="tl-spark" viewBox="0 0 44 16" aria-hidden="true"><path class="draw" pathLength="1" d="${pts.map((v, k) => `${k ? 'L' : 'M'}${(k / (pts.length - 1) * 40 + 2).toFixed(1)},${(13 - ((v - lo) / Math.max(1e-6, hi - lo)) * 10).toFixed(1)}`).join(' ')}"/></svg>`;
    };
    const body = '<div class="tl-list">' + rows.map((r, i) => {
      const g = Math.round(r.gain * 100);
      const w = r.ref ? Math.max(0.04, Math.max(0, r.gain) / max) : 0;
      return `<button type="button" class="tl-row" data-lift="${esc(r.name)}" style="--p:${w.toFixed(3)}; --d:${i * 45}ms">` +
        `<span class="tl-rank${i < 3 ? ' top' : ''}">${i + 1}</span>` +
        `<span class="tl-main"><b>${esc(r.name)}${r.pr ? '<em class="tl-new">新纪录</em>' : ''}</b><small>${esc(change(r))}</small><span class="tl-trk"><i></i></span></span>` +
        `<span class="tl-side">${spark(r.spark)}<span class="tl-g${g > 0 ? ' up' : g < 0 ? ' down' : ''}">${r.ref ? (g > 0 ? `▲${g}%` : g < 0 ? `▼${-g}%` : '0%') : '新'}</span></span></button>` +
        (r.next ? `<div class="tl-next">下次 · ${esc(r.next.text.replace(/^下次/, ''))}</div>` : '');
    }).join('') + '</div>';
    const today = getTodayDateString();
    const gap = ['胸部', '背部', '腿部', '肩部'].map(g => ({ g, last: this.workouts.filter(w => w.muscleGroup === g).reduce((m, w) => (w.date > m ? w.date : m), '') }))
      .filter(x => x.last).map(x => Object.assign(x, { n: Math.round((new Date(today + 'T00:00:00') - new Date(x.last + 'T00:00:00')) / 86400000) }))
      .sort((a, b) => b.n - a.n)[0];
    return this.panelHead('动作排行', recent ? '最近练过的' : `练了 <b>${cur.trainDays}</b> 天`, gap && gap.n >= 6 ? `${gap.g.replace('部', '')} ${gap.n} 天没练` : '') + body +
      '<p class="tp-foot">按估算的一次最大重量涨了多少排 · 点一行看重量曲线</p>';
  },

  // ---------------------------------------------------------------------------
  // 趋势分析：v12.5 有四张（累计热量赤字、三大营养素、练了哪儿的雷达、五周打卡），v12.6 用户「简化趋势页」——
  // 累计赤字和柱状图上「一共 X kcal ≈ Y kg 脂肪」重复、雷达和训练排行重复、日历和每一天的卡片重复，只留三大营养素
  // ---------------------------------------------------------------------------
  renderInsights(el, days) {
    if (!el) return;
    el.innerHTML = this.insMacros(days);
  },

  /** 一张分析卡：小标题、一句结论（大字）、图、脚注 */
  insCard(cls, title, take, body, foot) {
    return `<article class="card ti ${cls}"><div class="ti-head"><span>${esc(title)}</span></div><p class="ti-take">${take}</p>${body}${foot ? `<p class="tp-foot">${foot}</p>` : ''}</article>`;
  },

  /** 三大营养素：这几天吃进来的热量里，蛋白 / 碳水 / 脂肪各占多少（环形，三段之间留 2px 缝，一段段转出来） */
  insMacros(days) {
    const eat = days.filter(d => d.hasDiet);
    if (eat.length < 1) return '';
    const sum = (k) => eat.reduce((a, d) => a + (d[k] || 0), 0) / eat.length;
    const g = { pro: sum('protein'), carb: sum('carbs'), fat: sum('fat') };
    const kc = { pro: g.pro * 4, carb: g.carb * 4, fat: g.fat * 9 };
    const tot = kc.pro + kc.carb + kc.fat;
    if (tot < 50) return '';
    const share = { pro: kc.pro / tot, carb: kc.carb / tot, fat: kc.fat / tot };
    const R = 46, C = 2 * Math.PI * R, gapLen = 3;
    let off = 0, k = 0;
    const NAME = { pro: '蛋白质', carb: '碳水', fat: '脂肪' };
    const segs = ['pro', 'carb', 'fat'].map(key => {
      const len = Math.max(0, share[key] * C - gapLen);
      const s = `<circle class="mc-seg ${key}" r="${R}" cx="60" cy="60" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" style="--len:${len.toFixed(2)}; --off:${(-off).toFixed(2)}; --d:${k++ * 260}ms"/>`;
      off += share[key] * C;
      return s;
    }).join('');
    const p = Math.round(share.pro * 100), f = Math.round(share.fat * 100), c = Math.round(share.carb * 100);
    const take = p >= 25 && p <= 40 ? `蛋白占 <b>${p}%</b>，刚好` : p < 25 ? `蛋白只占 <b>${p}%</b>，偏少` : `蛋白占 <b>${p}%</b>，很高`;
    const foot = f > 35 ? '脂肪超过三成五：油、肥肉、坚果少一点' : c > 60 ? '碳水超过六成：主食换一半成肉蛋奶' : p < 25 ? '每顿加一样肉蛋奶，蛋白就上来了' : '减脂期蛋白 25～35%、脂肪 20～30% 比较稳';
    const legend = ['pro', 'carb', 'fat'].map(key => `<li><i class="mc-key ${key}"></i><span>${NAME[key]}</span><b>${Math.round(g[key])}g</b><small>${Math.round(share[key] * 100)}%</small></li>`).join('');
    const body = `<div class="mc"><svg class="mc-ring" viewBox="0 0 120 120" role="img" aria-label="三大营养素占比：蛋白 ${p}%，碳水 ${c}%，脂肪 ${f}%">` +
      `<circle class="mc-track" r="${R}" cx="60" cy="60"/><g transform="rotate(-90 60 60)">${segs}</g>` +
      `<text class="mc-num" x="60" y="62" text-anchor="middle">${p}%</text><text class="mc-lab" x="60" y="78" text-anchor="middle">蛋白</text></svg>` +
      `<ul class="mc-legend">${legend}<li class="mc-tot"><span>平均每天</span><b>${fmt(Math.round(tot))}</b><small>kcal</small></li></ul></div>`;
    return this.insCard('ti-mac', '吃进来的热量从哪儿来', take, body, foot);
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
      const e1rm = w.weightKg > 0 ? w.weightKg * (1 + Math.min(w.reps || 1, 20) / 30) : 0; // 次数封顶 20：侧平举 16 → 20 个也看得出在涨
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
    // 每一次：练了哪几组，和上一次比重了多少 / 多了几次（重量更新的记录，v12.1）
    const list = ss.slice(-12).map((s, k, arr) => {
      const i = ss.indexOf(s), p0 = i > 0 ? ss[i - 1].top : null, t = s.top;
      const dw = p0 ? round1((t.weightKg || 0) - (p0.weightKg || 0)) : 0, dr = p0 && !dw ? (t.reps || 0) - (p0.reps || 0) : 0;
      const ch = !p0 ? '<i class="lr-up">第一次</i>' : dw > 0 ? `<i class="lr-up">▲${dw}kg</i>` : dw < 0 ? `<i class="lr-dn">▼${-dw}kg</i>` : dr > 0 ? `<i class="lr-up">▲${dr} 次</i>` : dr < 0 ? `<i class="lr-dn">▼${-dr} 次</i>` : '';
      return `<div class="lift-row"><span>${+s.date.slice(5, 7)}月${+s.date.slice(8)}日</span>` +
        `<b>${s.sets.map(w => `${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}`).join('，')}${ch}</b><small>${fmt(s.volume)}kg</small></div>`;
    }).reverse().join('');
    body.innerHTML = `<div class="lift-stats">` +
      `<div><span>最重</span><b>${best.top.weightKg > 0 ? round1(best.top.weightKg) + '<small>kg</small>' : '自重'}</b><small>${+best.date.slice(5, 7)}/${+best.date.slice(8)}</small></div>` +
      `<div><span>估算一次最大</span><b>${bestE ? round1(bestE) + '<small>kg</small>' : '–'}</b><small>按重量和次数算</small></div>` +
      `<div><span>练过</span><b>${ss.length}<small>次</small></b><small>${+ss[0].date.slice(5, 7)}/${+ss[0].date.slice(8)} 起</small></div></div>` +
      chart +
      (p ? this.liftNextHtml(p, name) : '') +
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
  /** 动作详情里的「下次」：练多少 + 为什么 + 按你的习惯定的节奏（几个一组、每次加多少，v12.2） */
  liftNextHtml(p, name) {
    const n = p.next;
    const st = TF.Overload && name ? TF.Overload.status(this.workouts.filter(w => w.exerciseName === name)) : null;
    const kgs = (w) => (w > 0 ? round1(w) + 'kg' : '自重');
    // 你现在的水平：每记一次自动更新（v12.3：不用自己设，自己加了重量就按新重量）
    const now = st ? `<p class="lift-rule">你现在：<b>${kgs(st.now.w)}</b>，平常 ${st.now.sets} 组 × ${st.now.reps} 个` +
      (st.best.w > st.now.w || st.best.reps > st.now.reps ? ` · 最好 ${kgs(st.best.w)} × ${st.best.reps}` : '') + ' · 每记一次自动更新</p>' : '';
    return `<div class="lift-next"><span>下次</span><div><b>${esc(n.text.replace(/^下次/, ''))}</b><small>${esc(n.why)}</small></div></div>` + now;
  },
  /** 一天的一句话（卡片上的「签名」）：多吃了 / 赤字达标 / 蛋白够了 / 练了哪儿，挑最多三样 */
  dayBio(d, gap, target) {
    const parts = [];
    const v = gap.val(d);
    if (!d.hasLogs) return '这天没记';
    if (v != null) {
      if (v < 0) parts.push(gap.gain ? `少吃了 ${fmt(-v)}，增肌得吃够` : `多吃了 ${fmt(-v)}，第二天少吃一口就回来`);
      else if (gap.target && v >= gap.target * 0.8) parts.push(gap.gain ? '热量盈余到位' : '热量赤字达标');
    }
    if (d.hasDiet && target && d.protein >= target * 0.9) parts.push('蛋白吃够了');
    else if (d.hasDiet && target && d.protein < target * 0.6) parts.push(`蛋白差 ${Math.round(target - d.protein)}g`);
    const groups = [...new Set(d.lifts.map(w => (w.muscleGroup || '').replace(/部$/, '')).filter(Boolean))];
    if (groups.length) parts.push(`练了${groups.slice(0, 3).join('、')}`);
    else if (d.cardio.length) parts.push(`${d.cardio[0].exerciseName} ${d.cardio[0].durationMin} 分钟`);
    if (!d.hasDiet) parts.push('吃的没记');
    return parts.slice(0, 3).join('，') || '记了';
  },

  /**
   * 每一天（v12.5：「卡片一张一张，像社交软件的 Profile 那样左右划」）：今天在最前，往左划往前翻。
   * 一张卡：封面（这天好不好决定颜色）、头像位置是吃了多少对预算的圆环、日子、一句话、三个数（赤字 / 蛋白 / 动作）、
   * 按钮（看这天 / 存成计划 / 今天照这天练）。v12.6 简化：每顿的小标签、动作明细都去掉了（练了哪儿那句话里有，「看这天」看全的），
   * 每张卡一样的几行，划起来整整齐齐。
   */
  renderDayCards(el) {
    if (!el) return;
    const today = getTodayDateString();
    const simple = this.isSimple();
    const gap = this.trendGap();
    const target = Math.round(this.gaugeProteinTarget ? this.gaugeProteinTarget() : (this.profile.targetProteinG || 0));
    const R = 30, C = 2 * Math.PI * R;
    const cards = [];
    for (let i = 0; i < 30; i++) {
      const d = this.trendDay(shiftDateString(today, -i));
      const wd = '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()];
      const when = i === 0 ? '今天' : i === 1 ? '昨天' : `${i} 天前`;
      const v = gap.val(d);
      const over = d.hasDiet && d.intake > d.budget + 50;
      const tone = !d.hasLogs ? 'blank' : over ? 'over' : v != null && gap.target && v >= gap.target * 0.8 ? 'good' : 'ok';
      const pct = d.hasDiet && d.budget ? Math.min(1, d.intake / d.budget) : 0;
      const ring = `<svg class="dp-ring" viewBox="0 0 72 72" aria-hidden="true"><circle class="dp-track" cx="36" cy="36" r="${R}"/>` +
        (pct > 0 ? `<circle class="dp-arc" cx="36" cy="36" r="${R}" transform="rotate(-90 36 36)" stroke-dasharray="${(pct * C).toFixed(1)} ${C.toFixed(1)}"/>` : '') + '</svg>';
      const center = !d.hasDiet ? `<b>${d.hasLogs ? '—' : '?'}</b><small>${d.hasLogs ? '没记吃' : '没记'}</small>`
        : simple ? `<b>${fmt(d.intake)}</b><small>kcal</small>`
          : `<b>${fmt(Math.abs(v))}</b><small>${v < 0 ? (gap.gain ? '少吃' : '多吃') : gap.gain ? '盈余' : '赤字'}</small>`;
      const top = new Map();
      d.lifts.forEach(w => { const t = top.get(w.exerciseName); if (!t || (w.weightKg || 0) > (t.weightKg || 0)) top.set(w.exerciseName, w); });
      const stats = [
        d.hasDiet ? [fmt(d.intake), `吃了 / ${fmt(d.budget)}`] : ['—', '吃了'],
        d.hasDiet ? [`${Math.round(d.protein)}g`, target ? `蛋白 / ${target}` : '蛋白'] : ['—', '蛋白'],
        [String(top.size + d.cardio.length), d.ws.length ? '个动作' : '没练']
      ].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
      cards.push(`<article class="dp ${tone}" data-date="${d.date}" data-i="${i}">` +
        `<div class="dp-cover"><span class="dp-tag">${when}</span></div>` +
        `<div class="dp-id"><div class="dp-avatar">${ring}<span class="dp-c">${center}</span></div>` +
        `<div class="dp-name"><b>${+d.date.slice(5, 7)}月${+d.date.slice(8)}日</b><span>${wd}${d.weight ? ` · ${round1(d.weight)}kg` : ''}</span></div></div>` +
        `<p class="dp-bio">${esc(this.dayBio(d, gap, target))}</p>` +
        `<div class="dp-stats">${stats}</div>` +
        `<div class="dp-acts">${d.hasLogs ? '<button type="button" class="dp-btn" data-dc="open">看这天</button>' : '<button type="button" class="dp-btn" data-dc="open">去补一笔</button>'}` +
        (d.ws.length && !simple ? '<button type="button" class="dp-btn" data-dc="save">存成计划</button>' + (i ? '<button type="button" class="dp-btn main" data-dc="redo">今天照这天练</button>' : '') : '') +
        '</div></article>');
    }
    el.innerHTML = cards.join('');
    el.scrollLeft = 0;
    el.querySelectorAll('[data-dc]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const date = b.closest('.dp').dataset.date;
      const act = b.dataset.dc;
      window.Haptics && window.Haptics.fire('tick');
      if (act === 'open') { this.selectedDate = date; this.switchView('today'); return; }
      const ws = this.workouts.filter(w => w.date === date);
      if (act === 'save') {
        // 这天练的存进计划本：以后说「明天练 X」就放过去
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
    this.bindDayCarousel(el);
  },

  /**
   * 划卡片：离中间越远的越小、越淡（--k 0～1）；下面一根细条跟着走，右上写「今天 · 1 / 30」；
   * 划到哪张，那张的圆环转一圈（.seen）。
   */
  bindDayCarousel(el) {
    const dots = document.getElementById('tr-dots');
    const count = document.getElementById('tr-days-count');
    const cards = [...el.querySelectorAll('.dp')];
    if (dots) dots.innerHTML = '<i></i>';
    const update = () => {
      this._dcRaf = 0;
      const box = el.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      let best = 0, bestD = Infinity;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - mid) / (r.width || 1);
        c.style.setProperty('--k', Math.min(1, dist).toFixed(3));
        if (dist < bestD) { bestD = dist; best = i; }
      });
      const c = cards[best];
      if (c && !c.classList.contains('seen')) c.classList.add('seen');
      if (count) count.textContent = `${best === 0 ? '今天' : best === 1 ? '昨天' : `${+c.dataset.date.slice(5, 7)}月${+c.dataset.date.slice(8)}日`} · ${best + 1} / ${cards.length}`;
      if (dots) {
        const max = el.scrollWidth - el.clientWidth;
        dots.style.setProperty('--x', max > 0 ? (el.scrollLeft / max).toFixed(3) : 0);
        dots.style.setProperty('--w', (1 / cards.length).toFixed(3));
      }
    };
    if (el._onScroll) el.removeEventListener('scroll', el._onScroll);
    el._onScroll = () => { if (!this._dcRaf) this._dcRaf = requestAnimationFrame(update); };
    el.addEventListener('scroll', el._onScroll, { passive: true });
    requestAnimationFrame(update);
  },

  /** 图上点了某天：下面的卡片悄悄划到这天、亮一下（页面不跳，免得看数的时候被拽走） */
  trendFocusDay(date) {
    const box = document.getElementById('tr-days');
    const card = box && box.querySelector(`.dp[data-date="${date}"]`);
    if (!card) return;
    box.scrollTo({ left: card.offsetLeft - (box.clientWidth - card.offsetWidth) / 2, behavior: this.reducedMotion && this.reducedMotion() ? 'auto' : 'smooth' });
    box.querySelectorAll('.dp.focus').forEach(c => c.classList.remove('focus'));
    card.classList.add('focus');
    clearTimeout(this._focusT);
    this._focusT = setTimeout(() => card.classList.remove('focus'), 1600);
  }
});
