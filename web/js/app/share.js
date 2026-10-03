/**
 * 分享图片：把某一天画成一张长图——吃了多少、热量赤字、蛋白质、健康度、每一餐、训练，
 * 可以存到相册或者发给朋友。直接用 canvas 画（不用截图库），颜色跟着 App 当前的深浅色。
 */
// 老一点的 WebView 没有 roundRect：补一个简单的
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

Object.assign(FitnessApp.prototype, {
  /** 画一天的图，返回 PNG 的 dataURL。设计宽度 360，导出 3 倍（1080 像素宽） */
  drawDayImage(date) {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    const C = {
      bg: v('--surface'), card: v('--surface-2'), line: v('--line'), text: v('--text'), text2: v('--text-2'), text3: v('--text-3'),
      accent: v('--accent'), accentText: v('--accent-text'), accentInk: v('--accent-ink'), danger: v('--danger'),
      meal: v('--meal'), mealSoft: v('--meal-soft'), lift: v('--lift'), liftSoft: v('--lift-soft'),
      levels: [v('--danger'), v('--warn'), v('--accent'), v('--great')]
    };
    const FONT = v('--font') || 'sans-serif';
    const font = (weight, size) => `${weight} ${size}px ${FONT}`;

    const simple = this.isSimple();
    const s = this.getDaySummary(date);
    const target = this.profile.targetDeficitKcal || 0;
    const now = new Date();
    const g = TF.HealthGauge.evaluate({
      intake: s.intake, protein: s.protein, fat: s.fat, budget: s.budget, supps: s.supps, nutrients: s.nutrients,
      targetProteinG: this.gaugeProteinTarget(), hour: date === getTodayDateString() ? now.getHours() + now.getMinutes() / 60 : null
    });
    const meals = this.diet.filter(d => d.date === date)
      .sort((a, b) => (MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType)) || (recordTs(a) - recordTs(b)));
    const lifts = this.workouts.filter(w => w.date === date).sort((a, b) => recordTs(a) - recordTs(b));

    // 先算高度
    const W = 360, P = 20, S = 3;
    const MEAL_H = 50, LIFT_H = 40;
    let H = 262;                                          // 顶部 + 大数字 + 三个小格 + 健康度
    if (meals.length) H += 40 + meals.length * MEAL_H;
    if (lifts.length) H += 40 + lifts.length * LIFT_H;
    if (!meals.length && !lifts.length) H += 50;
    H += 64;                                              // 底部

    const cv = document.createElement('canvas');
    cv.width = W * S;
    cv.height = H * S;
    const ctx = cv.getContext('2d');
    ctx.scale(S, S);
    ctx.textBaseline = 'alphabetic';
    const rr = (x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };
    const text = (t, x, y, f, color, align) => { ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); };
    const fit = (t, maxW) => {
      t = String(t || '');
      if (ctx.measureText(t).width <= maxW) return t;
      while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // 顶部：品牌（和 App 图标一样）+ 日期
    drawBrandIcon(ctx, P, 20, 24);
    text('练食AI', P + 32, 37, font(750, 14), C.text2);
    text(this.dateLabel(date).replace('今天 · ', '今天 '), W - P, 37, font(600, 13), C.text2, 'right');

    // 大数字：吃了多少
    text(date === getTodayDateString() ? '今天吃了' : '这天吃了', P, 82, font(600, 14), C.text2);
    ctx.font = font(800, 46);
    const big = fmt(s.intake);
    text(big, P - 1, 128, font(800, 46), C.text);
    const bigW = ctx.measureText(big).width;
    text('kcal', P + bigW + 6, 128, font(600, 15), C.text3);
    text(`预算 ${fmt(s.budget)}`, W - P, 128, font(600, 13), C.text3, 'right');

    // 三个小格
    const deficitCell = ['热量赤字', s.deficit < 0 ? `盈余 ${fmt(-s.deficit)}` : fmt(s.deficit), s.deficit >= target ? C.accentText : s.deficit < 0 ? C.danger : C.text];
    const proteinCell = ['蛋白质', `${fmt(s.protein)}g`, s.protein >= this.gaugeProteinTarget() * 0.9 ? C.accentText : C.text];
    const cells = simple
      ? [['还能吃', s.remaining < 0 ? `超 ${fmt(-s.remaining)}` : fmt(s.remaining), s.remaining < 0 ? C.danger : C.text], proteinCell, deficitCell]
      : [deficitCell, proteinCell, ['训练消耗', s.workoutBurn ? '+' + fmt(s.workoutBurn) : '0', C.text]];
    const cw = (W - P * 2 - 16) / 3;
    cells.forEach(([label, val, color], i) => {
      const x = P + i * (cw + 8);
      rr(x, 146, cw, 56, 12, C.card);
      text(label, x + 12, 168, font(600, 11.5), C.text3);
      text(fit(val, cw - 20), x + 12, 191, font(800, 17), color);
    });

    // 健康度：状态小标签 + 一根横着的「温度计」（四档色阶 + 小球）
    let y = 222;
    const lvColor = g.hasData ? C.levels[g.level] : C.text3;
    ctx.font = font(700, 12);
    const chip = g.hasData ? g.name : '未记录';
    const chipW = ctx.measureText(chip).width + 16;
    rr(P, y, chipW, 22, 11, colorMix(lvColor, 0.16, C.bg));
    text(chip, P + 8, y + 15.5, font(700, 12), lvColor);
    const bx = P + chipW + 12, bw = W - P - bx, by = y + 8;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    C.levels.forEach((c, i) => grad.addColorStop(i / 3, colorMix(c, 0.28, C.card)));
    rr(bx, by, bw, 6, 3, grad);
    if (g.hasData) {
      const kx = bx + Math.max(0.04, g.pos) * bw;
      ctx.beginPath(); ctx.roundRect(bx, by, kx - bx, 6, 3); ctx.fillStyle = lvColor; ctx.fill();
      ctx.beginPath(); ctx.arc(kx, by + 3, 7, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill();
      ctx.beginPath(); ctx.arc(kx, by + 3, 5, 0, Math.PI * 2); ctx.fillStyle = lvColor; ctx.fill();
    }
    y += 40;

    // 饮食
    const section = (title, right) => {
      text(title, P, y + 24, font(750, 14), C.text2);
      if (right) text(right, W - P, y + 24, font(700, 13), C.text3, 'right');
      y += 40;
    };
    if (meals.length) {
      section('饮食', `${fmt(s.intake)} kcal · 蛋白 ${fmt(s.protein)}g`);
      meals.forEach(d => {
        const tag = isSuppOnly(d) ? '补剂' : (d.mealType || '').replace('/补剂', '');
        ctx.font = font(700, 11);
        const tw = ctx.measureText(tag).width + 12;
        rr(P, y + 4, tw, 20, 6, C.mealSoft);
        text(tag, P + 6, y + 18, font(700, 11), C.meal);
        ctx.font = font(700, 14);
        text(fit(d.foodSummary, W - P * 2 - tw - 74), P + tw + 8, y + 19, font(700, 14), C.text);
        text(`${fmt(d.calories)}`, W - P - 28, y + 19, font(800, 14), C.text, 'right');
        text('kcal', W - P, y + 19, font(600, 10.5), C.text3, 'right');
        const sub = isSuppOnly(d) ? TF.nutrientsText(sumNutrients(d.items), 3)
          : simple ? (d.proteinG ? `蛋白 ${round1(d.proteinG)}g` : '') : [d.proteinG ? `蛋白 ${round1(d.proteinG)}g` : '', d.carbsG ? `碳水 ${round1(d.carbsG)}g` : '', d.fatG ? `脂肪 ${round1(d.fatG)}g` : ''].filter(Boolean).join(' · ');
        if (sub) { ctx.font = font(500, 11.5); text(fit(sub, W - P * 2 - tw - 8), P + tw + 8, y + 37, font(500, 11.5), C.text3); }
        y += MEAL_H;
      });
    }

    // 训练
    if (lifts.length) {
      section(simple ? '运动' : '训练', `消耗 ${fmt(s.workoutBurn)} kcal`);
      lifts.forEach(w => {
        rr(P, y + 5, 4, 18, 2, C.lift);
        ctx.font = font(700, 14);
        text(fit(w.exerciseName, W - P * 2 - 130), P + 14, y + 19, font(700, 14), C.text);
        const detail = w.durationMin ? `${w.durationMin} 分钟` : `${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}`;
        text(detail, W - P, y + 19, font(700, 13), C.text2, 'right');
        y += LIFT_H;
      });
    }
    if (!meals.length && !lifts.length) { text('这天还没有记录', P, y + 30, font(500, 13), C.text3); y += 50; }

    // 底部
    ctx.fillStyle = C.line;
    ctx.fillRect(P, H - 52, W - P * 2, 1);
    text('按住说一句话，自动记下吃了啥', P, H - 24, font(500, 11.5), C.text3);
    text('练食AI', W - P, H - 24, font(750, 12), C.accentText, 'right');
    return cv.toDataURL('image/png');
  },

  /** 点顶上的分享：生成这一天的图，弹出预览，可以存相册或发出去 */
  openShare() {
    const date = this.selectedDate;
    let url;
    try { url = this.drawDayImage(date); } catch (e) { this.showToast('图片没生成出来'); return; }
    this._shareImg = { url, name: `练食AI-${date}.png` };
    document.getElementById('share-img').src = url;
    const api = window.TrainFitNative;
    document.getElementById('share-save').classList.toggle('hidden', !!api && !api.saveImage);
    document.getElementById('share-overlay').classList.remove('hidden');
    history.pushState({ share: true }, ''); // 安卓返回键先关预览
    window.Haptics && window.Haptics.fire('tap');
  },

  closeShare(fromBack) {
    const el = document.getElementById('share-overlay');
    if (el.classList.contains('hidden')) return;
    el.classList.add('hidden');
    if (!fromBack && history.state && history.state.share) { this._editorBack = true; history.back(); }
  },

  bindShare() {
    const $ = (id) => document.getElementById(id);
    $('btn-share').addEventListener('click', () => this.openShare());
    $('share-close').addEventListener('click', () => this.closeShare());
    $('share-overlay').addEventListener('click', (e) => { if (e.target.id === 'share-overlay') this.closeShare(); });
    const api = () => window.TrainFitNative;
    $('share-save').addEventListener('click', () => {
      const { url, name } = this._shareImg || {};
      if (!url) return;
      if (api() && api().saveImage) {
        const where = api().saveImage(name, url);
        this.showToast(where ? `已存到 ${where.replace(/\/[^/]*$/, '')}` : '没存上，试试「发给朋友」');
      } else {
        fetch(url).then(r => r.blob()).then(b => downloadBlob(b, name));
      }
      window.Haptics && window.Haptics.fire('success');
    });
    $('share-send').addEventListener('click', () => {
      const { url, name } = this._shareImg || {};
      if (!url) return;
      if (api() && api().shareImage) { api().shareImage(name, url); return; }
      fetch(url).then(r => r.blob()).then(b => {
        const file = new File([b], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
        else downloadBlob(b, name);
      });
    });
  }
});

/** 两个颜色按比例混合（给 canvas 用；a 占 k） */
function colorMix(a, k, b) {
  const rgb = (c) => {
    const ctx = colorMix._ctx || (colorMix._ctx = document.createElement('canvas').getContext('2d'));
    ctx.fillStyle = '#000'; ctx.fillStyle = c;
    const v = ctx.fillStyle; // 规范成 #rrggbb 或 rgba(...)
    if (v[0] === '#') return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16));
    return (v.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  };
  const x = rgb(a), y = rgb(b);
  return `rgb(${x.map((n, i) => Math.round(n * k + y[i] * (1 - k))).join(',')})`;
}
