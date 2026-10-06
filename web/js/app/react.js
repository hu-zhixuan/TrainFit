/**
 * 小人对你的记录有反应（v6.4，用户：「陪伴做浅了就是装饰。小人只是蹲在角落，情绪价值要真正成立，得让它对你的记录有反应：
 * 你吃多了它会怎么说，你连续练了一周它会怎么变化；存在感在该有的地方要高，不该有的地方别有」）。都在本机算，不调大模型。
 *
 * 每条记录都有反应，按这条记录对今天、这一周意味着什么挑一个（recordMoment）：
 *  大的（卡片：大一点的小人 + 一句话，几秒后收起；第一次是一段小剧情 story.js）——
 *    pr 破纪录 / week 这周第 5、7 练 / over 这一顿让今天吃超了 / protein 这一顿让蛋白够了 / lighter 体重是最近最轻的
 *  小的（一句短话 + 一个动作）——这周第 3 练、好几天没练回来了、比上次重了、练了；吃超以后又吃、零食、早饭、爱吃的、
 *    有肉、有菜、别的；体重比两周前轻、重了一点、称了
 * 吃多了不数落：只说明天怎么回来（不饿着、正常吃、走一走）。大的每种一天一次（tf_moment），小的一天最多 8 句（tf_react），
 * 说满了只做动作。不占每天主动说话的次数——这是你刚做了事，它在回应你。
 *
 * 跟着记录变样子（dayLook）：今天练过 → 换上运动背心、肩上搭条毛巾，一整天都是；今天吃超了 → 撑着的表情（buddyState 的 full）。
 * 一周练够了身材跟着变（「跟着我练」，bond.js 的 buddyBuild），露胳膊的背心上看得出来。
 */
Object.assign(FitnessApp.prototype, {
  /** 今天说过哪些大的反应（每种一天一次） */
  momentSaid(kind) {
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_moment') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, kinds: [] };
    if (kind) {
      c.kinds.push(kind);
      try { localStorage.setItem('tf_moment', JSON.stringify(c)); } catch (e) {}
    }
    return c.kinds;
  },

  /** 这几天里有训练的日子（从 from 到 to，含两头） */
  trainDates(from, to) {
    return new Set(this.workouts.filter(w => w.date >= from && w.date <= to).map(w => w.date));
  },

  /**
   * 这条记录意味着什么：{ kind, big, title, text, pose, mood, next, story: { moment, … } }；不是今天的、说不出什么的返回 null。
   * 深夜（23 点～4 点）吃东西交给小别扭（bond.js 的 startSulk），这里不说。
   */
  recordMoment(result, batch) {
    const today = getTodayDateString();
    if (!batch || batch.date !== today || !this.cast().moment) return null;
    const C = this.cast().moment;
    const said = this.momentSaid();
    const pick = (a) => (Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a) || '';
    const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : ''));
    const shortLift = (n) => String(n || '').replace(/^(杠铃|哑铃|器械|史密斯|绳索)/, '') || n;
    const lifts = (batch.workoutIds || []).map(id => this.workouts.find(w => w.id === id)).filter(Boolean);
    const meals = (batch.dietIds || []).map(id => this.diet.find(d => d.id === id)).filter(Boolean);
    const hour = new Date().getHours();

    if (lifts.length) {
      // 破纪录：这次比以前都重
      for (const w of lifts) {
        const fb = this.liftFeedback(w);
        if (fb.includes('新纪录') && !said.includes('pr:' + w.exerciseName)) {
          return { kind: 'pr', key: 'pr:' + w.exerciseName, big: true, title: '新纪录', pose: 'flex', mood: 'great', mark: '!',
            text: fill(pick(C.pr), { lift: shortLift(w.exerciseName), kg: round1(w.weightKg) }),
            next: [`${shortLift(w.exerciseName)}下次练多少`, '这周练了几次'], story: { moment: 'pr' } };
        }
      }
      // 今天第一次练：这周（最近 7 天）第几练；好几天没练回来了
      const ids = new Set(lifts.map(w => w.id));
      const firstToday = !this.workouts.some(w => w.date === today && !ids.has(w.id));
      if (firstToday) {
        const week = this.trainDates(shiftDateString(today, -6), today).size;
        if ((week === 5 || week === 7) && !said.includes('week')) {
          return { kind: 'week', key: 'week', big: true, title: `这周第 ${week} 练`, pose: 'flex', mood: 'great', mark: '!', showOff: true,
            text: pick(C.week[week]), next: ['这周练了哪些部位', '明天练什么'], story: { moment: 'week', week } };
        }
        if (week === 3 && !said.includes('week')) return { kind: 'week', key: 'week', text: pick(C.week[3]), pose: 'flex', mood: 'good' };
        const before = this.workouts.filter(w => w.date < today).map(w => w.date).sort().pop();
        const gap = before ? Math.round((new Date(today + 'T00:00:00') - new Date(before + 'T00:00:00')) / 86400000) : 0;
        if (gap >= 5) return { kind: 'back', text: pick(C.back), pose: 'wave', mood: 'good' };
      }
      for (const w of lifts) {
        const m = this.liftFeedback(w).match(/比上次(重|多)[^·]*/);
        if (m) return { kind: 'up', text: fill(pick(C.up), { lift: shortLift(w.exerciseName), how: m[0].trim() }), pose: 'flex', mood: 'good' };
      }
      return { kind: 'lift', text: fill(pick(C.lift), { lift: shortLift(lifts[0].exerciseName) }), pose: 'flex', mood: 'good' };
    }

    if (meals.length) {
      if (hour >= 23 || hour < 4) return null;
      const s = this.getDaySummary(today);
      const kcal = meals.reduce((t, m) => t + (m.calories || 0), 0);
      const prot = meals.reduce((t, m) => t + (m.proteinG || 0), 0);
      const before = s.intake - kcal, pBefore = s.protein - prot;
      const line = s.budget > 0 ? s.budget + 100 : 0;
      // 这一顿让今天吃超了：撑着的样子 + 不数落的一句（明天怎么回来）
      if (line && s.intake > line && before <= line && !said.includes('over')) {
        const n = Math.round(s.intake - s.budget);
        return { kind: 'over', key: 'over', big: true, title: '吃撑了', pose: 'stand', mood: 'full', mark: '…',
          text: fill(pick(C.over), { n: fmt(n) }), next: ['明天怎么吃', '晚上走走能消耗多少'], story: { moment: 'over', over: n } };
      }
      if (line && before > line) return { kind: 'over2', text: pick(C.over2), mood: 'full' };
      // 这一顿让蛋白够了
      const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0;
      if (target > 0 && s.protein >= target && pBefore < target && !said.includes('protein')) {
        return { kind: 'protein', key: 'protein', big: true, title: '蛋白够了', pose: 'stretch', mood: 'great', mark: '!',
          text: fill(pick(C.protein), { g: Math.round(s.protein) }), next: ['今天还能吃多少', '明天怎么吃'] };
      }
      const names = meals.map(m => [m.foodSummary || ''].concat((m.items || []).map(i => i.name || '')).join('、')).join('、');
      const treat = names.match(/奶茶|蛋糕|甜品|冰淇淋|冰激凌|巧克力|甜点|雪糕|蛋挞|布丁|炸鸡|薯条|薯片|汉堡|披萨|烧烤|啤酒|可乐|辣条|饼干|零食|甜甜圈/);
      if (treat) return { kind: 'treat', text: fill(pick(C.treat), { food: treat[0] }), mood: 'shy', pose: 'stand' };
      if (meals.some(m => m.mealType === '早餐') && hour < 11) return { kind: 'breakfast', text: pick(C.breakfast), mood: 'good', pose: 'stretch' };
      const fav = this.favFood ? this.favFood() : '';
      if (fav && names.includes(fav)) return { kind: 'fav', text: fill(pick(C.fav), { food: fav }), mood: 'good', pose: 'stand' };
      if (prot >= 30) return { kind: 'meat', text: pick(C.meat), mood: 'good', pose: 'flex' };
      if (/西兰花|青菜|蔬菜|沙拉|生菜|菠菜|黄瓜|番茄|西红柿|白菜|芹菜|油麦菜|菜心|蘑菇|木耳|胡萝卜/.test(names)) return { kind: 'green', text: pick(C.green), mood: 'good', pose: 'stand' };
      return { kind: 'any', text: pick(C.any), mood: 'good', pose: 'stand' };
    }

    if (batch.weight && this.weights && this.weights.length) {
      const list = this.weights.slice().sort((a, b) => (a.date > b.date ? 1 : -1));
      const now = list.find(w => w.date === today);
      if (!now) return null;
      const kg = now.kg;
      const earlier = list.filter(w => w.date < today);
      const recent = earlier.filter(w => w.date >= shiftDateString(today, -30));
      const low = recent.length ? Math.min(...recent.map(w => w.kg)) : null;
      // 最近一个月最轻的一次（记过三次以上才算）；比刚开始轻了一公斤是一段小剧情
      if (low != null && earlier.length >= 2 && kg < low - 0.05 && !said.includes('lighter')) {
        return { kind: 'lighter', key: 'lighter', big: true, title: '轻了', pose: 'wave', mood: 'great', mark: '!',
          text: fill(pick(C.lighter), { kg: round1(kg) }), next: ['这周体重怎么样', '这周热量赤字怎么样'],
          story: { moment: 'lighter', drop: round1(list[0].kg - kg) } };
      }
      const ago = earlier.filter(w => w.date <= shiftDateString(today, -12)).pop();
      if (ago && ago.kg - kg >= 1) return { kind: 'down', text: fill(pick(C.down), { d: round1(ago.kg - kg) }), mood: 'good', pose: 'wave' };
      const prev = earlier[earlier.length - 1];
      if (prev && kg - prev.kg >= 0.8) return { kind: 'heavier', text: pick(C.heavier), mood: 'ok', pose: 'stand' };
      return { kind: 'weight', text: pick(C.weight), mood: 'good', pose: 'stand' };
    }
    return null;
  },

  /**
   * 回应这条记录。tier：'big' 只回应大的（pipeline 里排在新手提示、提醒前面）；'small' 只回应小的；'any' 都行。
   * 大的第一次是一段小剧情（firstpr / stuffed / trainweek / lighter），之后是卡片。说了返回 true。
   */
  recordReact(result, batch, tier) {
    if (!this.buddyLook().show || this._touring || this.needsOnboarding || !batch || batch.date !== getTodayDateString()) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop) return false;
    this._recAt = Date.now(); // 刚记了东西：打开 App 的招呼这会儿别来抢
    this.clearStalePop();
    if (!pop.classList.contains('hidden')) return false;
    const m = this.recordMoment(result, batch);
    if (m && m.big && tier !== 'small') {
      this.momentSaid(m.key || m.kind);
      // 第一次：一段小剧情（选的会被记住）；今天已经演过一段就用卡片
      // v8.0：刚记的那条（飞向小人再进剧场）
      const recId = (batch.dietIds || [])[0] || (batch.workoutIds || [])[0];
      const meal = (result.meals || [])[0], lift = (result.workouts || [])[0];
      const rec = meal ? String(meal.foodSummary || '').slice(0, 16) : lift ? String(lift.exerciseName || '') : '';
      if (m.story && this.storyEvent && this.storyEvent('record', Object.assign({ must: true, recId, rec }, m.story))) return true;
      setTimeout(() => this.showMoment(m), 700);
      return true;
    }
    if (tier === 'big') return false;
    // 小的：图鉴点亮了新的一样、记了火锅奶茶这类先说那个
    if ((batch.dietIds || []).length && this.dexUnlock && this.dexUnlock(batch)) return true;
    if ((batch.dietIds || []).length && this.storyAfterRecord && this.storyAfterRecord(batch)) return true;
    const pose = m && m.pose;
    const act = () => {
      if (pose === 'flex') this.buddyDo([['stand', 150], ['flex', 1100], ['stand', 250]]);
      else if (pose === 'stretch') this.buddyDo([['stand', 150], ['stretch', 900], ['stand', 250]]);
      else if (pose === 'wave') this.buddyDo([['stand', 150], ['wave', 1000], ['stand', 250]]);
      else this.buddyHop();
    };
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_react') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0 };
    // 说满了、或者设成了「安静」：只做个动作
    if (!m || !m.text || c.n >= 8 || this.talkLevel() === 'quiet') { if (m) setTimeout(act, 700); return false; }
    if (m.kind === 'week') this.momentSaid('week');
    c.n += 1;
    try { localStorage.setItem('tf_react', JSON.stringify(c)); } catch (e) {}
    setTimeout(() => {
      this.clearStalePop();
      if (!pop.classList.contains('hidden')) return;
      this.buddyQuip(m.text, { ms: 2800 });
      if (m.mood) this.buddyMood(m.mood, 2400);
      act();
    }, 700);
    return true;
  },

  /**
   * 回应记录之前：猜成提问其实是记录的「我想想」收起来；之前主动说的、还开着的话（问生日、饭点问一句、点小人看的）
   * 让给这条记录的回应。正在回答问题、演剧情的不动。
   */
  clearStalePop() {
    const pop = document.getElementById('buddy-pop');
    if (!pop || pop.classList.contains('hidden')) return;
    if (pop.dataset.mode === 'thinking' && this.closeBuddyPop) { this.closeBuddyPop('thinking'); return; }
    if (['chat', 'quip', 'tip', ''].includes(pop.dataset.mode || '')) { clearTimeout(this._askT); pop.classList.add('hidden'); }
  },

  /** 记完以后的回应（饭点「老样子」、照计划、图鉴记一顿也走这里）：大的小的都行 */
  reactRecord(result, batch) {
    return this.recordReact(result, batch, 'any');
  },

  /** 露一下身材时穿什么：解锁了光膀子 / 运动内衣就穿，再不然敞开的外套，都没有就运动背心 */
  showOffOutfit() {
    const open = (k) => !this.outfitOpen || this.outfitOpen(k);
    return open('bare') ? 'bare' : open('open') ? 'open' : 'tank';
  },

  /**
   * 大的反应：一张卡片，大一点的小人（表情、姿势跟着这件事）+ 一句话 + 两个接着问的；八秒后自己收起。
   * 小人那边同时做动作：破纪录秀肌肉、吃撑了捂着肚子（撑着的表情）、蛋白够了举手、体重轻了招手。
   */
  showMoment(m) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return false;
    this.clearStalePop();
    if (!pop.classList.contains('hidden')) return false;
    const look = Object.assign({}, this.dayLook(), m.showOff ? { outfit: this.showOffOutfit() } : {});
    const art = TF.Buddy.svg(this.buddyArt(Object.assign(look, { pose: m.pose === 'stretch' ? 'stretch' : m.pose || 'stand', mood: m.mood, gear: look.gear || [], scale: 3 })));
    pop.dataset.mode = 'moment';
    pop.dataset.level = 'none';
    pop.innerHTML = `<div class="story-card ev moment" data-kind="${esc(m.kind)}"><div class="story-art">${art}</div>` +
      `<div class="story-meta"><span class="story-tag ev mo"><i aria-hidden="true">✦</i>刚刚</span><b class="story-title">${esc(m.title)}</b>` +
      `<span class="story-who">${esc(this.buddyName())}</span></div></div>` +
      `<p class="story-text ev-text"></p>` +
      `<div class="buddy-acts story-acts mo-acts">${(m.next || []).slice(0, 2).map(q => `<button class="buddy-act" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}` +
      `<button class="buddy-act primary" type="button" data-done="1">嗯</button></div>`;
    this.typeOut(pop.querySelector('.ev-text'), m.text);
    pop.querySelector('.mo-acts').addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      window.Haptics && window.Haptics.fire('tick');
      this.closeBuddyPop('moment');
      if (b.dataset.ask && window.QuickLog) window.QuickLog.submit(b.dataset.ask, { ask: true });
    });
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('moment'), 8000);
    window.Haptics && window.Haptics.fire(m.kind === 'over' ? 'tap' : 'success');
    if (window.Sound) window.Sound.play(m.kind === 'over' ? 'blip' : 'unlock', 0.5);
    if (m.mood) this.buddyMood(m.mood, 3200);
    if (m.pose === 'flex') this.buddyDo([['stand', 150], ['flex', 1400], ['stand', 300]]);
    else if (m.pose === 'stretch') this.buddyDo([['stand', 150], ['stretch', 1200], ['stand', 300]]);
    else if (m.pose === 'wave') this.buddyDo([['stand', 150], ['wave', 1200], ['stand', 300]]);
    else this.buddyDo([['stand', 1600]]);
    if (m.mark) {
      const btn = document.getElementById('buddy');
      if (btn) { btn.dataset.bang = m.mark; btn.classList.remove('bang'); void btn.offsetWidth; btn.classList.add('bang'); clearTimeout(this._bangT); this._bangT = setTimeout(() => btn.classList.remove('bang'), 1300); }
    }
    return true;
  },

  /**
   * 跟着今天的记录变的样子：今天练过 → 运动背心 + 肩上的毛巾（本来就露胳膊的衣服不换）。
   * 返回给 buddyArt 盖上去的 { outfit?, gear: [] }；设置里的预览不用这个，还是你选的样子。
   */
  dayLook() {
    const today = getTodayDateString();
    if (!this.workouts.some(w => w.date === today)) return { gear: [] };
    const cur = TF.Buddy.OUTFITS[this.buddyLook().outfit];
    const covered = cur && ['jacket', 'shirt', 'vest', 'hoodie'].includes(cur.type);
    return Object.assign(covered ? { outfit: 'tank' } : {}, { gear: ['towel'] });
  }
});
