/**
 * 趋势页：每天赤字（健身模式）或每天吃了多少（只记吃的模式）柱状图、体重曲线、动作进步。
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
    const name = this.userName ? this.userName() : '';
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
    const art = look.show ? TF.Buddy.svg({ char: look.char, hair: look.hair, outfit: look.outfit, mood: st.mood, gear: st.gear, pose: this._coachWave ? 'wave' : 'stand' }) : '';
    // 在这页看了半天，小人补的那一句（trendNudge）
    const x = this._trendExtra && this._trendExtra.days === this.trendDays ? this._trendExtra : null;
    const more = x ? `<p class="coach-more">${esc(x.text)}</p>` + (x.next.length ? `<div class="buddy-next">${x.next.map(q => `<button class="next-chip" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '') : '';
    el.innerHTML = `<div class="coach">${art ? `<button type="button" class="coach-buddy" aria-label="小人">${art}</button>` : ''}` +
      `<div class="coach-bubble"><p class="coach-head">${esc(r.head)}</p>${r.lines.map(l => `<p>${esc(l)}</p>`).join('')}${more}</div></div>`;
    el.querySelectorAll('.next-chip').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      this.switchView('today');
      if (window.QuickLog) window.QuickLog.submit(b.dataset.q);
    }));
  },

  renderTrend() {
    const $ = (id) => document.getElementById(id);
    this.renderTrendBuddy();
    document.querySelectorAll('#trend-range .seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.range) === this.trendDays));

    const today = getTodayDateString();
    const simple = this.isSimple();
    const days = [];
    for (let i = this.trendDays - 1; i >= 0; i--) {
      const date = shiftDateString(today, -i);
      const s = this.getDaySummary(date);
      days.push({ date, summary: s, value: s.hasDiet ? (simple ? s.intake : s.deficit) : null });
    }
    const logged = days.filter(d => d.value !== null);
    const total = logged.reduce((a, d) => a + d.value, 0);
    $('tr-days').textContent = days.filter(d => d.summary.hasLogs).length;

    if (simple) {
      const overDays = logged.filter(d => d.summary.remaining < 0).length;
      $('tr-avg-l').textContent = '平均每天吃';
      $('tr-avg').textContent = logged.length ? fmt(total / logged.length) : '–';
      $('tr-avg-u').textContent = 'kcal';
      $('tr-fat-l').textContent = '超预算';
      $('tr-fat').textContent = logged.length ? overDays : '–';
      $('tr-fat-u').textContent = '天';
      $('trend-chart-title').textContent = '每天吃了多少';
      $('trend-legend').innerHTML = '<span><i class="sw sw-pos"></i>没超</span><span><i class="sw sw-neg"></i>超了</span><span><i class="sw sw-target"></i>预算</span>';
      const budget = this.profile.tdee - (this.profile.targetDeficitKcal || 0);
      this.drawBarChart($('trend-chart'), days, {
        target: budget,
        cls: (d) => (d.summary.remaining < 0 ? 'bar-neg' : 'bar-pos'),
        tip: (d) => (d.value === null ? '没记饮食' : `吃了 ${fmt(d.value)} kcal${d.summary.remaining < 0 ? `，超 ${fmt(-d.summary.remaining)}` : ''}`),
        empty: '记几天饮食后，这里会显示每天吃了多少',
        aria: '每天摄入热量柱状图'
      });
    } else {
      const target = this.profile.targetDeficitKcal || 0;
      $('tr-avg-l').textContent = '平均每天赤字';
      $('tr-avg').textContent = logged.length ? fmt(total / logged.length) : '–';
      $('tr-avg-u').textContent = 'kcal';
      $('tr-fat-l').textContent = '折合脂肪';
      $('tr-fat').textContent = logged.length ? (total / 7700).toFixed(2) : '–';
      $('tr-fat-u').textContent = 'kg';
      $('trend-chart-title').textContent = '每天热量赤字';
      $('trend-legend').innerHTML = '<span><i class="sw sw-pos"></i>赤字</span><span><i class="sw sw-neg"></i>超出</span><span><i class="sw sw-target"></i>目标</span>';
      this.drawBarChart($('trend-chart'), days, {
        target: target > 0 ? target : null,
        cls: (d) => (d.value > 0 ? 'bar-pos' : 'bar-neg'),
        tip: (d) => (d.value === null ? '没记饮食' : (d.value >= 0 ? `赤字 ${fmt(d.value)} kcal` : `超出 ${fmt(-d.value)} kcal`)),
        empty: '记几天饮食后，这里会显示每天的热量赤字',
        aria: '每天热量赤字柱状图'
      });
    }
    this.drawWeightChart($('weight-chart'), shiftDateString(today, -(this.trendDays - 1)));
    this.renderProgressList($('progress-list'));
  },

  drawWeightChart(el, since) {
    const pts = this.weights.filter(w => w.date >= since);
    const tr = this.weightTrend();
    const legend = document.getElementById('weight-legend');
    legend.textContent = tr ? `最新 ${round1(tr.last.kg)} kg` : '';
    if (pts.length < 2) {
      el.innerHTML = `<div class="chart-empty">${this.weights.length ? '再记几天体重，这里会画出变化曲线' : '说「体重 62.5」就能记，记几天后这里会画出曲线'}</div>`;
      return;
    }
    const W = 340, H = 150, padL = 40, padR = 12, padT = 12, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    const kgs = pts.map(p => p.kg);
    let lo = Math.min(...kgs), hi = Math.max(...kgs);
    const span = Math.max(1, hi - lo);
    lo = Math.floor((lo - span * 0.25) * 2) / 2;
    hi = Math.ceil((hi + span * 0.25) * 2) / 2;
    const t0 = new Date(since + 'T00:00:00').getTime();
    const t1 = new Date(getTodayDateString() + 'T00:00:00').getTime();
    const x = (date) => padL + ((new Date(date + 'T00:00:00').getTime() - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (kg) => padT + ((hi - kg) / (hi - lo)) * ih;
    let grid = '';
    const step = (hi - lo) <= 2 ? 0.5 : (hi - lo) <= 5 ? 1 : 2;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) {
      grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${round1(v)}</text>`;
    }
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
    const dots = pts.map(p => `<circle class="w-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.2"><title>${p.date.slice(5).replace('-', '/')} ${round1(p.kg)} kg</title></circle>`).join('');
    const md = (d) => d.slice(5).replace('-', '/').replace(/^0/, '');
    const labels = `<text class="axis-text" x="${padL}" y="${H - 6}" text-anchor="start">${md(since)}</text><text class="axis-text" x="${W - padR}" y="${H - 6}" text-anchor="end">今天</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重变化曲线">${grid}<path class="w-line" d="${path}"/>${dots}${labels}</svg>`;
  },

  drawBarChart(el, days, opts) {
    const target = opts.target;
    const vals = days.map(d => d.value).filter(v => v !== null);
    if (!vals.length) {
      el.innerHTML = `<div class="chart-empty">${esc(opts.empty)}</div>`;
      return;
    }
    const W = 340, H = 180, padL = 40, padR = 6, padT = 10, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    let max = Math.max(target || 0, ...vals, 0);
    let min = Math.min(0, ...vals, target || 0);
    const niceStep = (range) => {
      const raw = range / 3;
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      const n = raw / mag;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
    };
    const step = niceStep(max - min || 500);
    max = Math.ceil(max / step) * step || step;
    min = Math.floor(min / step) * step;
    const y = (v) => padT + ((max - v) / (max - min)) * ih;
    const n = days.length;
    const slot = iw / n;
    const gap = n > 14 ? 2 : 6;
    const bw = Math.max(2, slot - gap);
    const r = Math.min(4, bw / 2);

    let grid = '';
    for (let v = min; v <= max + 0.001; v += step) {
      grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      grid += `<text class="axis-text" x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${fmt(v)}</text>`;
    }
    const y0 = y(0);
    let bars = '';
    let labels = '';
    days.forEach((d, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const md = d.date.slice(5).replace('-', '/').replace(/^0/, '');
      const showLabel = n <= 7 || i % 5 === (n - 1) % 5;
      if (showLabel) labels += `<text class="axis-text" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${n <= 7 ? '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()] : md}</text>`;
      if (d.value !== null && d.value !== 0) {
        const pos = d.value > 0;
        const top = pos ? y(d.value) : y0;
        const h = Math.max(1, Math.abs(y(d.value) - y0));
        // 数据端圆角、基线端直角
        const path = pos
          ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
          : `M${x},${y0} V${y0 + h - r} Q${x},${y0 + h} ${x + r},${y0 + h} H${x + bw - r} Q${x + bw},${y0 + h} ${x + bw},${y0 + h - r} V${y0} Z`;
        bars += `<path class="${opts.cls(d)}" d="${path}"/>`;
      }
      const tip = opts.tip(d);
 bars += `<rect class="bar-hit" data-i="${i}" data-date="${d.date}" data-tip="${esc(md + ' · ' + tip)}" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${ih}"><title>${esc(md + ' ' + tip)}</title></rect>`;
    });
    const targetLine = target ? `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>` : '';

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${grid}${targetLine}${bars}${labels}</svg><div class="chart-tip hidden"></div>`;

    const tipEl = el.querySelector('.chart-tip');
    const svg = el.querySelector('svg');
    el.querySelectorAll('.bar-hit').forEach(h => {
      h.addEventListener('mouseenter', () => {
        const box = svg.getBoundingClientRect();
        const scale = box.width / W;
        const [md, text] = h.dataset.tip.split(' · ');
        tipEl.innerHTML = `<span>${esc(md)}</span> ${esc(text)}`;
        const v = days[Number(h.dataset.i)].value;
        const topY = v === null ? y0 : Math.min(y(Math.max(v, 0)), y0);
        tipEl.style.left = Math.min(Math.max((Number(h.getAttribute('x')) + slot / 2) * scale, 60), box.width - 60) + 'px';
        tipEl.style.top = Math.max(topY * scale - 6, 34) + 'px';
        tipEl.classList.remove('hidden');
      });
      h.addEventListener('mouseleave', () => tipEl.classList.add('hidden'));
      h.addEventListener('click', () => {
        this.selectedDate = h.dataset.date;
        this.switchView('today');
      });
    });
  },

  renderProgressList(el) {
    const names = [];
    this.workouts
      .filter(w => !w.durationMin)
      .sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)))
      .forEach(w => { if (!names.includes(w.exerciseName)) names.push(w.exerciseName); });
    if (!names.length) {
      el.innerHTML = `<div class="empty">记几次力量训练后，这里会告诉你每个动作下次该加重量还是加次数</div>`;
      return;
    }
    el.innerHTML = names.slice(0, 12).map(name => {
      const p = this.exerciseProgress(name);
      const l = p.last;
      const d = new Date(l.date + 'T00:00:00');
      return `
        <div class="progress-item">
          <div class="progress-name">${esc(name)}</div>
          <div class="progress-last">${l.weightKg > 0 ? round1(l.weightKg) + 'kg' : '自重'} × ${l.sets} × ${l.reps}</div>
          <div class="progress-sub">${d.getMonth() + 1}/${d.getDate()} · 共 ${p.count} 次${p.best > 0 ? ` · 最重 ${round1(p.best)}kg` : ''}</div>
          <div class="progress-next">${esc(p.next.text)}</div>
        </div>`;
    }).join('');
  }
});
