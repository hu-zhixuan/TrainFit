/**
 * 把一句话变成记录：拼提示词 → 调大模型 → 校验整理成可以直接保存的数据。
 * 大模型连不上就报错（界面上留一张「没整理好」卡片，可以重试），不再用本地规则猜。
 */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && typeof require === 'function') {
    require('./helpers.js');
    require('./native.js');
    require('./food.js');
  }
  const TF = root.TF = root.TF || {};
  const { MUSCLES, MEAL_TYPES, NUTRIENTS, num, cleanText, round1, mealTypeByHour, normMealType, mealTimes, mealSegments, findWeight, guessMuscle, readOverride, Native, FoodDB, MyFoods, groundItem, sumItems } = TF;

  const summaryOf = (items) => cleanText(items.map(it => it.name + (it.amount || '')).join('、'), 60);

  /** 补剂和饭菜分开：补剂都放进一条「加餐/补剂」 */
  function separateSupps(meals) {
    const out = [];
    const supps = [];
    meals.forEach(m => {
      const items = m.items || [];
      const s = items.filter(it => it.supp);
      if (!s.length) { out.push(m); return; }
      if (s.length === items.length) { out.push(Object.assign({}, m, { mealType: '加餐/补剂' })); return; }
      const food = items.filter(it => !it.supp);
      out.push(Object.assign({}, m, sumItems(food), { foodSummary: summaryOf(food), items: food }));
      supps.push(...s);
    });
    if (supps.length) out.push(Object.assign({ mealType: '加餐/补剂', foodSummary: summaryOf(supps), items: supps }, sumItems(supps)));
    return out;
  }

  /** 两段文字最长的公共片段有几个字（「乳清蛋白粉」和「两勺蛋白粉」→ 3） */
  function common(a, b) {
    let best = 0;
    for (let i = 0; i < a.length; i++) {
      for (let j = i + best + 1; j <= a.length && b.includes(a.slice(i, j)); j++) best = j - i;
    }
    return best;
  }

  /**
   * 兜底：原话说了「早上…晚上…」，大模型却把不同时间吃的东西记进了同一条 meal，
   * 就按每样东西在原话里出现在哪个时间后面拆开。有一样对不上原话（或几段里都有）就不动。
   */
  function splitByTime(meals, said) {
    const segs = mealSegments(said);
    if (new Set(segs.map(s => s.type)).size < 2) return meals;
    const out = [];
    meals.forEach(m => {
      const items = m.items || [];
      const types = items.map(it => {
        const scores = segs.map(s => common(it.name, s.text));
        const best = Math.max(...scores);
        const at = new Set(segs.filter((s, i) => scores[i] === best).map(s => s.type));
        return best >= 2 && at.size === 1 ? [...at][0] : null;
      });
      const kinds = [...new Set(types)];
      if (types.includes(null) || kinds.length < 2) { out.push(m); return; }
      kinds.forEach(type => {
        const part = items.filter((it, i) => types[i] === type);
        out.push(Object.assign({}, m, sumItems(part), { mealType: type, foodSummary: summaryOf(part), items: part }));
      });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // 大模型解析
  // ---------------------------------------------------------------------------
  const Parser = {
    buildMessages(text, ctx) {
      ctx = ctx || {};
      const now = ctx.now || new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const day = ctx.dayLabel || '今天';
      const records = ctx.dayRecords || [];
      const recent = (ctx.recent || []).slice(0, 25);

      const system = [
        '你是「练食AI」的记录助手。用户用口语说吃了什么（吃进嘴的都算：饭菜、零食、饮料、水、补剂、药）、训练或体重，文字来自语音识别，可能有同音错字（"卧腿"=卧推，"四组八哥"=4组8个，"划川"=划船，"茶叶大"=茶叶蛋）、没有标点、夹着「呃、嗯、那个、然后、就是」这类口头禅，按意思理解，说到的每样吃的都要记上，听着像错字的按最像的食物记，不要漏。说了又改口（「两碗，不对，一碗」「哦应该是…」）以后说的为准。紧跟在一样东西后面、只补了份量的话（「一个包子，呃大的」「一份炒饭然后是小份」）是那样东西的份量，不要单独记成一项。',
        '由你决定怎么改数据：新增、修改或删除。只输出一个 JSON 对象，不要 markdown，不要解释：',
        '{"reply":"一句话告诉用户你做了什么，20字以内","dayOffset":0,"bodyWeight":null,"remember":[],',
        ' "add":{"workouts":[{"exerciseName":"杠铃卧推","muscleGroup":"胸部","weightKg":80,"sets":4,"reps":8,"durationMin":null,"burnedCalories":110,"estimated":false}],',
        '        "meals":[{"mealType":"早餐","foodSummary":"肉包2个","items":[{"name":"肉包","amount":"2个","grams":200,"whole":true,"calories":460,"proteinG":16,"carbsG":60,"fatG":16}]},',
        '                 {"mealType":"午餐","foodSummary":"番茄炒蛋盖饭1份","items":[{"name":"米饭","amount":"1碗","grams":200,"whole":false,"calories":232,"proteinG":5,"carbsG":52,"fatG":0.6},{"name":"番茄炒蛋","amount":"1份","grams":200,"whole":true,"calories":260,"proteinG":11,"carbsG":10,"fatG":19}]}]},',
        ' "update":[{"ref":"r2","set":{"weightKg":85}}],',
        ' "delete":["r3"]}',
        '规则：',
        '1. muscleGroup 只能是：' + MUSCLES.join('、') + '；mealType 只能是：' + MEAL_TYPES.join('、') + '（怎么判断见第 4 条）。',
        '2. 重量换算成公斤（磅×0.45，斤×0.5），自重 weightKg=0。跑步、单车、跳绳、平板支撑等按时间算的填 durationMin（分钟），sets、reps 为 null；只说了距离（「跑了5公里」）就按常见配速估分钟数。',
        '3. 用户没说的重量/组数/次数：优先用下面「最近成绩」里同一动作的数；没有就按常见训练估一个，并设 "estimated":true。同一动作请沿用最近成绩里的名字。',
        '4. 饮食按餐分：用户说的时间决定是哪一餐——早上/早饭 → 早餐，中午/午饭 → 午餐，晚上/晚饭 → 晚餐，下午茶、练前练后、睡前、夜宵、零食 → 加餐/补剂；没说时间（「刚吃了」）按现在时间和食物判断。',
        '   一句话说了几个时间就拆成几条 meal（「早上A和B，晚上C」= 早餐 A+B 一条、晚餐 C 一条，不能都记到一餐里）；同一餐的东西合并成一条。foodSummary 写给用户看的菜名和份量。items 列出吃了的东西，每项写 name、amount（份量原话，如「1个」「1碗」「半份」）、grams（吃下去的熟重，可食部分）、whole，以及你估的 calories/proteinG/carbsG/fatG。',
        '   先把一样东西当整体估，不要随便拆成原料：成品、包装、门店和早餐店的东西（糯米鸡、饭团、粽子、包子、烧卖、三明治、汉堡、面包蛋糕、奶茶饮料、零食），一碗面、一份麻辣烫、一份炒菜，都作为一项，whole=true，按一个/一份的常见大小估热量，油已经算在里面，不要再单独加烹调油。',
        '   只有明显是几样东西拼起来的才分开写（盖饭 = 米饭 + 菜，套餐 = 主食 + 菜 + 饮料）。单独的米饭、馒头、鸡蛋、牛奶、水果这类单一食材 whole=false，name 尽量用下面「参考营养数据」里的名字，数值会按库重算。参考数据里的成品菜数值可以参考，但要按用户说的做法和份量自己判断。',
        '   克数都按熟的、吃下去的算：米饭一碗约 180g，盖饭和外卖套餐里的米饭约 250–300g，馒头一个约 100g，鸡蛋一个约 50g，牛奶一杯约 250g，糯米鸡一个约 150–200g，一份外卖约 400–600g。',
        '   例外：单独吃的肉、鱼、虾（鸡胸肉、牛肉、猪瘦肉、鱼肉、虾仁）grams 写生重，参考数据里这些是生肉的数——用户说的克数一般就是生重，直接用；没说就估这块肉生的时候多重（熟肉约为生重的七成）。即食鸡胸肉按包装克数。',
        '   蛋白质用户最在意，要估准：肉、蛋、奶、豆制品、蛋白粉按实际份量算（乳清蛋白粉一勺约 30g、含蛋白约 24g）；整份的菜里有多少肉就按多少肉估蛋白质，不要只按菜名套平均值。',
        '   补剂和药（维生素、钙、镁、锌、铁、鱼油、益生菌、肌酸、药片…，蛋白粉不算补剂）：每样一项，加 "kind":"supplement"，不管什么时间都放进 mealType 为 加餐/补剂 的那条 meal，和饭菜分开。calories 按实际（普通片剂、胶囊是 0，鱼油一粒约 9，软糖一粒约 10）。含这些营养素就写 nutrients（这一项的总量，只用这些名字和单位）：' + Object.keys(NUTRIENTS).map(k => `${k}(${NUTRIENTS[k].unit})`).join('、') + '。用户没说剂量就按常见的一片 / 一粒估（维生素D 1μg = 40IU）。例：{"mealType":"加餐/补剂","foodSummary":"鱼油2粒、维生素D1粒","items":[{"name":"鱼油","amount":"2粒","kind":"supplement","calories":18,"fatG":2,"nutrients":{"EPA+DHA":600}},{"name":"维生素D","amount":"1粒","kind":"supplement","calories":0,"nutrients":{"维生素D":10}}]}',
        '   水、黑咖啡、茶这类没有热量的也记，calories 写 0。',
        '   用户念了包装上的营养数（「包装上写每100克210大卡」「一包300大卡」），严格按用户给的数算，这一项加 "source":"label"。',
        '   下面「记住的食物」是用户确认过的数：说到同样的东西（同名或明显是同一样）就用那里的名字，数值按份数换算；只是相似的不要套用。burnedCalories 按常见强度估算。',
        '5. 用户说「记错了/改成/其实是/只吃了一半/删掉/不算」等，是在改已有记录：用 update（set 里只写要改的字段；饮食份量变了就在 set 里给新的 items，或同时改热量和三大营养素）或 delete，引用下面的编号，不要重复新增。',
        '6. 说「昨天」「昨晚」dayOffset=-1，「前天」=-2，否则 0；修改和删除只针对下面列出的这天记录。',
        '7. 用户报自己的体重（「体重62.5」「今天称了124斤」「早上61公斤」）：bodyWeight 填公斤数（斤÷2；没说单位就参考下面的最近体重判断是斤还是公斤）。没说体重就填 null。训练用的重量不是体重。',
        '8. 用户让你记住某样东西的热量（「记住，糯米鸡一个350大卡」），或念了包装上的营养数：在 remember 里写一份的量 {"name","amount","grams","calories","proteinG","carbsG","fatG"}，补剂再加 "kind":"supplement" 和 nutrients。只是让你记住、没说吃了，就不要加进 meals。',
        '9. 听不懂或和饮食、训练、体重都无关：add 为空，reply 说明原因。'
      ].join('\n');

      const lines = [];
      lines.push(`现在时间 ${hh}:${mm}，正在看的日期：${day}。`);
      lines.push(records.length ? '这天已有记录：\n' + records.map(r => `${r.ref} ${r.text}`).join('\n') : '这天还没有记录。');
      if (recent.length) lines.push('最近成绩：' + recent.join('；'));
      if (ctx.lastWeight) lines.push(`最近体重：${ctx.lastWeight}kg`);
      const mine = (ctx.myFoods || []).slice(0, 40);
      if (mine.length) lines.push('记住的食物（用户确认过，优先用）：\n' + mine.map(f => MyFoods.line(f)).join('\n'));
      const cands = FoodDB.candidates(text, 18);
      if (cands.length) lines.push('参考营养数据（每100g可食部，只用于单一食材；来自中国食物成分表和常见菜品库）：\n' + cands.map(e => FoodDB.line(e)).join('\n'));
      const times = mealTimes(text);
      if (times.length > 1) lines.push(`注意：这句话说到了不同的时间（${times.map(t => `${t.word}→${t.type}`).join('、')}），不同时间吃的东西分成不同的 meal。`);
      lines.push('用户说：' + text);
      return [
        { role: 'system', content: system },
        { role: 'user', content: lines.join('\n') }
      ];
    },

    extractJson(content) {
      if (content && typeof content === 'object') return content;
      let s = String(content || '').trim();
      s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) s = fence[1].trim();
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a === -1 || b <= a) throw new Error('NO_JSON');
      return JSON.parse(s.slice(a, b + 1));
    },

    /** 从 chat/completions 的原始响应里拿出 message.content */
    contentFromResponse(raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const choice = data && data.choices && data.choices[0];
      const content = choice && (choice.message ? choice.message.content : choice.text);
      if (!content) throw new Error('EMPTY_RESPONSE');
      return content;
    },

    /**
     * 把大模型输出整理成可以直接存的记录；缺的参数用历史记录补，补不到用默认值。
     * @returns {{dayOffset:number, workouts:Array, meals:Array}}
     */
    normalize(parsed, ctx) {
      ctx = ctx || {};
      const history = ctx.history || [];
      const now = ctx.now || new Date();
      const out = { dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], remember: [], reply: '' };
      const myFoods = ctx.myFoods || [];
      const ground = (it) => groundItem(it, myFoods);
      // 兼容两种格式：{add:{workouts,meals}} 或顶层 workouts/meals
      if (parsed && parsed.add && typeof parsed.add === 'object') {
        parsed = Object.assign({}, parsed, {
          workouts: [].concat(parsed.workouts || [], parsed.add.workouts || []),
          meals: [].concat(parsed.meals || [], parsed.add.meals || [])
        });
      }
      out.reply = cleanText(parsed && parsed.reply, 40);
      const refs = new Set((ctx.dayRecords || []).map(r => r.ref));
      (Array.isArray(parsed && parsed.update) ? parsed.update : []).forEach(u => {
        if (!u || !refs.has(u.ref) || !u.set || typeof u.set !== 'object') return;
        const set = {};
        ['exerciseName', 'foodSummary', 'muscleGroup'].forEach(k => { if (u.set[k] != null) set[k] = cleanText(u.set[k], k === 'foodSummary' ? 60 : 30); });
        if (u.set.mealType != null && normMealType(u.set.mealType)) set.mealType = normMealType(u.set.mealType);
        ['weightKg', 'sets', 'reps', 'durationMin', 'burnedCalories', 'calories', 'proteinG', 'carbsG', 'fatG'].forEach(k => {
          const v = num(u.set[k]);
          if (v !== null && v >= 0) set[k] = k === 'weightKg' || /G$/.test(k) ? round1(v) : Math.round(v);
        });
        if (Array.isArray(u.set.items)) {
          const items = u.set.items.map(ground).filter(Boolean);
          if (items.length) Object.assign(set, sumItems(items), { items });
        }
        if (set.muscleGroup && !MUSCLES.includes(set.muscleGroup)) delete set.muscleGroup;
        if (Object.keys(set).length) out.updates.push({ ref: u.ref, set });
      });
      (Array.isArray(parsed && parsed.delete) ? parsed.delete : []).forEach(ref => { if (refs.has(ref)) out.deletes.push(ref); });

      (Array.isArray(parsed && parsed.remember) ? parsed.remember : []).slice(0, 5).forEach(r => {
        const f = MyFoods.clean(r);
        if (f) out.remember.push(f);
      });

      const bw = num(parsed && (parsed.bodyWeight != null ? parsed.bodyWeight : parsed.bodyWeightKg));
      if (bw !== null) {
        let kg = bw;
        // 模型把「124斤」当成公斤了：和上次体重比一下
        if (ctx.lastWeight && kg > ctx.lastWeight * 1.6 && Math.abs(kg / 2 - ctx.lastWeight) < ctx.lastWeight * 0.2) kg = kg / 2;
        kg = round1(kg);
        if (kg >= 25 && kg <= 300) out.bodyWeight = kg;
      }

      const off = num(parsed && parsed.dayOffset);
      if (off !== null && off <= 0 && off >= -7) out.dayOffset = Math.round(off);

      const lastOf = (name) => history.find(h => h.exerciseName === name && !h.durationMin);

      (Array.isArray(parsed && parsed.workouts) ? parsed.workouts : []).forEach(w => {
        const name = cleanText(w.exerciseName || w.name, 30);
        if (!name) return;
        let muscle = cleanText(w.muscleGroup, 6);
        if (!MUSCLES.includes(muscle)) muscle = guessMuscle(name);

        const duration = num(w.durationMin);
        let weight = num(w.weightKg);
        let sets = num(w.sets);
        let reps = num(w.reps);
        let estimated = w.estimated === true;

        if (duration && duration > 0 && !sets && !reps) {
          const burn = num(w.burnedCalories);
          out.workouts.push({
            exerciseName: name,
            muscleGroup: muscle,
            weightKg: 0,
            sets: 1,
            reps: 0,
            durationMin: Math.round(duration),
            burnedCalories: Math.round(burn && burn > 0 ? burn : duration * 8),
            estimated
          });
          return;
        }

        const last = lastOf(name);
        if (weight === null) { weight = last ? last.weightKg : 0; estimated = true; }
        if (!sets) { sets = last ? last.sets : 3; estimated = true; }
        if (!reps) { reps = last ? last.reps : 10; estimated = true; }
        weight = Math.max(0, round1(weight));
        sets = Math.max(1, Math.min(20, Math.round(sets)));
        reps = Math.max(1, Math.min(100, Math.round(reps)));

        let burn = num(w.burnedCalories);
        if (!burn || burn <= 0) {
          burn = sets * reps * (weight > 0 ? weight * 0.05 + 1.2 : 2.5);
        }
        out.workouts.push({
          exerciseName: name,
          muscleGroup: muscle,
          weightKg: weight,
          sets,
          reps,
          durationMin: null,
          burnedCalories: Math.round(burn),
          estimated
        });
      });

      (Array.isArray(parsed && parsed.meals) ? parsed.meals : []).forEach(m => {
        const items = (Array.isArray(m.items) ? m.items : []).map(ground).filter(Boolean);
        if (items.length) {
          const t = sumItems(items);
          m = Object.assign({}, m, t);
        }
        const summary = cleanText(m.foodSummary || m.name || items.map(i => i.name).join('、'), 60);
        const cal = num(m.calories);
        // 热量是 0 也记（钙片、水、黑咖啡），但得有具体的东西
        if (!summary || cal === null || cal < 0 || (cal === 0 && !items.length)) return;
        const type = normMealType(m.mealType) || mealTypeByHour(now.getHours());
        out.meals.push({
          mealType: type,
          foodSummary: summary,
          calories: Math.round(cal),
          proteinG: round1(Math.max(0, num(m.proteinG) || 0)),
          carbsG: round1(Math.max(0, num(m.carbsG) || 0)),
          fatG: round1(Math.max(0, num(m.fatG) || 0)),
          items
        });
      });
      const n = out.meals.length;
      out.meals = separateSupps(splitByTime(out.meals, ctx.said));
      // 拆开了：大模型那句「已记早餐…」就不对了
      if (out.meals.length !== n) out.reply = '分开记了' + [...new Set(out.meals.map(m => m.mealType.replace('/补剂', '')))].join('、');

      return out;
    },

    async viaLlm(text, ctx) {
      const override = readOverride();
      const base = {
        messages: this.buildMessages(text, ctx),
        temperature: 0.2,
        stream: false
      };
      if (override.model) base.model = override.model;

      // 关掉「先推理再回答」：Atria 实测 26 秒 → 3.6 秒，结果一样。
      // 换成不认这个参数的服务商时，自动去掉再试一次。
      const attempts = [Object.assign({ thinking: { type: 'disabled' } }, base), base];
      const waits = this.retryWaits || [3000, 8000]; // 限流 / 超时 / 网络断了：等一等再试，最多两次
      let lastErr;
      let retries = 0;
      for (let i = 0; i < attempts.length; i++) {
        try {
          const raw = await this.send(attempts[i], override);
          const parsed = this.extractJson(this.contentFromResponse(raw));
          return this.normalize(parsed, Object.assign({ said: text }, ctx));
        } catch (e) {
          lastErr = e;
          const msg = (e && e.message) || '';
          if (msg === 'NO_KEY') break;
          if (Parser.isTransient(msg) && retries < waits.length) {
            await new Promise(r => setTimeout(r, waits[retries++]));
            i -= 1; // 同一种请求再试
            continue;
          }
          if (!/^HTTP 4\d\d/.test(msg) || /^HTTP 429/.test(msg)) break; // 只有参数被拒才换下一种写法
        }
      }
      throw lastErr || new Error('LLM_FAILED');
    },

    async send(body, override) {
      if (Native.has()) return Native.chat(body, override);
      if (override.apiKey && override.baseUrl) {
        // 浏览器里调试：直接请求（部分服务商不允许跨域，会失败）
        const b = Object.assign({ model: 'gpt-4o-mini' }, body);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(override.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + override.apiKey },
            body: JSON.stringify(b),
            signal: ctrl.signal
          });
          const raw = await res.text();
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + raw.slice(0, 200));
          return raw;
        } finally {
          clearTimeout(t);
        }
      }
      throw new Error('NO_KEY');
    },

    /** 值得等一等再试的错误：限流、超时、网络、服务端 5xx */
    isTransient(msg) {
      return /^HTTP (429|5\d\d)/.test(msg) || /TIMEOUT|Timeout|timed out|IOException|UnknownHost|ConnectException|SocketException|SSL|Failed to fetch|NetworkError|abort/i.test(msg);
    },

    /** 大模型失败时的说明（给「没整理好」卡片用） */
    failReason(e) {
      const msg = (e && e.message) || '';
      if (msg === 'NO_KEY') return 'AI 接口没有配置 key';
      if (/^HTTP 429/.test(msg)) return 'AI 这会儿太忙（限流），点「重试」';
      if (/^HTTP 401|^HTTP 403/.test(msg)) return 'AI 接口的 key 不对';
      if (this.isTransient(msg)) return '网络不好，AI 没连上，点「重试」';
      return 'AI 没整理出来，点「重试」或「改字」';
    },

    /**
     * 只用大模型。以前失败时会退回本地规则，但规则会把「蛋白粉 700 毫升」这种话算得离谱还直接存，
     * 现在失败就留一张「没整理好」的卡片，让用户重试或改字。
     */
    async parse(text, ctx) {
      const r = await this.viaLlm(text, ctx);
      return Object.assign(r, { source: 'llm' });
    }
  };

  Object.assign(TF, { Parser });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
