/**
 * 一键记录 · 后台整理和保存：说完的话先变成「正在整理」卡片，大模型整理好后
 * 新增 / 修改 / 删除记录（含体重），底部提示可以撤销；App 在后台时发通知。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  const { MEAL_TYPES, quickWeight, Native, Haptics, Parser, QuickLog, mergeItems, sumItems, looksLikeQuestion, partialAnswer } = TF;

  Object.assign(QuickLog, {
    STUCK_MS: 3 * 60 * 1000, // 整理超过这么久还没好：算失败，留卡片让你重试

    /** 切回 App 时看一眼：放在后台时计时器是停的，按真实时间算，卡太久的直接算失败 */
    reapStale() {
      const app = root.app;
      if (!app || !app.pending) return;
      app.pending.filter(p => p.status === 'working' && Date.now() - (p.startedAt || p.ts) > this.STUCK_MS)
        .forEach(p => { if (p.expire) p.expire(); else app.failPending(p.id, 'AI 太慢了，没等到结果'); });
    },

    // ----- 解析 + 保存（后台进行，不用等） -----
    /** opts.ask：点的是「接着问」这类，一定当成提问（小人马上进「我想想」）；opts.again：点了「再试一次」，不算重复 */
    submit(text, opts) {
      text = (text || '').trim();
      if (!text) return;
      // 同一句点了两下、发了两次：5 秒内、或者上一句还在整理，就不再发（省 token，也不打断已经出来的回答）
      const now = Date.now();
      if (!(opts && opts.again) && ((this._last && this._last.text === text && now - this._last.at < 5000) ||
        (root.app.pending || []).some(p => p.text === text && p.status === 'working'))) return;
      this._last = { text, at: now };
      // 手机自己就能答的（「还差多少蛋白」「卧推最好多少」）：马上答，不问大模型
      const quick = root.app.quickAnswer ? root.app.quickAnswer(text) : null;
      if (quick && root.app.showBuddyAnswer) {
        root.app.showBuddyAnswer(text, quick.text, { next: quick.next });
        return;
      }
      // 「老样子」：这个钟点最常吃的那一餐，和空白页上那个按钮一样，马上记
      if (/^(还是|跟平时一样|和平时一样|跟以前一样)?(老样子|照旧)[吧啊呀了。！!]*$/.test(text) && root.app.quickSuggestions) {
        const usual = root.app.quickSuggestions().find(x => x.kind === 'meal' && x.usual && !x.done);
        if (usual) { root.app.quickRepeatKey(usual.key); return; }
      }
      // 听着像提问：不出「正在整理」卡片，小人马上在气泡里说「我想想…」（Atria 要 10～25 秒才出第一个字）
      const ask = !!((opts && opts.ask) || (looksLikeQuestion && looksLikeQuestion(text)));
      const p = root.app.addPending(text, ask);
      if (ask && root.app.showBuddyThinking) root.app.showBuddyThinking(text);
      this.process(p);
    },

    /** 给大模型的上下文：这天的记录（带编号）+ 各动作最近一次成绩 */
    buildContext(p) {
      const app = root.app;
      const date = p.date;
      const dayRecords = [];
      app.diet.filter(d => d.date === date).forEach(d => dayRecords.push({
        kind: 'meal', id: d.id,
        text: `${(d.mealType || '').replace('/补剂', '')} ${d.foodSummary} ${d.calories}kcal 蛋白${d.proteinG || 0} 碳水${d.carbsG || 0} 脂肪${d.fatG || 0}` +
          (Array.isArray(d.items) && d.items.length ? `（${d.items.map(i => `${i.name}${i.amount ? ' ' + i.amount : ''}${i.grams ? ' ' + i.grams + 'g' : ''} ${i.calories}kcal 蛋白${i.proteinG || 0}`).join('、')}）` : '')
      }));
      app.workouts.filter(w => w.date === date).forEach(w => dayRecords.push({
        kind: 'workout', id: w.id,
        text: w.durationMin ? `训练 ${w.exerciseName} ${w.durationMin}分钟 消耗${w.burnedCalories || 0}` :
          `训练 ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}组×${w.reps}次 消耗${w.burnedCalories || 0}`
      }));
      dayRecords.forEach((r, i) => { r.ref = 'r' + (i + 1); });

      const seen = new Set();
      const recent = [];
      app.workouts
        .filter(w => !w.durationMin)
        .sort((x, y) => (y.date === x.date ? (y.ts || 0) - (x.ts || 0) : (y.date > x.date ? 1 : -1)))
        .forEach(w => {
          if (seen.has(w.exerciseName)) return;
          seen.add(w.exerciseName);
          const feel = w.rpe >= 9.5 ? '，很吃力' : w.rpe && w.rpe <= 7 ? '，还能加' : '';
          recent.push(`${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}（${w.date.slice(5)}${feel}）`);
        });

      const today = getTodayDateString();
      const dayLabel = date === today ? `今天 ${date}` : date;
      const lw = app.latestWeight ? app.latestWeight() : null;
      // 问「还能吃什么」「明天吃啥」时要用：这天的预算、吃了多少、蛋白质目标
      let day = null;
      try {
        const s = app.getDaySummary(date);
        day = { goal: app.profile.goalType, budget: Math.round(s.budget), burn: Math.round(s.workoutBurn), intake: Math.round(s.intake),
          protein: Math.round(s.protein), proteinTarget: Math.round(app.gaugeProteinTarget ? app.gaugeProteinTarget() : (app.profile.targetProteinG || 0)) };
      } catch (e) {}
      // 这天的计划（「早餐照计划吃了」），刚才小人给的计划（「不要米饭换红薯」，15 分钟内）
      const plans = app.planContext ? app.planContext(date) : [];
      const offer = app._planOffer && Date.now() - app._planOffer.at < 15 * 60 * 1000 ? app._planOffer.text : '';
      return { now: new Date(p.ts || Date.now()), history: app.workouts, dayRecords, recent, dayLabel, lastWeight: lw ? lw.kg : null, myFoods: app.myFoods || [], day, plans, lastPlan: offer,
        memo: app.memoList ? app.memoList() : [], date, ask: !!p.ask,
        // 提问：带一行画像；问以前的事才把最近两周一天一行带上（省 token）
        portrait: p.ask && app.portrait ? app.portrait() : [], past: p.ask && TF.needsHistory(p.text) ? this.pastDays(date) : [],
        state: app.profile.dayState && app.profile.dayState.date === date ? app.profile.dayState.sleep : '' };
    },

    /**
     * 提问时给大模型看的最近两周，一天一行（「09-28周日 吃1850 蛋白92 练:杠铃卧推80kg、杠铃深蹲100kg 体重61.2」），
     * 问「上周练了几次」「这个月瘦了多少」「哪天吃得最多」才答得上来。只在提问时带，记录时不带，不拖慢记录。
     */
    pastDays(date) {
      const app = root.app;
      const WK = '日一二三四五六';
      const out = [];
      for (let i = 13; i >= 0; i--) {
        const d = shiftDateString(date, -i);
        const s = app.getDaySummary(d);
        const ws = app.workouts.filter(w => w.date === d);
        const wt = app.weightOn ? app.weightOn(d) : null;
        if (!s.hasDiet && !ws.length && !wt) continue;
        const lifts = [];
        ws.forEach(w => {
          const t = w.durationMin ? `${w.exerciseName}${w.durationMin}分钟` : `${w.exerciseName}${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : ''}`;
          if (!lifts.includes(t)) lifts.push(t);
        });
        out.push(`${d.slice(5)}周${WK[new Date(d + 'T00:00:00').getDay()]}` + (s.hasDiet ? ` 吃${Math.round(s.intake)} 蛋白${Math.round(s.protein)}` : ' 没记吃的') +
          (lifts.length ? ` 练:${lifts.slice(0, 5).join('、')}` : '') + (wt ? ` 体重${round1(wt.kg)}` : ''));
      }
      return out;
    },

    async process(p) {
      const app = root.app;
      // 每整理一次记一个号：点了「重试」以后，上一次迟到的结果不算（不然会记两遍）
      const run = p.run = (p.run || 0) + 1;
      const mine = () => p.run === run && app.pending.some(x => x.id === p.id);
      let shown = '';
      const fail = (e) => {
        if (!mine() || p.status !== 'working') return; // 已经算失败了 / 被删了 / 又重试了
        clearTimeout(deadline);
        app.failPending(p.id, Parser.failReason(e));
        if ((p.ask || shown) && app.showBuddyFailed) app.showBuddyFailed(p, Parser.failReason(e));
        if (p.ask && TF.pureQuestion && TF.pureQuestion(p.text)) app.finishPending(p.id); // 只是在问：不留「没整理好」卡片
      };
      // 不管卡在哪，3 分钟还没整理好就算失败，让你重试（以前会一直转「正在整理」）；结果晚到了照样记上
      p.expire = () => fail(new Error('TIMEOUT'));
      const deadline = setTimeout(p.expire, this.STUCK_MS);
      let result;
      // 边想边出字：answer 一出来就往小人的气泡里写
      // 回答写完了、后面在写计划（整份计划要 30～60 秒）：气泡里说「正在排成计划」，别让光标一直闪
      let buf = '', planning = false;
      const onDelta = (soFar) => {
        buf = soFar;
        const a = partialAnswer ? partialAnswer(buf) : '';
        const pl = !!a && /"answer"\s*:\s*"(?:[^"\\]|\\.)*"/.test(buf) && /"plan"\s*:\s*\{/.test(buf);
        if (a && (a !== shown || pl !== planning) && app.showBuddyAnswer && mine()) {
          shown = a;
          planning = pl;
          app.showBuddyAnswer(p.text, a, { streaming: true, planning: pl });
        }
      };
      let ctx;
      try {
        ctx = this.buildContext(p);
        // 只是报体重：不用等大模型
        const kg = quickWeight(p.text, ctx.lastWeight);
        // 说的全是以前吃过的、练过的：按你以前的数直接记，不等大模型（秒记）
        const fast = !kg && !p.ask && TF.fastLog ? TF.fastLog(p.text, { now: ctx.now, today: getTodayDateString(), myFoods: app.myFoods, diet: app.diet, workouts: app.workouts, simple: app.isSimple() }) : null;
        result = kg ? { dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], bodyWeight: kg, reply: '', source: 'fast' }
          : fast || await Parser.parse(p.text, ctx, onDelta);
      } catch (e) {
        console.warn('[QuickLog] 大模型没整理出来：', e && e.message);
        clearTimeout(deadline);
        fail(e);
        return;
      }
      clearTimeout(deadline);
      if (!mine()) return; // 已被用户删掉，或者又点了重试
      // 「早餐照计划吃了」：大模型记好了，把那几条计划划掉
      if ((result.donePlans || []).length && app.dropPlan) {
        const byRef = new Map((ctx.plans || []).map(x => [x.ref, x.id]));
        app.markPlansDone(result.donePlans.map(ref => byRef.get(ref)).filter(Boolean));
      }
      const changes = result.workouts.length + result.meals.length + (result.updates || []).length + (result.deletes || []).length + (result.bodyWeight ? 1 : 0) + (result.remember || []).length + (result.memo || []).length + (result.forget || []).length;
      const answerOpts = { plan: result.plan, baseDate: p.date, next: result.next };
      if (!changes) {
        // 问问题（「明天吃什么」）：不记、不报错，小人回答；给了计划的话气泡里能「加到明天」
        if (result.answer) {
          app.finishPending(p.id);
          app.render();
          if (app.showBuddyAnswer) app.showBuddyAnswer(p.text, result.answer, answerOpts);
          return;
        }
        if (p.status !== 'working') return; // 3 分钟时已经算失败了，别再震一次
        app.failPending(p.id, result.reply || '没认出吃了什么');
        if (p.ask && app.showBuddyFailed) app.showBuddyFailed(p, result.reply || '没听懂，换个说法试试');
        else if (!p.ask && app.coachFail) app.coachFail(p); // 卡住了：小人教一句怎么说好认
        if (p.ask && TF.pureQuestion && TF.pureQuestion(p.text)) app.finishPending(p.id);
        return;
      }
      app.finishPending(p.id);
      if ((result.updates || []).length || (result.deletes || []).length) { try { localStorage.setItem('tf_used_fix', '1'); } catch (e) {} }
      const batch = this.save(Object.assign(result, { said: p.text }), p.date, ctx);
      this.showSnack(batch, result);
      if (result.answer && app.showBuddyAnswer) app.showBuddyAnswer(p.text, result.answer, answerOpts); // 又记又问
      else if (batch.asks.length && app.askPortion) app.askPortion(batch.asks); // 份量含糊：小人问一句，点一下就改
      else if (app.newbieTip && app.newbieTip(result)) { /* 新手第一周：小人说一句小提示 */ }
      else if (app.coachTip && app.coachTip(result, batch)) { /* 该提醒的时候说一句：破纪录、晚上蛋白还差很多、吃超了 */ }
      else if (app.askFeeling && app.askFeeling(result, batch)) { /* 练完问一句感受，下次加重量按这个来 */ }
      else if (app.closeBuddyPop) app.closeBuddyPop('thinking'); // 猜成提问其实是记录：把「我想想」收起来
    },

    save(result, baseDate, ctx) {
      const app = root.app;
      const base = baseDate || app.selectedDate || getTodayDateString();
      const date = result.dayOffset ? shiftDateString(base, result.dayOffset) : base;
      const stamp = Date.now();
      const batch = { workoutIds: [], dietIds: [], date, before: [], removed: [], changed: [], asks: [] };
      const refMap = new Map(((ctx && ctx.dayRecords) || []).map(r => [r.ref, r]));
      const find = (r) => (r.kind === 'meal' ? app.diet : app.workouts).find(x => x.id === r.id);

      // 修改
      (result.updates || []).forEach(u => {
        const r = refMap.get(u.ref);
        const rec = r && find(r);
        if (!rec) return;
        r.date0 = rec.date;
        batch.before.push({ kind: r.kind, snapshot: JSON.parse(JSON.stringify(rec)) });
        Object.keys(u.set).forEach(k => {
          if (r.kind === 'meal' && ['mealType', 'foodSummary', 'calories', 'proteinG', 'carbsG', 'fatG'].includes(k)) rec[k] = u.set[k];
          if (r.kind === 'workout' && ['exerciseName', 'muscleGroup', 'weightKg', 'sets', 'reps', 'durationMin', 'burnedCalories'].includes(k)) rec[k] = u.set[k];
        });
        // 挪到别的日子（「记错日子了，挪到前一天」）：整条改日期，不删了重加
        const to = u.set.dayOffset ? shiftDateString(base, u.set.dayOffset) : u.set.date;
        if (to && to !== rec.date && to <= shiftDateString(getTodayDateString(), 7)) {
          rec.date = to;
          batch.moved = (batch.moved || []).concat(to);
        }
        // 改了其中几样：按名字换掉 / 去掉，其他原样保留，合计重算
        if (r.kind === 'meal' && (u.set.items || u.set.removeItems)) {
          const items = mergeItems(rec.items, u.set.items, u.set.removeItems);
          rec.items = items.length ? items : undefined;
          Object.assign(rec, sumItems(items));
          if (!u.set.foodSummary && items.length) rec.foodSummary = items.map(it => it.name + (it.amount || '')).join('、').slice(0, 60);
        }
        const what = r.kind === 'meal' ? `${rec.foodSummary} ${rec.calories} kcal` :
          `${rec.exerciseName} ${rec.durationMin ? rec.durationMin + ' 分钟' : (rec.weightKg > 0 ? rec.weightKg + 'kg' : '自重') + ' ' + rec.sets + '×' + rec.reps}`;
        batch.changed.push(rec.date !== r.date0 ? `挪 · ${what} → ${+rec.date.slice(5, 7)}月${+rec.date.slice(8)}日` : `改 · ${what}`);
      });

      // 删除
      (result.deletes || []).forEach(ref => {
        const r = refMap.get(ref);
        if (!r) return;
        const list = r.kind === 'meal' ? app.diet : app.workouts;
        const idx = list.findIndex(x => x.id === r.id);
        if (idx === -1) return;
        const [rec] = list.splice(idx, 1);
        batch.removed.push({ kind: r.kind, rec });
        batch.changed.push(`删 · ${r.kind === 'meal' ? rec.foodSummary : rec.exerciseName}`);
      });

      // 新增
      // 新手练了个没练过的动作、整句话都没说重量：记好后小人问一句「用了多重？」
      const said = String(result.said || '');
      const saidWeight = /(\d+(\.\d+)?|[一二两三四五六七八九十百半]+)\s*(公斤|kg|千克|斤|磅|lb)|自重|空杆|徒手/i.test(said);
      result.workouts.forEach((w, i) => {
        const id = 'w_' + stamp + '_' + i;
        batch.workoutIds.push(id);
        if (w.estimated && !w.durationMin && w.weightKg > 0 && !saidWeight && !batch.asks.some(a => a.kind === 'lift') &&
            !app.workouts.some(x => x.exerciseName === w.exerciseName && !x.durationMin)) {
          batch.asks.push({ kind: 'lift', id, name: w.exerciseName, saidReps: /组|个|次|下/.test(said) });
        }
        app.workouts.unshift({
          id,
          ts: stamp + i,
          date,
          exerciseName: w.exerciseName,
          muscleGroup: w.muscleGroup,
          sets: w.sets,
          reps: w.reps,
          weightKg: w.weightKg,
          durationMin: w.durationMin || undefined,
          rpe: 8.0,
          burnedCalories: w.burnedCalories,
          notes: w.estimated ? '一键记录（部分参数按上次/默认值估计）' : '一键记录'
        });
      });
      result.meals.forEach((m, i) => {
        const id = 'd_' + stamp + '_' + i;
        batch.dietIds.push(id);
        // 份量说得含糊的那几样：选项不存进记录，记好后小人问一句（「一瓶甜牛奶多大？」）
        const items = (m.items || []).map((it, k) => {
          if (!it.opts) return it;
          batch.asks.push({ kind: 'food', id, index: k, name: it.name, amount: it.amount || '', grams: it.grams, opts: it.opts });
          const rest = Object.assign({}, it);
          delete rest.opts;
          return rest;
        });
        app.diet.unshift({
          id,
          ts: stamp + 50 + Math.max(0, MEAL_TYPES.indexOf(m.mealType)) * 2 + i,
          date,
          mealType: m.mealType,
          foodSummary: m.foodSummary,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          items: items.length ? items : undefined,
          said: result.said ? String(result.said).slice(0, 200) : undefined // 原话：分得清是没听清还是理解错
        });
      });

      // 体重
      if (result.bodyWeight && app.setWeight) {
        batch.weight = { date, prev: app.setWeight(date, result.bodyWeight) };
      }

      // 记住的食物（「记住，糯米鸡一个350大卡」、包装上的营养数）
      batch.remembered = (result.remember || []).map(f => ({ name: f.name, prev: app.rememberFood(f) }));
      // 小本本（「我叫阿程」「我不吃辣」）
      if (((result.memo || []).length || (result.forget || []).length) && app.updateMemo) batch.memoPrev = app.updateMemo(result.memo, result.forget);

      app.saveData();
      app.render();
      return batch;
    },

    describe(result) {
      const lines = [];
      result.workouts.forEach(w => {
        if (w.durationMin) lines.push(`有氧 · ${w.exerciseName} ${w.durationMin} 分钟`);
        else lines.push(`训练 · ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}${w.estimated ? '（估）' : ''}`);
      });
      result.meals.forEach(m => {
        const supp = m.items && m.items.length && m.items.every(i => i.supp);
        lines.push(supp ? `补剂 · ${m.foodSummary}` : `${m.mealType.replace('/补剂', '')} · ${m.foodSummary} ${m.calories} kcal`);
      });
      if (result.bodyWeight) lines.push(`体重 · ${result.bodyWeight} kg`);
      (result.remember || []).forEach(f => lines.push(`记住 · ${f.name} ${f.amount || '1份'} ${f.calories} kcal`));
      (result.memo || []).forEach(m => lines.push(`记在小本本上 · ${m}`));
      (result.forget || []).forEach(m => lines.push(`从小本本上划掉 · ${m}`));
      return lines;
    },

    showSnack(batch, result) {
      const app = root.app;
      const n = result.workouts.length + result.meals.length + (result.bodyWeight ? 1 : 0);
      const kept = (result.remember || []).length;
      let t = result.reply ? '✓ ' + result.reply
        : result.bodyWeight && n === 1 ? `✓ 记下体重 ${result.bodyWeight} kg`
        : n ? `✓ 已记下 ${n} 条`
        : kept ? `✓ 记住了 ${result.remember.map(f => f.name).join('、')}`
        : (result.memo || []).length ? '✓ 记住了'
        : '✓ 已更新';
      if (n && batch.date !== getTodayDateString()) t += `（${batch.date.slice(5).replace('-', '月')}日）`;
      const lines = this.describe(result).concat(batch.changed || []);
      // 练了的动作：和上次比怎么样、下次练多少（本机算，不用等大模型）
      (batch.workoutIds || []).forEach(id => {
        const fb = app.liftFeedback && app.liftFeedback(app.workouts.find(w => w.id === id));
        if (fb) lines.push(fb);
      });
      // 十分钟内记了一模一样的一餐（说了两遍）：提醒一下，重复了点撤销
      (batch.dietIds || []).forEach(id => {
        const d = app.diet.find(x => x.id === id);
        const twin = d && app.diet.find(x => x.id !== id && !batch.dietIds.includes(x.id) && x.date === d.date && x.foodSummary === d.foodSummary &&
          x.calories === d.calories && Math.abs(recordTs(d) - recordTs(x)) < 10 * 60 * 1000);
        if (twin) lines.unshift(`「${d.foodSummary}」和刚才那条一样，重复了就点撤销`);
      });
      const kcal = result.meals.reduce((a, m) => a + (m.calories || 0), 0);
      const eq = kcal > 0 && app.equivText ? app.equivText(kcal) : '';
      if (eq) lines.push(eq);
      Haptics.fire('success');
      root.Sound && root.Sound.play('success');
      // App 在后台（比如说完就锁屏了）：发一条通知
      if (typeof document !== 'undefined' && document.hidden && Native.has() && root.TrainFitNative.showNotification) {
        try { root.TrainFitNative.showNotification(t.replace(/^✓\s*/, ''), lines.join('\n')); } catch (e) {}
      }
      this.showUndo(t, lines, () => {
        app.workouts = app.workouts.filter(w => !batch.workoutIds.includes(w.id));
        app.diet = app.diet.filter(d => !batch.dietIds.includes(d.id));
        (batch.before || []).forEach(b => {
          const list = b.kind === 'meal' ? app.diet : app.workouts;
          const rec = list.find(x => x.id === b.snapshot.id);
          if (rec) Object.keys(rec).forEach(k => delete rec[k]), Object.assign(rec, b.snapshot);
        });
        (batch.removed || []).forEach(r => (r.kind === 'meal' ? app.diet : app.workouts).unshift(r.rec));
        if (batch.weight && app.restoreWeight) app.restoreWeight(batch.weight.date, batch.weight.prev);
        (batch.remembered || []).slice().reverse().forEach(r => app.restoreFood(r.name, r.prev));
        if (batch.memoPrev) app.profile.memo = batch.memoPrev;
        app.saveData();
        app.render();
      });
    },

    /** 通用：底部提示 + 撤销 */
    showUndo(title, lines, undoFn) {
      document.getElementById('ql-snack-title').textContent = title;
      const list = document.getElementById('ql-snack-list');
      list.innerHTML = '';
      (lines || []).forEach(line => {
        const li = document.createElement('div');
        li.className = 'ql-snack-line';
        li.textContent = line;
        list.appendChild(li);
      });
      this._undoFn = undoFn;
      this.snack.classList.remove('hidden');
      clearTimeout(this._snackTimer);
      this._snackTimer = setTimeout(() => this.hideSnack(), 6000);
    },

    undo() {
      Haptics.fire('tap');
      root.Sound && root.Sound.play('undo');
      const fn = this._undoFn;
      this._undoFn = null;
      this.hideSnack();
      if (fn) { fn(); root.app && root.app.showToast('已撤销'); }
    },

    hideSnack() {
      clearTimeout(this._snackTimer);
      this.snack.classList.add('hidden');
    }
  });

  if (root.document) root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) QuickLog.reapStale(); });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
