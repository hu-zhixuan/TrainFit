/**
 * 趴在底部输入栏上的像素小人（照着用户本人画的：黑色蓬松乱发、刘海压着眼睛，黑色棒球服、白袖子）。
 * 学 Claude Code 里趴在输入框上的小家伙：平时趴在「按住说话」那一栏的上沿，弹出「记好了」提示条或者录音面板时，
 * 跳到它们上面趴着。别的界面一点不动。
 *
 * 表情跟今天的健康度走：没记 → 发呆（夜里闭眼打 Z），不健康 → 冒汗，还行 → 平常，健康 → 哼歌，非常健康 → 戴墨镜。
 * 连续记录的天数换装备：3 天头带，7 天棒球帽，30 天皇冠。点一下弹个气泡：连续几天、今天怎么样、蛋白还差多少。
 * 设置 →「外观」里能换发色、衣服，也能关掉。选的样子存在 profile.buddy 里，跟着备份走。
 *
 * 画法：24×17 的像素图（ART），叠上眼睛、装备，自动描一圈深色边（浅色背景上也看得清），再加特效（汗、Z、音符、闪光）。
 * 输出 SVG，每种颜色一条 path，shape-rendering=crispEdges。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // '.' 透明，','（只在装备里用）擦掉原来的像素。
  // H 头发 h 头发暗部 L 头发高光；S 皮肤 s 皮肤暗部（刘海的影子）E 眼睛；J 外套；W 袖子 w 袖子暗部；
  // K 墨镜 k 墨镜反光；G 绿 g 深绿；A 金 a 金高光；B 汗 Z 睡觉 N 音符 X 闪光；O 描边
  const ART = {
    body: [
      '..........H.HH..H.......',
      '........HHHHHHHHH.......',
      '......HHHLLHHHHHHHH.....',
      '.....HHHLHHHHHHHHHHH....',
      '.....HHHHHHHHHHHHHLHH...',
      '....HHHHHHHHHHHHHHHHH...',
      '....HHHHHHHHHHHHHHHHHH..',
      '....HHHHhHHHhHHHHhHHHH..',
      '....HHHhSHhSSShSHhHHHH..',
      '.....HHssssssssssHHH....',
      '.....HHSEESSSSEESHH.....',
      '......HSSSSSSSSSSH......',
      '..JJ..HsSSSSSSSSsH..JJ..',
      '.JJJJJJwwwwwwwwwwJJJJJJ.',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'wWWWWWWWWWWWWWWWWWWWWWWw',
      'wwwwwwwwwwwwwwwwwwwwwwww'
    ],
    // 头顶翘起来的几撮头发，两帧来回晃
    tufts: ['..........H.HH..H.......', '...........H.HH..H......'],
    eyes: { // x=7, y=10
      chill: ['SEESSSSEES', 'SSSSSSSSSS'],
      closed: ['SssSSSSssS', 'SSSSSSSSSS'],
      shades: null
    },
    shades: { x: 6, y: 9, rows: ['KKKKKKKKKKKK', '.KkKK..KkKK.'] },
    gear: {
      band: { x: 4, y: 5, rows: ['GGGGGGGGGGGGGGGGG', 'GGGGGGGGGGWGGGGGGG'] },
      cap: {
        x: 3, y: 0, rows: [
          ',,,,,,,,,,,,,,,,,,',
          '.....GGGGGGGGG....',
          '...GGGGGGGGGGGGG..',
          '..GGGGGGGGGGGGGGG.',
          '..GGGGGGGGWGGGGGGG',
          '.GGGGGGGGGGGGGGGGG',
          'gggggggggggggggggggggg'
        ]
      },
      crown: { x: 9, y: -2, rows: ['A.AA.A', 'AaAAaA'] }
    },
    fx: {
      sweat: { x: 22, y: 7, rows: ['.B', 'BB', 'BB'] },
      zzz: { x: 20, y: -3, rows: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] },
      note: { x: 20, y: -3, rows: ['.NNN', '.N.N', '.N..', 'NN..', 'NN..'] },
      sparkle: { x: 20, y: -3, rows: ['.X.', 'XXX', '.X.'] }
    }
  };
  const AW = 24, AH = ART.body.length;
  const M = 3;                 // 四周留白（描边 + 特效）；底下不留：胳膊直接搭在输入栏的边上
  const GW = AW + M * 2, GH = AH + M;

  const HAIR = {
    black: { label: '黑', H: '#3a2d27', h: '#221a16', L: '#5a4840' },
    brown: { label: '棕', H: '#6b4a32', h: '#4a3322', L: '#8c6647' },
    ash: { label: '灰', H: '#7d7570', h: '#5b544f', L: '#a39a93' },
    blond: { label: '金', H: '#c9a04e', h: '#9c7a35', L: '#e2c077' }
  };
  const OUTFITS = {
    varsity: { label: '黑白棒球服', J: '#363843', W: '#f2f1ed', w: '#d4d3ce' },
    navy: { label: '藏青棒球服', J: '#23315c', W: '#f2f1ed', w: '#d4d3ce' },
    green: { label: '绿白棒球服', J: '#0f8f66', W: '#f2f1ed', w: '#d4d3ce' },
    black: { label: '全黑', J: '#2a2b32', W: '#454750', w: '#32343c' }
  };
  const BASE_COLORS = {
    S: '#f0c9a4', s: '#dcae8a', E: '#241a15', K: '#141519', k: '#5b6170',
    G: '#10b981', g: '#0a7a56', A: '#e7b53c', a: '#fbe08a',
    B: '#7cc4f5', Z: '#9aa3b5', N: '#9aa3b5', X: '#ffd84d', O: '#17120f'
  };
  const DEFAULT_LOOK = { show: true, hair: 'black', outfit: 'varsity' };

  // 心情：没记 / 犯困 / 四档健康度
  const MOODS = {
    idle: { eyes: 'chill' },
    sleepy: { eyes: 'closed', fx: 'zzz' },
    bad: { eyes: 'chill', fx: 'sweat' },
    ok: { eyes: 'chill' },
    good: { eyes: 'chill', fx: 'note' },
    great: { eyes: 'shades', fx: 'sparkle' }
  };
  const LEVEL_MOOD = ['bad', 'ok', 'good', 'great'];
  const GEAR_STEPS = [{ days: 3, gear: 'band', name: '头带' }, { days: 7, gear: 'cap', name: '棒球帽' }, { days: 30, gear: 'crown', name: '皇冠' }];

  function look(opts) {
    const l = Object.assign({}, DEFAULT_LOOK, opts || {});
    if (!HAIR[l.hair]) l.hair = DEFAULT_LOOK.hair;
    if (!OUTFITS[l.outfit]) l.outfit = DEFAULT_LOOK.outfit;
    return l;
  }

  /** 连续记录的天数 → 戴什么（只戴最好的那一样） */
  function gearFor(streak) {
    const s = GEAR_STEPS.filter(x => streak >= x.days).pop();
    return s ? [s.gear] : [];
  }

  /**
   * 拼出一帧像素图。
   * @param {{hair, outfit, mood, gear:string[], frame:0|1, eyes?:string, noFx?:boolean}} o
   * @returns {{ w, h, px: string[][], colors: Object }}  px[y][x] 是颜色代码，'.' 透明
   */
  function compose(o) {
    o = o || {};
    const l = look(o);
    const mood = MOODS[o.mood] || MOODS.idle;
    const px = Array.from({ length: GH }, () => Array(GW).fill('.'));
    const put = (x, y, rows) => rows.forEach((r, dy) => [...r].forEach((c, dx) => {
      const X = x + dx + M, Y = y + dy + M;
      if (c === '.' || Y < 0 || Y >= GH || X < 0 || X >= GW) return;
      px[Y][X] = c === ',' ? '.' : c;
    }));
    const body = ART.body.slice();
    body[0] = ART.tufts[o.frame ? 1 : 0];
    put(0, 0, body);
    const eyes = o.eyes || mood.eyes;
    if (eyes === 'shades') put(ART.shades.x, ART.shades.y, ART.shades.rows);
    else put(7, 10, ART.eyes[eyes] || ART.eyes.chill);
    (o.gear || []).forEach(k => { const g = ART.gear[k]; if (g) put(g.x, g.y, g.rows); });
    // 描边：透明格子挨着有颜色的格子就涂深色
    const filled = (x, y) => y >= 0 && y < GH && x >= 0 && x < GW && px[y][x] !== '.' && px[y][x] !== 'O';
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (px[y][x] === '.' && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) px[y][x] = 'O';
    }
    if (mood.fx && !o.noFx) { const f = ART.fx[mood.fx]; put(f.x, f.y, f.rows); }
    const hair = HAIR[l.hair], outfit = OUTFITS[l.outfit];
    const colors = Object.assign({}, BASE_COLORS, { H: hair.H, h: hair.h, L: hair.L, J: outfit.J, W: outfit.W, w: outfit.w });
    return { w: GW, h: GH, px, colors };
  }

  /** 像素图 → SVG 里的 path（每种颜色一条，横着连成段） */
  function paths(img) {
    const by = {};
    img.px.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let n = 1;
        while (x + n < row.length && row[x + n] === c) n++;
        if (c !== '.') (by[c] = by[c] || []).push(`M${x} ${y}h${n}v1h-${n}z`);
        x += n;
      }
    });
    return Object.keys(by).map(c => `<path fill="${img.colors[c]}" d="${by[c].join('')}"/>`).join('');
  }

  /** 完整的 SVG：两帧头发来回晃 + 眨眼（只在睁眼的时候）；动不动由 CSS 管 */
  function svg(o) {
    const a = compose(Object.assign({}, o, { frame: 0 }));
    const b = compose(Object.assign({}, o, { frame: 1 }));
    const mood = MOODS[o.mood] || MOODS.idle;
    let blink = '';
    if ((o.eyes || mood.eyes) === 'chill') {
      const c = compose(Object.assign({}, o, { frame: 0, eyes: 'closed' }));
      // 眨眼那一帧只画眼睛那一行
      const eyes = { colors: c.colors, px: c.px.map((row, y) => row.map((ch, x) => (y === 10 + M && x >= 7 + M && x <= 16 + M ? ch : '.'))) };
      blink = `<g class="bd-blink">${paths(eyes)}</g>`;
    }
    return `<svg class="buddy-svg" viewBox="0 0 ${GW} ${GH}" width="${GW * 2}" height="${GH * 2}" shape-rendering="crispEdges" aria-hidden="true">` +
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

  /** 离下一个装备还差几天 */
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
      return { mood: 'idle', say: hour < 10 ? '早。今天吃了啥，按住说一句' : '今天还没记，吃了啥说一句就行' };
    }
    const mood = LEVEL_MOOD[g.level] || 'ok';
    const d = g.detail || {}, p = g.parts || {};
    const pLeft = Math.round(proteinLeft || 0);
    if (g.level >= 3) return { mood, say: pLeft > 5 ? `今天吃得很稳。蛋白再补 ${pLeft}g 就满了` : '今天吃得很稳。' };
    // 挑最差的那一项说；「健康」档说得轻一点
    const soft = g.level === 2;
    const worst = ['energy', 'protein', 'fat'].filter(k => p[k] != null).sort((x, y) => p[x] - p[y])[0];
    let tip = '';
    if (d.overUl && d.overUl.length) tip = `${d.overUl[0].name}吃超上限了`;
    else if (worst === 'energy' && p.energy < 0.85) {
      tip = d.energyIssue === 'over' ? (soft ? '别再加餐了' : '今天吃多了，明天少吃一口') : (soft ? '晚上还能再吃点' : '今天吃得太少了，别饿着');
    } else if (worst === 'protein' && p.protein < 0.85 && pLeft > 0) tip = `蛋白质还差 ${pLeft}g`;
    else if (worst === 'fat' && p.fat < 0.85) tip = d.fatShare != null && d.fatShare < 0.2 ? '油太少了，吃点坚果鸡蛋' : (soft ? '稍微有点油' : '今天有点油');
    if (g.level === 2) return { mood, say: tip ? `还不错，${tip}` : pLeft > 5 ? `还不错，蛋白还差 ${pLeft}g` : '还不错，保持。' };
    return { mood, say: tip || (pLeft > 0 ? `蛋白质还差 ${pLeft}g` : '还行，再均衡一点') };
  }

  const Buddy = { ART, HAIR, OUTFITS, DEFAULT_LOOK, MOODS, LEVEL_MOOD, GEAR_STEPS, W: GW, H: GH, look, gearFor, compose, paths, svg, streakOf, nextGear, moodOf };
  TF.Buddy = Buddy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Buddy;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  buddyLook() { return TF.Buddy.look(this.profile.buddy); },

  /** 有记录的日子（饮食、训练、体重都算） */
  recordDates() {
    return this.diet.map(d => d.date).concat(this.workouts.map(w => w.date), this.weights.map(w => w.date));
  },

  /** 小人：跟着今天的健康度和连续记录天数变 */
  renderBuddy() {
    const btn = document.getElementById('buddy');
    if (!btn) return;
    const look = this.buddyLook();
    const show = look.show && this.view === 'today';
    btn.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-buddy', show);
    if (!show) return;
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
    this.placeBuddy();
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

  /** 趴在最上面那一层：平时是输入栏，弹出「记好了」提示条或录音面板时跳到它们上面 */
  placeBuddy() {
    const btn = document.getElementById('buddy');
    const composer = document.getElementById('composer');
    if (!btn || btn.classList.contains('hidden') || !composer) return;
    const base = composer.getBoundingClientRect().top;
    let top = base;
    ['ql-snackbar', 'rec-panel'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('hidden')) return;
      const r = el.getBoundingClientRect(); // 固定定位的元素没有 offsetParent，看它占不占地方
      if (r.height > 0) top = Math.min(top, r.top);
    });
    btn.style.transform = top < base - 1 ? `translateY(${Math.round(top - base)}px)` : '';
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
    const foot = [st.days ? `一共记了 ${st.days} 天` : '', st.next ? `再连续 ${st.next.days} 天拿${st.next.name}` : '头带、棒球帽、皇冠都拿到了'].filter(Boolean).join(' · ');
    pop.innerHTML = `<div class="buddy-pop-head">${head}</div><p class="buddy-say">${esc(st.say)}</p><p class="buddy-foot">${esc(foot)}</p>`;
    const r = document.getElementById('buddy').getBoundingClientRect();
    pop.style.bottom = Math.round(window.innerHeight - r.top + 4) + 'px';
    pop.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
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
    window.addEventListener('resize', () => { close(); this.placeBuddy(); });
    // 提示条、录音面板出现 / 消失 / 变高时，跟着跳上去、跳下来
    const place = () => { this.placeBuddy(); setTimeout(() => this.placeBuddy(), 240); };
    const mo = new MutationObserver(place);
    ['ql-snackbar', 'rec-panel', 'composer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(place);
      ['ql-snackbar', 'rec-panel', 'composer'].forEach(id => { const el = document.getElementById(id); if (el) ro.observe(el); });
    }
    // 过了零点、晚上犯困：回到前台时重画一下
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.renderBuddy(); });
  },

  /** 设置 →「外观」里的小人：预览、发色、衣服、显示开关 */
  renderBuddySettings() {
    const look = this.buddyLook();
    const $ = (id) => document.getElementById(id);
    if (!$('buddy-preview')) return;
    const st = this.buddyState();
    $('buddy-preview').innerHTML = TF.Buddy.svg({ hair: look.hair, outfit: look.outfit, mood: 'ok', gear: st.gear });
    const sw = (group, list, cur, fill) => {
      $(group).innerHTML = Object.keys(list).map(k => `<button type="button" class="swatch${k === cur ? ' on' : ''}" data-value="${k}" aria-label="${list[k].label}" title="${list[k].label}" style="${fill(list[k])}"></button>`).join('');
    };
    sw('buddy-hair', TF.Buddy.HAIR, look.hair, (h) => `background:${h.H}`);
    sw('buddy-outfit', TF.Buddy.OUTFITS, look.outfit, (o) => `background:linear-gradient(90deg, ${o.W} 0 30%, ${o.J} 30% 70%, ${o.W} 70%)`);
    $('buddy-show').checked = look.show;
    $('buddy-note').textContent = (st.streak ? `连续记录 ${st.streak} 天。` : '') + '趴在「按住说话」上面；连续记 3 天戴头带，7 天戴棒球帽，30 天戴皇冠。';
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
