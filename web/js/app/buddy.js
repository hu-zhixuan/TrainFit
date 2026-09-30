/**
 * 顶栏的像素小人（照着用户本人画的：黑色蓬松乱发、刘海，黑色棒球服配白袖子、V 领条纹）。
 *
 * 表情跟今天的健康度走：没记 → 发呆（夜里犯困），不健康 → 冒汗，还行 → 平常，健康 → 笑，非常健康 → 眯眼笑 + 闪光。
 * 连续记录的天数换配饰：3 天头带，7 天奖牌，30 天皇冠。点一下弹个气泡：连续几天、今天怎么样、蛋白还差多少。
 * 设置 →「外观」里能换发色、衣服，也能关掉。选的样子存在 profile.buddy 里，跟着备份走。
 *
 * 画法：16×20 的像素图（ART），叠上表情、配饰，自动描一圈深色边（浅色背景上也看得清），再加特效（汗、z、闪光）。
 * 输出 SVG，每种颜色一条 path，shape-rendering=crispEdges。scripts/build-icon.py 也用这里的 compose 画 App 图标。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // '.' 透明。H 头发 h 头发暗部 L 头发高光；S 皮肤 s 皮肤暗部 P 腮红 M 嘴 E 眼睛；W 白 w 白暗部；
  // J 外套 j 外套深色（领口）；N 球衣藏青 Y 荧光绿 K 斜挎带；G 头带 g 头带高光；A 金 a 金高光 R 绶带
  const ART = {
    head: [
      '......H.HH.H....',
      '....HHHHHHHHHH..',
      '...HHLLHHHHHHHH.',
      '..HHLHHHHHHHHHH.',
      '.HHHHHHHHHHHLHHH',
      '.HHHHHHHHHHHHHHH',
      'HHHHHHHHHHHHHHHH',
      'HHHHhHHHHHhHHHHH',
      'HHHhSHhSHHhSSHHH',
      '.HHSSSSSSSSSSHH.',
      '.HhSSESSSSESShH.',
      '..hSSESSSSESSh..',
      '...SPSSSSSSPS...',
      '...sSSSMMSSSs...',
      '.....sSSSSs.....'
    ],
    // 头顶翘起来的几撮头发，两帧来回晃
    tufts: ['......H.HH.H....', '.......H.HH.H...'],
    body: {
      varsity: [
        '....jWjjjjWj....',
        '..WWJjWjjWjJWW..',
        '.WWwJJJWWJJJwWW.',
        '.WWwJWWJJJJJwWW.',
        '.WWwJWWJJJJJwWW.'
      ],
      jersey: [
        '....WWWWWWWW....',
        '..WWNWWWWWWNKW..',
        '.WWNNNYNNNNKKWW.',
        '.NNNNNYNNNKKNNN.',
        '.NNNNNYNNKKNNNN.'
      ]
    },
    eyes: { // x=4, y=10
      open: ['SESSSSES', 'SESSSSES'],
      closed: ['SSSSSSSS', 'SEESSEES'],
      happy: ['SESSSSES', 'ESESSESE']
    },
    mouth: { // x=5, y=12
      flat: ['SSSSSS', 'SSMMSS', 'sSSSSs'],
      smile: ['SSSSSS', 'SMSSMS', 'sSMMSs'],
      grin: ['SSSSSS', 'SMMMMS', 'sSMMSs'],
      frown: ['SSSSSS', 'SSMMSS', 'sMSSMs'],
      tiny: ['SSSSSS', 'SSPPSS', 'sSSSSs']
    },
    gear: {
      band: { x: 0, y: 6, rows: ['GGGGGGGGGGGGGGGG', 'gGGGGGGGGWGGGGGg'] },
      medal: { x: 9, y: 17, rows: ['RR', 'Aa', 'AA'] },
      crown: { x: 5, y: -2, rows: ['A.AA.A', 'AaAAaA'] }
    },
    fx: {
      sweat: { x: 16, y: 7, rows: ['.B', 'BB', 'BB'] },
      zzz: { x: 15, y: -3, rows: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] },
      sparkle: { x: 16, y: -3, rows: ['.X.', 'XXX', '.X.'] }
    }
  };
  const M = 3;                 // 四周留白（描边 + 特效），底下不留：身子到底边截断
  const GW = 16 + M * 2, GH = 20 + M;

  const HAIR = {
    black: { label: '黑', H: '#3a2c26', h: '#241b17', L: '#5c473d' },
    brown: { label: '棕', H: '#6b4a32', h: '#4a3322', L: '#8c6647' },
    ash: { label: '灰', H: '#7d7570', h: '#5b544f', L: '#a39a93' },
    blond: { label: '金', H: '#c9a04e', h: '#9c7a35', L: '#e2c077' }
  };
  const OUTFITS = {
    varsity: { label: '黑白棒球服', art: 'varsity', J: '#363843', j: '#1b1c22', swatch: ['#2a2b32', '#f3f2ee'] },
    green: { label: '绿色棒球服', art: 'varsity', J: '#0f8f66', j: '#0a5e44', swatch: ['#0f8f66', '#f3f2ee'] },
    jersey: { label: '藏青球衣', art: 'jersey', swatch: ['#23315c', '#c8e64a'] }
  };
  const BASE_COLORS = {
    S: '#f1c7a1', s: '#dca783', P: '#f19c8c', M: '#b8584a', E: '#2b1d16',
    W: '#f3f2ee', w: '#cfcfca', N: '#23315c', Y: '#c8e64a', K: '#141519',
    G: '#10b981', g: '#0a8f64', A: '#e7b53c', a: '#fbe08a', R: '#d9493f',
    B: '#7cc4f5', Z: '#9aa3b5', X: '#ffd84d', O: '#17120f'
  };
  const DEFAULT_LOOK = { show: true, hair: 'black', outfit: 'varsity' };

  // 心情：没记 / 犯困 / 四档健康度
  const MOODS = {
    idle: { eyes: 'open', mouth: 'flat' },
    sleepy: { eyes: 'closed', mouth: 'tiny', fx: 'zzz' },
    bad: { eyes: 'open', mouth: 'frown', fx: 'sweat' },
    ok: { eyes: 'open', mouth: 'flat' },
    good: { eyes: 'open', mouth: 'smile' },
    great: { eyes: 'happy', mouth: 'grin', fx: 'sparkle' }
  };
  const LEVEL_MOOD = ['bad', 'ok', 'good', 'great'];
  const GEAR_STEPS = [{ days: 3, gear: 'band', name: '头带' }, { days: 7, gear: 'medal', name: '奖牌' }, { days: 30, gear: 'crown', name: '皇冠' }];

  function look(opts) { return Object.assign({}, DEFAULT_LOOK, opts || {}); }

  /** 连续记录的天数只看到这里为止的配饰：3 天头带；7 天头带 + 奖牌；30 天皇冠 + 奖牌（皇冠压着头带不好看） */
  function gearFor(streak) {
    const g = [];
    if (streak >= 30) g.push('crown', 'medal');
    else { if (streak >= 3) g.push('band'); if (streak >= 7) g.push('medal'); }
    return g;
  }

  /**
   * 拼出一帧像素图。
   * @param {{hair, outfit, mood, gear:string[], frame:0|1, eyes?:string}} o
   * @returns {{ w, h, px: string[][], colors: Object }}  px[y][x] 是颜色代码，'.' 透明
   */
  function compose(o) {
    o = o || {};
    const outfit = OUTFITS[o.outfit] || OUTFITS.varsity;
    const mood = MOODS[o.mood] || MOODS.idle;
    const px = Array.from({ length: GH }, () => Array(GW).fill('.'));
    const put = (x, y, rows) => rows.forEach((r, dy) => [...r].forEach((c, dx) => {
      const X = x + dx + M, Y = y + dy + M;
      if (c !== '.' && Y >= 0 && Y < GH && X >= 0 && X < GW) px[Y][X] = c;
    }));
    const head = ART.head.slice();
    head[0] = ART.tufts[o.frame ? 1 : 0];
    // 头发那一行先清掉再画，换帧时旧的那几撮不会留着
    put(0, 0, head);
    put(0, 15, ART.body[outfit.art]);
    put(4, 10, ART.eyes[o.eyes || mood.eyes]);
    put(5, 12, ART.mouth[mood.mouth]);
    (o.gear || []).forEach(k => { const g = ART.gear[k]; if (g) put(g.x, g.y, g.rows); });
    // 描边：透明格子挨着有颜色的格子就涂深色
    const filled = (x, y) => y >= 0 && y < GH && x >= 0 && x < GW && px[y][x] !== '.' && px[y][x] !== 'O';
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (px[y][x] === '.' && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) px[y][x] = 'O';
    }
    if (mood.fx && !o.noFx) { const f = ART.fx[mood.fx]; put(f.x, f.y, f.rows); }
    const hair = HAIR[o.hair] || HAIR.black;
    const colors = Object.assign({}, BASE_COLORS, { H: hair.H, h: hair.h, L: hair.L, J: outfit.J || '#363843', j: outfit.j || '#1b1c22' });
    return { w: GW, h: GH, px, colors };
  }

  /** 像素图 → SVG 里的 path（每种颜色一条，横着连成段） */
  function paths(img, skip) {
    const by = {};
    img.px.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let n = 1;
        while (x + n < row.length && row[x + n] === c) n++;
        if (c !== '.' && !(skip && skip(c))) (by[c] = by[c] || []).push(`M${x} ${y}h${n}v1h-${n}z`);
        x += n;
      }
    });
    return Object.keys(by).map(c => `<path fill="${img.colors[c]}" d="${by[c].join('')}"/>`).join('');
  }

  /** 画到 canvas 上（分享图片左上角） */
  function draw(ctx, x, y, scale, o) {
    const img = compose(Object.assign({ frame: 0 }, o));
    img.px.forEach((row, py) => row.forEach((c, pxX) => {
      if (c === '.') return;
      ctx.fillStyle = img.colors[c];
      ctx.fillRect(x + pxX * scale, y + py * scale, scale, scale);
    }));
  }

  /** 完整的 SVG：两帧头发来回晃 + 眨眼（只在睁眼的时候）；动不动由 CSS 管 */
  function svg(o) {
    const a = compose(Object.assign({}, o, { frame: 0 }));
    const b = compose(Object.assign({}, o, { frame: 1 }));
    const mood = MOODS[o.mood] || MOODS.idle;
    let blink = '';
    if ((o.eyes || mood.eyes) === 'open') {
      const c = compose(Object.assign({}, o, { frame: 0, eyes: 'closed' }));
      // 眨眼那一帧只画眼睛那一块
      const eyes = { w: c.w, h: c.h, colors: c.colors, px: c.px.map((row, y) => row.map((ch, x) => (y >= 10 + M && y <= 11 + M && x >= 4 + M && x <= 11 + M ? ch : '.'))) };
      blink = `<g class="bd-blink">${paths(eyes)}</g>`;
    }
    return `<svg class="buddy-svg" viewBox="0 0 ${GW} ${GH}" shape-rendering="crispEdges" aria-hidden="true">` +
      `<g class="bd-fa">${paths(a)}</g><g class="bd-fb">${paths(b)}</g>${blink}</svg>`;
  }

  /** 连续记录几天：今天记了从今天往前数；今天还没记就从昨天往前数（早上还没吃不算断） */
  function streakOf(dates, today) {
    const set = new Set(dates);
    const d = new Date(today + 'T12:00:00');
    const key = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!set.has(today)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(key())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /** 离下一个配饰还差几天 */
  function nextGear(streak) {
    const s = GEAR_STEPS.find(x => x.days > streak);
    return s ? { name: s.name, days: s.days - streak } : null;
  }

  /**
   * 今天的心情和气泡里那句话。
   * @param g  TF.HealthGauge.evaluate 的结果；hour 现在几点；proteinLeft 蛋白还差几克
   */
  function moodOf(g, hour, proteinLeft) {
    if (!g || !g.hasData) {
      if (hour >= 22 || hour < 5) return { mood: 'sleepy', say: '困了…今天还没记呢' };
      return { mood: 'idle', say: hour < 10 ? '早！今天吃了啥？按住下面说一句' : '今天还没记，吃了啥说一句就行' };
    }
    const mood = LEVEL_MOOD[g.level] || 'ok';
    const d = g.detail || {}, p = g.parts || {};
    const pLeft = Math.round(proteinLeft || 0);
    if (g.level >= 3) return { mood, say: pLeft > 5 ? `今天吃得太棒了！蛋白再补 ${pLeft}g 就满了` : '今天吃得太棒了！' };
    // 挑最差的那一项说；「健康」档说得轻一点
    const soft = g.level === 2;
    const worst = ['energy', 'protein', 'fat'].filter(k => p[k] != null).sort((x, y) => p[x] - p[y])[0];
    let tip = '';
    if (d.overUl && d.overUl.length) tip = `${d.overUl[0].name}吃超上限了`;
    else if (worst === 'energy' && p.energy < 0.85) {
      tip = d.energyIssue === 'over' ? (soft ? '别再加餐啦' : '今天吃多了点，明天少吃一口') : (soft ? '晚上还能再吃点' : '今天吃得太少了，别饿着');
    } else if (worst === 'protein' && p.protein < 0.85 && pLeft > 0) tip = `蛋白质还差 ${pLeft}g`;
    else if (worst === 'fat' && p.fat < 0.85) tip = d.fatShare != null && d.fatShare < 0.2 ? '油太少了，吃点坚果鸡蛋' : (soft ? '稍微有点油' : '今天有点油');
    if (g.level === 2) return { mood, say: tip ? `吃得不错，${tip}` : pLeft > 5 ? `吃得不错，蛋白还差 ${pLeft}g` : '吃得不错，保持！' };
    return { mood, say: tip || (pLeft > 0 ? `蛋白质还差 ${pLeft}g` : '还行，再均衡一点') };
  }

  const Buddy = { ART, HAIR, OUTFITS, DEFAULT_LOOK, MOODS, LEVEL_MOOD, GEAR_STEPS, W: GW, H: GH, look, gearFor, compose, paths, svg, draw, streakOf, nextGear, moodOf };
  TF.Buddy = Buddy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Buddy;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  buddyLook() { return TF.Buddy.look(this.profile.buddy); },

  /** 有记录的日子（饮食、训练、体重都算） */
  recordDates() {
    return this.diet.map(d => d.date).concat(this.workouts.map(w => w.date), this.weights.map(w => w.date));
  },

  /** 顶栏小人：跟着今天的健康度和连续记录天数变 */
  renderBuddy() {
    const btn = document.getElementById('buddy');
    if (!btn) return;
    const look = this.buddyLook();
    btn.classList.toggle('hidden', !look.show || this.view !== 'today');
    if (!look.show) return;
    const st = this.buddyState();
    const key = [look.hair, look.outfit, st.mood, st.gear.join('+')].join('|');
    if (btn.dataset.key !== key) {
      const first = !btn.dataset.key;
      btn.dataset.key = key;
      btn.innerHTML = TF.Buddy.svg({ hair: look.hair, outfit: look.outfit, mood: st.mood, gear: st.gear });
      if (!first) this.buddyHop();
    } else if (this._buddyCount != null && st.count > this._buddyCount) {
      this.buddyHop(); // 又记了一顿：跳一下
    }
    this._buddyCount = st.count;
    btn.setAttribute('aria-label', `小人：${st.say}`);
    if (!document.getElementById('buddy-pop').classList.contains('hidden')) this.showBuddyPop();
  },

  buddyState() {
    const today = getTodayDateString();
    const s = this.getDaySummary(today);
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const g = TF.HealthGauge.evaluate({
      intake: s.intake, protein: s.protein, fat: s.fat, budget: s.budget, supps: s.supps, nutrients: s.nutrients,
      targetProteinG: this.gaugeProteinTarget(), hour
    });
    const dates = this.recordDates();
    const streak = TF.Buddy.streakOf(dates, today);
    const days = new Set(dates).size;
    const proteinLeft = Math.max(0, this.gaugeProteinTarget() - s.protein);
    const m = TF.Buddy.moodOf(g, hour, proteinLeft);
    const count = this.diet.filter(d => d.date === today).length + this.workouts.filter(w => w.date === today).length;
    return { mood: m.mood, say: m.say, level: g.hasData ? g.level : null, streak, days, gear: TF.Buddy.gearFor(streak), next: TF.Buddy.nextGear(streak), count };
  },

  buddyHop() {
    const btn = document.getElementById('buddy');
    btn.classList.remove('hop');
    void btn.offsetWidth;
    btn.classList.add('hop');
  },

  showBuddyPop() {
    const pop = document.getElementById('buddy-pop');
    const st = this.buddyState();
    pop.dataset.level = st.level == null ? 'none' : String(st.level);
    const head = st.streak ? `连续记录 <b>${st.streak}</b> 天` : '今天开始记吧';
    const foot = [st.days ? `一共记了 ${st.days} 天` : '', st.next ? `再连续 ${st.next.days} 天拿${st.next.name}` : '头带、奖牌、皇冠都拿到了'].filter(Boolean).join(' · ');
    pop.innerHTML = `<div class="buddy-pop-head">${head}</div><p class="buddy-say">${esc(st.say)}</p><p class="buddy-foot">${esc(foot)}</p>`;
    const r = document.getElementById('buddy').getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 4) + 'px';
    pop.style.right = Math.max(12, Math.round(window.innerWidth - r.right - 4)) + 'px';
    pop.classList.remove('hidden');
  },

  bindBuddy() {
    const btn = document.getElementById('buddy');
    const pop = document.getElementById('buddy-pop');
    const close = () => pop.classList.add('hidden');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      this.buddyHop();
      document.getElementById('gauge-pop').classList.add('hidden');
      if (pop.classList.contains('hidden')) this.showBuddyPop(); else close();
    });
    // 温度计的弹窗和小人的气泡不同时开
    document.getElementById('thermo').addEventListener('click', close);
    document.addEventListener('click', (e) => { if (!pop.contains(e.target)) close(); });
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
    // 过了零点、晚上犯困：回到前台时重画一下
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.renderBuddy(); });
  },

  /** 设置 →「外观」里的小人：预览、发色、衣服、显示开关 */
  renderBuddySettings() {
    const look = this.buddyLook();
    const $ = (id) => document.getElementById(id);
    if (!$('buddy-preview')) return;
    const st = this.buddyState();
    $('buddy-preview').innerHTML = TF.Buddy.svg({ hair: look.hair, outfit: look.outfit, mood: 'good', gear: st.gear });
    const sw = (group, list, cur, fill) => {
      $(group).innerHTML = Object.keys(list).map(k => `<button type="button" class="swatch${k === cur ? ' on' : ''}" data-value="${k}" aria-label="${list[k].label}" title="${list[k].label}" style="${fill(list[k])}"></button>`).join('');
    };
    sw('buddy-hair', TF.Buddy.HAIR, look.hair, (h) => `background:${h.H}`);
    sw('buddy-outfit', TF.Buddy.OUTFITS, look.outfit, (o) => `background:linear-gradient(90deg, ${o.swatch[1]} 0 30%, ${o.swatch[0]} 30% 70%, ${o.swatch[1]} 70%)`);
    $('buddy-show').checked = look.show;
    $('buddy-note').textContent = st.streak
      ? `连续记录 ${st.streak} 天。连续 3 天戴头带，7 天拿奖牌，30 天戴皇冠；表情跟着今天吃得健不健康变。`
      : '连续记 3 天戴头带，7 天拿奖牌，30 天戴皇冠；表情跟着今天吃得健不健康变。';
  },

  bindBuddySettings() {
    const set = (patch) => {
      this.profile.buddy = Object.assign(this.buddyLook(), patch);
      this.saveData();
      this.renderBuddySettings();
      this.renderBuddy();
      window.Haptics && window.Haptics.fire('tick');
    };
    const pick = (id, key) => document.getElementById(id).addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) set({ [key]: b.dataset.value });
    });
    pick('buddy-hair', 'hair');
    pick('buddy-outfit', 'outfit');
    document.getElementById('buddy-show').addEventListener('change', (e) => set({ show: e.target.checked }));
  }
});
