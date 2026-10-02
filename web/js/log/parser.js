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
  const { MUSCLES, MEAL_TYPES, NUTRIENTS, num, cleanText, round1, mealTypeByHour, normMealType, mealTimes, mealSegments, findWeight, guessMuscle, saidWeight, readOverride, Native, FoodDB, MyFoods, groundItem, sizeOpts, sumItems } = TF;

  const summaryOf = (items) => cleanText(items.map(it => it.name + (it.amount || '')).join('、'), 60);

  /**
   * 回头改一餐里的某几样（「刚才那个牛奶是甜的，包装上写…」）：大模型只给改的那几样，按名字替换，其他原样保留。
   * 名字先找一模一样的，再找公共片段最长且唯一的（「甜牛奶」→ 原来的「鲜牛奶」）；对不上就当新加的一样。
   * @param old 原来的 items；patch 改后的几样（可带 was: 原名）；removes 要去掉的名字
   */
  function mergeItems(old, patch, removes) {
    const out = (old || []).slice();
    const norm = (s) => FoodDB.norm(s);
    const find = (name) => {
      const k = norm(name);
      const exact = out.findIndex(x => norm(x.name) === k);
      if (exact >= 0) return exact;
      let best = -1, len = 1, tie = false;
      out.forEach((x, i) => {
        const l = common(k, norm(x.name));
        if (l > len) { best = i; len = l; tie = false; } else if (l === len && best >= 0) tie = true;
      });
      return tie ? -1 : best;
    };
    (removes || []).forEach(n => { const i = find(n); if (i >= 0) out.splice(i, 1); });
    (patch || []).forEach(it => {
      const next = Object.assign({}, it);
      delete next.was;
      const i = find(it.was || it.name);
      if (i >= 0) out[i] = next; else out.push(next);
    });
    return out;
  }

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
  const GOALS = { fat_loss: '减脂', maintain: '保持体重', muscle_gain: '增肌' };

  /** 问问题时的回答：去掉 markdown 符号，最多 8 行、600 字 */
  function cleanAnswer(a) {
    // 大模型偶尔写成一行一项的数组，或者 {"早餐": "..."} 这样的对象（v4.0 用户问食谱「没反应」可能就是这个）
    if (Array.isArray(a)) a = a.map(x => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x).join('：') : '')).join('\n');
    else if (a && typeof a === 'object') a = Object.entries(a).map(([k, v]) => `${k}：${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
    if (typeof a !== 'string') return '';
    const lines = a.replace(/\r/g, '').split('\n')
      .map(l => l.replace(/\*\*/g, '').replace(/^\s*(#+|[-*•]|\d+[.、)])\s*/, '').trim())
      .filter(Boolean);
    return lines.slice(0, 8).join('\n').slice(0, 600);
  }

  /** 流式输出还没写完时，先把 "answer":"…" 里已经出来的字拿出来（边想边显示）；还没到 / 是 null 返回 '' */
  function partialAnswer(buf) {
    const m = /"answer"\s*:\s*"/.exec(buf || '');
    if (!m) return '';
    let out = '';
    for (let i = m.index + m[0].length; i < buf.length; i++) {
      const c = buf[i];
      if (c === '"') break;
      if (c !== '\\') { out += c; continue; }
      const n = buf[i + 1];
      if (n === undefined) break;
      if (n === 'u') { const h = buf.slice(i + 2, i + 6); if (h.length < 4) break; out += String.fromCharCode(parseInt(h, 16)); i += 5; continue; }
      out += n === 'n' ? '\n' : n === 't' ? ' ' : n;
      i += 1;
    }
    return out.replace(/\*\*/g, '').trim();
  }

  /**
   * 大模型偶尔写坏 JSON 的两种小毛病（v5.4 实测），修好再解析：
   *  - 字符串外面用了中文逗号、冒号（"next":["a","b"]，"plan":…）；
   *  - "next" 写成几个散的字符串（"next":"a","b"）→ "next":["a","b"]。
   */
  function repairJson(s) {
    let out = '', inStr = false, esc = false;
    for (const ch of String(s)) {
      if (inStr) {
        out += ch;
        if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      out += ch === '，' ? ',' : ch === '：' ? ':' : ch;
    }
    const STR = '"(?:[^"\\\\]|\\\\.)*"';
    return out.replace(new RegExp(`"next"\\s*:\\s*(${STR}(?:\\s*,\\s*${STR}(?!\\s*:))+)`, 'g'), '"next":[$1]');
  }

  /** 「记上了，一碗牛肉面加蛋，约750千卡、蛋白35g」→「记上了，一碗牛肉面加蛋」 */
  function dropNumberClauses(reply) {
    const parts = String(reply || '').match(/[^，,；;。]+[，,；;。]?|[，,；;。]/g) || [];
    return parts.filter(p => !/\d+(\.\d+)?\s*(千卡|大卡|kcal|卡)|蛋白(质)?\s*(约|大约)?\s*\d/i.test(p)).join('').replace(/[，,；;、\s]+$/, '');
  }

  // 说的是吃、练、身体的事（用来判断「帮不上」是不是答错了）
  const ABOUT_FIT = /练|训练|健身|动作|器械|深蹲|卧推|硬拉|腿|胸|背|肩|手臂|腹|核心|有氧|跑步|减脂|减肥|增肌|瘦|胖|体重|吃|喝|饭|餐|食|蛋白|热量|卡|碳水|脂肪|饿|饱|睡|酸|累|恢复/;

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
        // 只写用得上的字段（v5.4）：Atria 一秒只写 17～20 个 token，以前每次都写一串 "answer":null,"next":[]…，白等两三秒。
        // dayOffset 每次都写：实测不写的话「昨晚吃了火锅」会漏掉 -1，记到今天。
        // 别的字段要写出形状（"next":["…","…"]）：只列名字时实测会写成 "next":"a","b"，JSON 写坏。
        // 例子里 add 后面还跟着 dayOffset，括号的写法和以前的例子一样（]}]},）
        '由你决定怎么改数据：新增、修改或删除。只输出一个 JSON 对象，不要 markdown，不要解释。reply 和 dayOffset 每次都写，别的字段只写用得上的（值是 null、空数组的不要写）。',
        '例 1（记吃的、练的）：{"reply":"一句短话说你做了什么，15字以内，不写热量数（下面会单独列出来）；估得比较粗的，30字以内说按什么估的",',
        ' "add":{"workouts":[{"exerciseName":"杠铃卧推","muscleGroup":"胸部","weightKg":80,"sets":4,"reps":8,"burnedCalories":110}],',
        '        "meals":[{"mealType":"早餐","foodSummary":"肉包2个","items":[{"name":"肉包","amount":"2个","grams":200,"whole":true,"calories":460,"proteinG":16,"carbsG":60,"fatG":16}]},',
        '                 {"mealType":"午餐","foodSummary":"番茄炒蛋盖饭1份","items":[{"name":"米饭","amount":"1碗","grams":200,"whole":false,"calories":232,"proteinG":5,"carbsG":52,"fatG":0.6},{"name":"番茄炒蛋","amount":"1份","grams":200,"whole":true,"calories":260,"proteinG":11,"carbsG":10,"fatG":19}]}]},',
        ' "dayOffset":0}',
        '例 2（改、删已有的记录）：{"reply":"改好了","update":[{"ref":"r2","set":{"weightKg":85}}],"delete":["r3"],"dayOffset":0}',
        '别的字段只在下面规则说要用时才写，都放在这一个 JSON 对象里："bodyWeight":62.5、"remember":[{…}]、"memo":["…"]、"forget":["…"]、"answer":"…"、"next":["…","…"]、"plan":{…}、"donePlans":["p1"]；add 里只有吃的就不写 workouts，只有练的就不写 meals。',
        '规则：',
        '1. muscleGroup 只能是：' + MUSCLES.join('、') + '；mealType 只能是：' + MEAL_TYPES.join('、') + '（怎么判断见第 4 条）。',
        '2. 重量换算成公斤（磅×0.45，斤×0.5），自重 weightKg=0。跑步、单车、跳绳、平板支撑等按时间算的填 durationMin（分钟），不写 sets、reps；只说了距离（「跑了5公里」）就按常见配速估分钟数。',
        '3. 用户没说的重量/组数/次数：优先用下面「最近成绩」里同一动作的数；没有就按常见训练估一个（别拿别的动作的重量套），并设 "estimated":true。同一动作请沿用最近成绩里的名字。',
        '   新手常常叫不出动作、器械的名字，只会描述（「坐着往前推的那个机器」「拉下来的那个」「夹胸的」「坐着蹬腿的」「躺着推杠铃」）：按描述记成最像的标准名字（坐姿推胸、高位下拉、蝴蝶机夹胸、腿举、杠铃卧推），reply 里顺便告诉他叫什么（「这个叫高位下拉，记上了」）。只说了「练了一个小时器械」「练了会儿」：记一项「力量训练」，填 durationMin。',
        '4. 饮食按餐分：用户说的时间决定是哪一餐——早上/早饭 → 早餐，中午/午饭 → 午餐，晚上/晚饭 → 晚餐，下午茶、练前练后、睡前、夜宵、零食 → 加餐/补剂；没说时间（「刚吃了」）按现在时间和食物判断。',
        '   一句话说了几个时间就拆成几条 meal（「早上A和B，晚上C」= 早餐 A+B 一条、晚餐 C 一条，不能都记到一餐里）；同一餐的东西合并成一条。foodSummary 写给用户看的菜名和份量。items 列出吃了的东西，每项写 name、amount（份量原话，如「1个」「1碗」「半份」）、grams（吃下去的熟重，可食部分）、whole，以及你估的 calories/proteinG/carbsG/fatG。',
        '   先把一样东西当整体估，不要随便拆成原料：成品、包装、门店和早餐店的东西（糯米鸡、饭团、粽子、包子、烧卖、三明治、汉堡、面包蛋糕、奶茶饮料、零食），一碗面、一份麻辣烫、一份炒菜，都作为一项，whole=true，按一个/一份的常见大小估热量，油已经算在里面，不要再单独加烹调油。',
        '   连锁店、品牌的东西（麦当劳、肯德基、汉堡王、必胜客、赛百味、星巴克、瑞幸、喜茶、蜜雪冰城、便利店、包装零食饮料…）：name 带上品牌（「汉堡王吉士汉堡」「瑞幸生椰拿铁」），按这家店官方公布的一份（一个、一杯、中份）的热量和蛋白质估，whole=true；套餐拆成每一样（汉堡、薯条、饮料）。不知道具体是哪一款，就按这家店同类的常见款估。',
        '   一顿说不清具体吃了哪些的（火锅、烧烤、烤肉、自助餐、麻辣烫、冒菜、串串、干锅、日料、聚餐、吃席）：按用户的描述拆成几项估——主要的肉（羊肉、肥牛、毛肚…，大概几盘或多少克）、蔬菜和豆制品、主食、蘸料（麻酱、香油碟热量很高）、锅底或汤里吸的油（牛油、红油锅比清汤、番茄锅多不少）；没说的按一个成年人一顿的中等量估。说了「吃了很多 / 吃撑了」按 1.5 倍左右，「没吃多少 / 吃了一点」按 0.6 倍左右。这种估得粗的，reply 用一句话说清楚按什么估的（如「按牛油锅、羊肉约300克估的，可以再补一句」）。',
        '   只有明显是几样东西拼起来的才分开写（盖饭 = 米饭 + 菜，套餐 = 主食 + 菜 + 饮料）。单独的米饭、馒头、鸡蛋、牛奶、水果这类单一食材 whole=false，name 尽量用下面「参考营养数据」里的名字，数值会按库重算。参考数据里的成品菜数值可以参考，但要按用户说的做法和份量自己判断。',
        '   克数都按熟的、吃下去的算：米饭一碗约 180g，盖饭和外卖套餐里的米饭约 250–300g，馒头一个约 100g，鸡蛋一个约 50g，牛奶一杯约 250g，糯米鸡一个约 150–200g，一份外卖约 400–600g。按「一个 / 一串 / 一块」的真实大小估，不要当成 100g：烤串一串的肉约 25–40g，烤白果一串约 6–8 颗、25g 左右，炸鸡一块（带骨）能吃的约 80–100g，一瓶牛奶 / 甜牛奶常见 200–250ml，一瓶饮料约 500ml，一罐可乐 330ml。',
        '   份量说得含糊、不同大小热量差得多的（「一瓶甜牛奶」不知道 250ml 还是 500ml，「一串烤白果」不知道几颗，「一块炸鸡」不知道是鸡腿还是鸡翅）：grams 按最常见的估，这一项再加 "opts":[["250ml",250],["500ml",500]]——2～3 个最常见的大小，每个是 [给用户看的几个字, 这一项的总克数]，几个字要说成谁都能想象出来的样子（「小碗」「大碗」「拳头大」「巴掌大一块」「一盘」「6颗」「500ml」），不要写克数，其中一个就是你估的。「一份炒菜」「一碗饭」这种也可以问；「几个」「一些」「一把」没说数的，按常见的估一个数，也给 opts（「2个」「4个」「6个」）。说了具体量的（克数、毫升、几颗）、「记住的食物」里有的、热量低的（蔬菜、水、茶）不要加；一句话最多 2 样加 opts。',
        '   例外：单独吃的肉、鱼、虾（鸡胸肉、牛肉、猪瘦肉、鱼肉、虾仁）grams 写生重，参考数据里这些是生肉的数——用户说的克数一般就是生重，直接用；没说就估这块肉生的时候多重（熟肉约为生重的七成）。即食鸡胸肉按包装克数。',
        '   蛋白质用户最在意，要估准：肉、蛋、奶、豆制品、蛋白粉按实际份量算（乳清蛋白粉一勺约 30g、含蛋白约 24g）；整份的菜里有多少肉就按多少肉估蛋白质，不要只按菜名套平均值。',
        '   补剂和药（维生素、钙、镁、锌、铁、鱼油、益生菌、肌酸、药片…，蛋白粉不算补剂）：每样一项，加 "kind":"supplement"，不管什么时间都放进 mealType 为 加餐/补剂 的那条 meal，和饭菜分开。calories 按实际（普通片剂、胶囊是 0，鱼油一粒约 9，软糖一粒约 10）。含这些营养素就写 nutrients（这一项的总量，只用这些名字和单位）：' + Object.keys(NUTRIENTS).map(k => `${k}(${NUTRIENTS[k].unit})`).join('、') + '。用户没说剂量就按常见的一片 / 一粒估（维生素D 1μg = 40IU）；复合维生素也按常见一粒写出主要几种（维生素C、维生素D、维生素A、锌、钙、镁…）。药和说不清成分的补剂可以不写 nutrients。例：{"mealType":"加餐/补剂","foodSummary":"鱼油2粒、维生素D1粒","items":[{"name":"鱼油","amount":"2粒","kind":"supplement","calories":18,"fatG":2,"nutrients":{"EPA+DHA":600}},{"name":"维生素D","amount":"1粒","kind":"supplement","calories":0,"nutrients":{"维生素D":10}}]}',
        '   水、黑咖啡、茶这类没有热量的也记，calories 写 0。',
        '   用户念了包装上的营养数（「包装上写每100克210大卡」「一包300大卡」），严格按用户给的数算，这一项加 "source":"label"。',
        '   item 的 name 要具体到用户说的那种（「甜牛奶」不要写成「牛奶」，「肉松面包」不要写成「面包」），改过的数会按这个名字记住。',
        '   下面「记住的食物」是用户确认过的数：说到同样的东西（同名或明显是同一样）就用那里的名字，数值按份数换算；只是相似的不要套用。burnedCalories 按常见强度估算。',
        '5. 用户说「记错了/改成/其实是/只吃了一半/删掉/不算」，或者回头补充某样东西（「刚才那个牛奶是甜的，包装上写每100毫升290千焦」「鸡蛋其实只吃了一个」），是在改已有记录：用 update 或 delete，引用下面的编号，不要重复新增。',
        '   接着补充刚记的那一顿（「火锅是羊肉的」「锅底是牛油的」「肉吃了三盘」「吃得挺多」「是汉堡王的」）也是改：按新的描述把那一条重估一遍，用 update 改，没说吃了新东西就不要新增。',
        '   记到了别的日子（「记错日子了」「挪到前一天」「这是昨天吃的」「放到后天」）：用 update，set 里写 "dayOffset":-1（相对正在看的这天，前一天 -1、后一天 1），整条挪过去，不要删了重新加。',
        '   update 的 set 里只写要改的字段。改一餐里的某几样：set.items 里只写这几样（写全 name、amount、grams 和数值），name 用下面记录里的原名，换了名字就加 "was":"原名"；没写到的会原样保留。去掉某一样写 {"name":"原名","remove":true}。整餐的量都变了（「只吃了一半」）就把每一样都写上。',
        '6. 说「昨天」「昨晚」dayOffset=-1，「前天」=-2，否则 0；修改和删除只针对下面列出的这天记录。',
        '7. 用户报自己的体重（「体重62.5」「今天称了124斤」「早上61公斤」）：bodyWeight 填公斤数（斤÷2；没说单位就参考下面的最近体重判断是斤还是公斤）。没说体重就不写。训练用的重量不是体重。',
        '8. 用户让你记住某样东西的热量（「记住，糯米鸡一个350大卡」），或念了包装上的营养数：在 remember 里写一份的量 {"name","amount","grams","calories","proteinG","carbsG","fatG"}，补剂再加 "kind":"supplement" 和 nutrients。只是让你记住、没说吃了，就不要加进 meals。',
        '9. 听不懂：不写 add，reply 说明原因。',
        '10. 用户在问问题、要建议（「明天吃什么」「给我定个明天的食谱」「今天还差多少蛋白」「练完吃啥好」「明天练什么」「我想练腿要怎么练」「深蹲怎么做」「一周练三次帮我排一下」「晚上还能吃点啥」「能不能吃火锅」），不是在报自己吃了练了什么：不要记（不写 add；同一句里也说了已经吃过、练过的，那部分照常记），在 answer 里回答。「我操」「卧槽」「妈的」这类是口头禅，不影响意思。问到以前的事（「上周练了几次」「这个月瘦了多少」「哪天吃得最多」「最近蛋白够不够」）就看下面「最近两周」，说到具体日期和数字。',
        '   回答要用下面「今天的情况」「小本本」「画像」「最近成绩」「记住的食物」，按这个人的目标、习惯和还剩的热量、还差的蛋白质来定，具体到吃什么、多少，大概多少千卡和蛋白质（训练就写动作、重量、组数）。用户说了要求（「训练强度大，碳水多点」「不想吃米饭」）就照着调。',
        '   写成几行短句，每行一件事（「早餐：两个鸡蛋＋一杯牛奶＋一个馒头，约450千卡、蛋白25g」），最多 8 行，不要 markdown 符号、不要客套话。reply 写一句「给了你明天的食谱」这样的话（又记又问就写「记了…，晚上吃啥看小人」），不要出现 answer 这个词。',
        '   回答了问题时，next 写两句用户接着最可能想问的话（每句 12 字以内，用用户的口吻，比如「晚上吃点啥能补蛋白」「给我排个练腿的」）；没回答问题就不写 next。',
        '   练什么、怎么练、动作怎么做、练哪儿、减脂增肌、饿不饿、睡眠恢复、身体酸痛，都算吃和练的事，要正经回答：练什么就给动作、重量、组数次数，小本本里是新手或者问怎么做的，每个动作带一句要点。只有天气、新闻、写作业这种完全无关的，answer 才写一句「这个我帮不上，我只管吃和练」。',
        '   answer 是某一天的具体安排（明天的食谱、今晚吃什么、明天练什么、我想练腿怎么练）时，同时写 plan：{"dayOffset":1,"meals":[和 add.meals 一样的格式],"workouts":[和 add.workouts 一样的格式，每个动作再加 "tip":"一句要点，16字以内"]}，dayOffset 相对正在看的日期（明天 1，今天 0，没说哪天就是今天），内容和 answer 一致；只是回答问题（还差多少蛋白、能不能吃）就不写 plan。',
        '   要排好几天的训练（「这周怎么练」「一周练三次帮我排一下」「给我一个新手计划」）：plan 写成 {"days":[{"dayOffset":1,"workouts":[…]},{"dayOffset":3,"workouts":[…]}]}，从明天开始排一周、练的日子之间隔开，每天 4～6 个动作，不排吃的；重量按最近成绩往上加一点，没练过的按新手能做的估。answer 每天一行，开头写那天的星期（按下面的日期对照，「周五 腿：深蹲 40kg 4×10、腿举…」）。',
        '   下面有「刚才给的计划」，用户说要改（「不要米饭换红薯」「蛋白再多点」「晚上少吃点」「深蹲换成腿举」），就按要求改好，重新写完整的 answer 和 plan（还是那天的，dayOffset 按日期对照算；没让改的照原样写上），不要记录，不能只回一句「改好了」。',
        '   下面有「这天的计划」，用户说照着吃了 / 练了（「早餐照计划吃了」「计划里的都练完了」）：把那几项 add 进来（份量照计划），donePlans 写它们的编号。',
        '11. 用户说了关于自己、以后一直有用的事（名字、在增肌还是减脂、健身新手、在练什么、不吃 / 过敏的东西、伤病、作息、口味）：写进 memo，每条一句话、12 字以内（「叫阿程」「健身新手」「不吃辣」「膝盖有旧伤」），下面「小本本」里已经有的不要重复；说要忘掉或者变了的（「现在能吃辣了」「膝盖好了」），一定把小本本里原来那句原样写进 forget。吃了什么、练了什么、今天的事不算。回答、估算、出计划时照顾到小本本里的事（不吃辣就别推荐辣的，膝盖有伤就别排深蹲跳）。',
        '输出前核对一遍：原话里说到的每样吃的、喝的、补剂（包括听错字的，比如"茶叶大"）都记上了，没多记、没漏记。'
      ].join('\n');

      const lines = [];
      lines.push(`现在时间 ${hh}:${mm}，正在看的日期：${day}。`);
      lines.push(records.length ? '这天已有记录：\n' + records.map(r => `${r.ref} ${r.text}`).join('\n') : '这天还没有记录。');
      if (recent.length) lines.push('最近成绩：' + recent.join('；'));
      if (ctx.lastWeight) lines.push(`最近体重：${ctx.lastWeight}kg`);
      const past = (ctx.past || []).slice(-14);
      if (past.length) lines.push('最近两周（日期 吃了多少千卡 蛋白g 练了什么 体重kg）：\n' + past.join('\n'));
      if (ctx.state) lines.push(`今天的状态：昨晚${ctx.state}（排训练时照顾到，没睡好就练轻点）。`);
      const memo = (ctx.memo || []).slice(0, 12);
      if (memo.length) lines.push('小本本（用户说过的自己的事）：' + memo.join('；'));
      const portrait = (ctx.portrait || []).slice(0, 7);
      if (portrait.length) lines.push('画像（手机按最近 4 周的记录算的）：' + portrait.join('；'));
      const plans = ctx.plans || [];
      if (plans.length) lines.push('这天的计划（还没做）：\n' + plans.map(p => `${p.ref} ${p.text}`).join('\n'));
      if (ctx.lastPlan) lines.push('刚才给的计划（用户可能要改）：\n' + ctx.lastPlan);
      // 点了「改一改」：明说这句是在改计划（v5.5，以前大模型常只回一句「计划改好了」，什么都没改）
      if (ctx.lastPlan && (ctx.editPlan || ctx._editAgain)) lines.push(`注意：这句是在改上面「刚才给的计划」。照用户说的改好，写出改完的完整 answer 和 plan，不要记录${ctx._editAgain ? '。上一次你只说了改好了、没给计划，这次一定要把改好的 plan 写出来' : ''}。`);
      // 没点按钮，刚给过计划、话像在改计划（「不要米饭，换成红薯」）、这天又没有记录可改：提醒一句，免得只回「改好了」再多问一次（实测不提醒 2/2 要多问一次，提醒了 3/3 一次就好）。
      // 这天有记录时不提醒：实测提醒了，「早上的鸡蛋改成三个」3/3 被当成改计划
      else if (ctx.lastPlan && ctx.maybeEditPlan && !records.length) lines.push('注意：这句是在改上面「刚才给的计划」（这天没有记录可改）：照他说的改好，写出改完的完整 answer 和 plan，不要记录。');
      if (ctx._again) lines.push('注意：这句是在问吃或练的事，要正经回答，不能说帮不上。');
      // 问「这周怎么练」时大模型自己算星期几会算错：把接下来一周是周几直接给它
      if (ctx.ask && /^\d{4}-\d{2}-\d{2}$/.test(ctx.date || '')) {
        const WK = '日一二三四五六';
        const at = (n) => { const d = new Date(ctx.date + 'T00:00:00'); d.setDate(d.getDate() + n); return d; };
        lines.push('日期对照（dayOffset：日期 星期）：' + [0, 1, 2, 3, 4, 5, 6, 7].map(n => { const d = at(n); return `${n}：${d.getMonth() + 1}月${d.getDate()}日 周${WK[d.getDay()]}`; }).join('，'));
      }
      const d = ctx.day;
      if (d) lines.push(`今天的情况：目标${GOALS[d.goal] || '减脂'}；热量预算 ${d.budget} 千卡（含训练消耗 ${d.burn}），已吃 ${d.intake}，还能吃 ${d.budget - d.intake}；蛋白质目标 ${d.proteinTarget}g，已吃 ${d.protein}g。`);
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

    /**
     * 跟小人聊天（v5.8）：用户在说心情、跟小人搭话（「今天好累」「你在干嘛」），不是在记录。
     * 小人用自己的性格接话：先接住情绪、说具体的（记得你的事）、有自己的想法，不拿「你不来我会难过」压人。
     * 每次还是一个新的短 prompt，只多带「刚才在聊」最多 3 轮（15 分钟内），不存聊天记录。
     * 回得短（40 字左右）：Atria 一秒只出 17～20 个字，短了才快；流式一边出一边显示。
     */
    chatMessages(text, ctx) {
      ctx = ctx || {};
      const b = ctx.buddy || {};
      const now = ctx.now || new Date();
      const WK = '日一二三四五六';
      const name = b.name || '小练';
      const system = [
        `你是「${name}」，住在「练食AI」里的像素小人${b.look ? `（${b.look}）` : ''}，每天陪用户记吃的、记练的。现在他在跟你聊天，不是在记录。`,
        b.facts && b.facts.length ? '你是谁（前后一致，别乱编新的大设定）：' + b.facts.join('；') + '。' : '',
        b.level ? `你们的关系：${b.level}（第 ${b.lv} 级，共 5 级）。${b.tone || ''}` : '',
        '怎么说话：',
        '1. 先接住他的情绪，再说事。听出没说出口的：「还行」「随便」「没事」可能是累了、不开心，可以轻轻问一句。',
        '2. 说具体的：用下面你知道的他的事（小本本、今天吃了练了啥、最近成绩、刚才聊的），像真的记得；别空泛地夸。只用下面给的事，他没说过、没记过的别编。',
        '   别每句都提热量、蛋白的数：他在说心情时先陪他；只有他问起，或者他要饿着、不吃饭时，才提一句数。',
        '3. 有自己的想法和一点小脾气：他要饿着减肥、熬夜、带伤硬练、贬低自己，你会直说不同意，嘴上可以硬，但语气是在乎他。',
        '4. 不拿「你不来我会难过」「你不…我就…」压他；鼓励他好好吃饭、睡觉、过自己的生活。',
        '5. 像朋友发消息：口语、短，一次 1～2 句、30 个字左右，最多 50 个字（写得短他才不用等）；最多问一个问题；不说教、不列清单，emoji 最多一个。',
        '6. 他说身体很不舒服、情绪很低落（不想活了、撑不住了），认真温和地接住，别开玩笑，劝他找信任的人聊聊，需要时去看医生或打心理援助热线。',
        '7. 他顺口问吃和练的事，简单答一两句；要具体计划就让他说「给我排…」。不知道的别编。',
        '只输出一个 JSON：{"answer":"你说的话","next":["他可能回的话","…"],"face":"开心"}',
        '- next：他接下来最可能回你的两句（用他的口吻，10 个字以内）。',
        '- face：你说这句时的表情，开心 / 害羞 / 担心 / 不服 / 得意 / 平静 选一个。',
        '- 他亲口说了关于自己、以后一直有用的事（名字、作息、职业、伤病、忌口），再加 "memo":["…"]（每条 12 字以内，小本本里有的不重复）；今天的事、你的推测都不记。'
      ].filter(Boolean).join('\n');
      const lines = [];
      lines.push(`现在 ${now.getMonth() + 1}月${now.getDate()}日 周${WK[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}。`);
      if (b.call) lines.push(`你叫他「${b.call}」。`);
      const memo = (ctx.memo || []).slice(0, 12);
      if (memo.length) lines.push('小本本（他说过的自己的事）：' + memo.join('；'));
      const portrait = (ctx.portrait || []).slice(0, 7);
      if (portrait.length) lines.push('画像（按最近 4 周的记录算的）：' + portrait.join('；'));
      const d = ctx.day;
      if (d) lines.push(`今天：吃了 ${d.intake} 千卡（预算 ${d.budget}），蛋白 ${d.protein}g / 目标 ${d.proteinTarget}g；目标${GOALS[d.goal] || '减脂'}。`);
      const today = (ctx.dayRecords || []).map(r => r.text.replace(/（.*$/, '')).slice(0, 8);
      lines.push(today.length ? '今天记了：' + today.join('；') : '今天还没记东西。');
      if (ctx.state) lines.push(`今天的状态：昨晚${ctx.state}。`);
      const recent = (ctx.recent || []).slice(0, 4);
      if (recent.length) lines.push('最近成绩：' + recent.join('；'));
      const past = (ctx.past || []).slice(-14);
      if (past.length) lines.push('最近两周（日期 吃了多少千卡 蛋白g 练了什么 体重kg）：\n' + past.join('\n'));
      const talk = (ctx.talk || []).slice(-3);
      if (talk.length) lines.push('刚才在聊：\n' + talk.map(x => `他：${x.q}\n你：${x.a}`).join('\n'));
      lines.push('他说：' + text);
      return [
        { role: 'system', content: system },
        { role: 'user', content: lines.join('\n') }
      ];
    },

    /** 聊天的回答：一段话、两句他可能回的、表情、小本本 */
    normalizeChat(parsed, ctx) {
      ctx = ctx || {};
      const answer = cleanAnswer(parsed && parsed.answer).slice(0, 160);
      const list = (k, n) => (Array.isArray(parsed && parsed[k]) ? parsed[k] : []).map(x => cleanText(x, n)).filter(Boolean);
      const FACES = ['开心', '害羞', '担心', '不服', '得意', '平静'];
      return {
        dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], bodyWeight: null, reply: '', remember: [],
        answer, chat: true,
        next: answer ? list('next', 16).map(x => x.replace(/[。.]$/, '')).filter(x => x.length >= 1).slice(0, 2) : [],
        face: FACES.includes(parsed && parsed.face) ? parsed.face : '',
        memo: list('memo', 24).slice(0, 3).filter(x => !(ctx.memo || []).includes(x)),
        forget: list('forget', 24).filter(x => (ctx.memo || []).includes(x))
      };
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
      const body = s.slice(a, b + 1);
      try { return JSON.parse(body); } catch (e) {
        // 小毛病本机修好，不用整份重发（重发要再等十几秒到一分钟，一份计划要一分钟）
        let fixed = repairJson(body);
        for (let i = 0; i < 3; i++) {
          try { return JSON.parse(fixed); } catch (e2) {
            // 多了一个右括号，对象提前收尾了，后面还跟着「,"dayOffset":0}」：把那个括号去掉接着读
            const at = Number((/position (\d+)/.exec(e2.message) || [])[1]);
            const head = at > 0 ? fixed.slice(0, at).replace(/\s+$/, '') : '';
            if (!head.endsWith('}') || !/^\s*,\s*"/.test(fixed.slice(at))) break;
            fixed = head.slice(0, -1) + fixed.slice(at);
          }
        }
        throw new Error('BAD_JSON ' + e.message);
      }
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
      const out = { dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], remember: [], memo: [], forget: [], reply: '' };
      const myFoods = ctx.myFoods || [];
      const ground = (it) => groundItem(it, myFoods);
      // 兼容两种格式：{add:{workouts,meals}} 或顶层 workouts/meals
      if (parsed && parsed.add && typeof parsed.add === 'object') {
        parsed = Object.assign({}, parsed, {
          workouts: [].concat(parsed.workouts || [], parsed.add.workouts || []),
          meals: [].concat(parsed.meals || [], parsed.add.meals || [])
        });
      }
      out.reply = cleanText(parsed && parsed.reply, 40).replace(/(看)?\s*answer/gi, '看小人');
      out.answer = cleanAnswer(parsed && parsed.answer);
      // 问天气这类，大模型偶尔把「这个我帮不上」写进 reply、answer 空着（v5.4 只写用得上的字段后见过）：照样当成回答
      if (!out.answer && /帮不上/.test(out.reply) && !(parsed && (parsed.add || parsed.workouts || parsed.meals || parsed.update || parsed.delete))) out.answer = out.reply;
      // 「接着问」：两句短问题，点了就跟说出来一样
      out.next = out.answer && Array.isArray(parsed.next) ? parsed.next.map(x => cleanText(x, 16).replace(/[。.]$/, '')).filter(x => x && x.length >= 3).slice(0, 2) : [];
      // 计划（明天的食谱 / 训练）：和记录一样整理、按库算热量，但不存成记录
      // 排一周的训练（「一周练三次帮我排一下」）：plan.days 是几天的，每天一份；只有一天的照旧 plan.dayOffset / meals / workouts
      const pl = parsed && parsed.plan;
      if (out.answer && pl && typeof pl === 'object' && !ctx._inPlan) {
        const seen = new Set();
        const days = (Array.isArray(pl.days) && pl.days.length ? pl.days : [pl]).slice(0, 7).map(d => {
          if (!d || typeof d !== 'object') return null;
          const r = this.normalize({ add: { meals: Array.isArray(d.meals) ? d.meals : [], workouts: Array.isArray(d.workouts) ? d.workouts : [] } },
            Object.assign({}, ctx, { said: '', _inPlan: true }));
          const off = Math.max(-7, Math.min(7, Math.round(num(d.dayOffset) || 0)));
          if ((!r.meals.length && !r.workouts.length) || seen.has(off)) return null;
          seen.add(off);
          return { dayOffset: off, meals: r.meals, workouts: r.workouts };
        }).filter(Boolean).sort((a, b) => a.dayOffset - b.dayOffset);
        if (days.length === 1) out.plan = days[0];
        else if (days.length > 1) out.plan = { days };
      }
      const known = new Set((ctx.plans || []).map(p => p.ref));
      out.donePlans = Array.isArray(parsed && parsed.donePlans) ? parsed.donePlans.filter(x => known.has(x)) : [];
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
          const removes = u.set.items.filter(it => it && it.remove).map(it => cleanText(it.name, 20)).filter(Boolean);
          const items = u.set.items.filter(it => it && !it.remove).map(raw => {
            const g = ground(raw);
            if (g && raw.was) g.was = cleanText(raw.was, 20);
            return g;
          }).filter(Boolean);
          // 改的是具体几样：合计由保存时合并出来的明细重算，大模型给的合计不用
          if (items.length || removes.length) {
            ['calories', 'proteinG', 'carbsG', 'fatG'].forEach(k => delete set[k]);
            set.items = items;
            if (removes.length) set.removeItems = removes;
          }
        }
        if (set.muscleGroup && !MUSCLES.includes(set.muscleGroup)) delete set.muscleGroup;
        // 挪到别的日子：相对正在看的这天几天（大模型偶尔直接写日期，也认）
        const mv = num(u.set.dayOffset);
        if (mv !== null && Math.round(mv) !== 0 && Math.abs(mv) <= 7) set.dayOffset = Math.round(mv);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(String(u.set.date || ''))) set.date = String(u.set.date);
        if (Object.keys(set).length) out.updates.push({ ref: u.ref, set });
      });
      (Array.isArray(parsed && parsed.delete) ? parsed.delete : []).forEach(ref => { if (refs.has(ref)) out.deletes.push(ref); });

      // 小本本：用户说的关于自己的事（名字、忌口、伤病…），一句一条
      const listOf = (k) => (Array.isArray(parsed && parsed[k]) ? parsed[k] : []).map(x => cleanText(x, 24)).filter(Boolean).slice(0, 5);
      out.memo = listOf('memo').filter(x => !(ctx.memo || []).includes(x));
      out.forget = listOf('forget').filter(x => (ctx.memo || []).includes(x));
      // 「现在能吃辣了」：大模型偶尔只加「能吃辣」、忘了划掉「不吃辣」，两句打架。只差一个「不」的，旧的划掉
      const core = (x) => x.replace(/^(我)?(现在|已经|又|也)?(能|可以|会|开始|爱)?/, '').replace(/了$/, '');
      const negCore = (x) => (/^(我)?(不|不能|不会|不爱|没法|别)/.test(x) ? x.replace(/^(我)?(不能|不会|不爱|没法|不|别)/, '').replace(/了$/, '') : null);
      out.memo.forEach(m => (ctx.memo || []).forEach(e => {
        if (out.forget.includes(e)) return;
        if ((negCore(e) && negCore(e) === core(m)) || (negCore(m) && negCore(m) === core(e))) out.forget.push(e);
      }));
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
        // 原话没说重量、这个数也不在原话里（「今天练了深蹲」记成上次的 100kg）：是估的。
        // 大模型常忘了写 estimated（v5.4 例子里不再列它），新手没说重量时小人要靠它问一句「用了多重？」
        if (!estimated && weight > 0 && ctx.said && !saidWeight(ctx.said) && !String(ctx.said).includes(String(weight))) estimated = true;
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
        // 计划里的动作：新手看得懂的一句要点（「膝盖跟脚尖一个方向」）
        const tip = ctx._inPlan ? cleanText(w.tip, 20) : '';
        if (tip) out.workouts[out.workouts.length - 1].tip = tip;
      });

      let asks = 0; // 一句话最多问 2 样的份量
      (Array.isArray(parsed && parsed.meals) ? parsed.meals : []).forEach(m => {
        const items = (Array.isArray(m.items) ? m.items : []).map(raw => {
          const g = ground(raw);
          const opts = g && !ctx._inPlan && asks < 2 ? sizeOpts(raw.opts, g) : null;
          if (opts) { g.opts = opts; asks += 1; }
          return g;
        }).filter(Boolean);
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
      // 兜底：说的是「挪到前一天」，大模型却只删了没加（实测 main 的提示词 8 次里 3 次这样，记录就没了）——不删，改成挪
      const said = String(ctx.said || '');
      if (out.deletes.length && !out.meals.length && !out.workouts.length && /挪|移到|放到|改到|弄到|搬到|记错(日子|天)/.test(said)) {
        const day = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
        const viewed = /^\d{4}-\d{2}-\d{2}$/.test(ctx.date || '') ? new Date(ctx.date + 'T00:00:00') : now;
        const to = /前一天|上一天/.test(said) ? day(viewed, -1) : /后一天|下一天/.test(said) ? day(viewed, 1)
          : /前天/.test(said) ? day(now, -2) : /昨天|昨晚/.test(said) ? day(now, -1) : /后天/.test(said) ? day(now, 2) : /明天/.test(said) ? day(now, 1) : '';
        const moved = out.deletes;
        out.deletes = [];
        if (to) moved.forEach(ref => { if (!out.updates.some(u => u.ref === ref)) out.updates.push({ ref, set: { date: to } }); });
        else out.reply = '没听清挪到哪天，再说一次，比如「挪到昨天」';
      }
      // 提示条第一行别带热量数：大模型写的是它自己估的，和下面按成分表校准后的对不上（实测「约750千卡」，校准后 696）。
      // 记了吃的、改了吃的时，带热量 / 蛋白数的那半句去掉，热量看下面那行
      if (out.meals.length || out.updates.length) out.reply = dropNumberClauses(out.reply);
      const n = out.meals.length;
      out.meals = separateSupps(splitByTime(out.meals, ctx.said));
      // 拆开了：大模型那句「已记早餐…」就不对了
      if (out.meals.length !== n) out.reply = '分开记了' + [...new Set(out.meals.map(m => m.mealType.replace('/补剂', '')))].join('、');

      return out;
    },

    async viaLlm(text, ctx, onDelta) {
      const override = readOverride();
      const chat = !!(ctx && ctx.chat);
      const base = {
        messages: chat ? this.chatMessages(text, ctx) : this.buildMessages(text, ctx),
        temperature: chat ? 0.7 : 0.2, // 聊天要有点变化，别每次一样的话；记录要稳
        stream: false
      };
      if (override.model) base.model = override.model;

      // 关掉「先推理再回答」：Atria 实测 26 秒 → 3.6 秒，结果一样。
      // 换成不认这个参数的服务商时，自动去掉再试一次。
      const attempts = [Object.assign({ thinking: { type: 'disabled' } }, base), base];
      const waits = this.retryWaits || [3000, 8000]; // 限流 / 超时 / 网络断了：等一等再试，最多两次
      let lastErr;
      let retries = 0;
      // 边想边出字：onDelta 拿到的是这一次请求到目前为止的全部文字（卡住重试时从头算，不和上一次的半截拼在一起）
      const deltaFor = () => { if (!onDelta) return null; let soFar = ''; return (chunk) => { soFar += chunk; onDelta(soFar); }; };
      for (let i = 0; i < attempts.length; i++) {
        try {
          const raw = await this.sendHedged(attempts[i], override, deltaFor());
          const parsed = this.extractJson(this.contentFromResponse(raw));
          return chat ? this.normalizeChat(parsed, ctx) : this.normalize(parsed, Object.assign({ said: text }, ctx));
        } catch (e) {
          lastErr = e;
          const msg = (e && e.message) || '';
          if (msg === 'NO_KEY') break;
          // 实测 Atria 偶尔回到一半就断了（JSON 不完整）：和超时一样，再发一次
          if ((Parser.isTransient(msg) || /^(NO_JSON|BAD_JSON)/.test(msg)) && retries < waits.length) {
            // 回到一半断了不是限流，马上再发；限流、超时、网络断了才等一等
            const ms = /^(NO_JSON|BAD_JSON)/.test(msg) ? 0 : waits[retries];
            retries += 1;
            await new Promise(r => setTimeout(r, ms));
            i -= 1; // 同一种请求再试
            continue;
          }
          if (!/^HTTP (400|422)/.test(msg)) break; // 只有参数被拒才换下一种写法（key 不对的 401 / 403 换了也没用，别多花一次）
        }
      }
      throw lastErr || new Error('LLM_FAILED');
    },

    /**
     * 大模型偶尔开口特别慢（v5.4 实测：多数 2～6 秒出第一个字，约四分之一要等 15～18 秒才出，和提示词长短无关）：
     * 7 秒还没出字就再发一份一样的，谁先出字用谁，另一份马上掐掉（还在排队就掐，不白花 token）。
     * 第一份很快就失败的不补发，照原来的重试；服务商不支持流式（一直不出字）的，谁先回来用谁。
     */
    sendHedged(body, override, onDelta) {
      const wait = this.hedgeMs == null ? 7000 : this.hedgeMs;
      return new Promise((resolve, reject) => {
        let done = false, running = 0, timer = null, leader = null;
        const all = [];
        const stop = (keep) => all.forEach(h => { if (h !== keep && h.cancel && !h.stopped) { h.stopped = true; try { h.cancel(); } catch (e) {} } });
        const finish = (fn, v, from) => { if (done) return; done = true; clearTimeout(timer); stop(from); fn(v); };
        const go = () => {
          running += 1;
          const me = {};
          all.push(me);
          // 只转发先出字的那一份；出了字就不再补发，别的那份掐掉
          const delta = (chunk) => {
            if (done) return;
            if (leader === null) { leader = me; clearTimeout(timer); stop(me); }
            if (leader === me && onDelta) onDelta(chunk);
          };
          this.send(body, override, delta, me).then(
            r => { if (leader === null || leader === me) finish(resolve, r, me); },
            e => { running -= 1; if (leader === me || (leader === null && !running)) finish(reject, e, me); });
        };
        go();
        if (wait > 0) timer = setTimeout(() => { if (!done && leader === null) go(); }, wait);
      });
    },

    /** handle：传进来的对象会挂上 cancel()，补发的那份先出了字就用它掐掉这份 */
    async send(body, override, onDelta, handle) {
      if (Native.has()) return Native.chat(body, override, null, onDelta, handle);
      if (override.apiKey && override.baseUrl) {
        // 浏览器里调试：直接请求（部分服务商不允许跨域，会失败）
        const b = Object.assign({ model: 'gpt-4o-mini' }, body);
        const ctrl = new AbortController();
        if (handle) handle.cancel = () => ctrl.abort();
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
      if (/^TOO_LONG/.test(msg)) return 'AI 卡住了，没整理出来';
      if (/TIMEOUT|timed out|Timeout/i.test(msg)) return 'AI 太慢了，没等到结果';
      if (this.isTransient(msg)) return '网络不好，AI 没连上，点「重试」';
      return 'AI 没整理出来，点「重试」或「改字」';
    },

    /**
     * 只用大模型。以前失败时会退回本地规则，但规则会把「蛋白粉 700 毫升」这种话算得离谱还直接存，
     * 现在失败就留一张「没整理好」的卡片，让用户重试或改字。
     */
    async parse(text, ctx, onDelta) {
      let r = await this.viaLlm(text, ctx, onDelta);
      if (ctx && ctx.chat) return Object.assign(r, { source: 'llm' });
      // 明明在问练、吃的事，大模型却说「帮不上」（实测「我操，我想练腿要怎么练」）：提醒一句再问一次
      if (r.answer && /帮不上/.test(r.answer) && ABOUT_FIT.test(text) && !(ctx && ctx._again)) {
        r = await this.viaLlm(text, Object.assign({}, ctx, { _again: true }), onDelta);
      }
      // 在改刚给的计划，大模型却只回了一句「计划改好了」、没给计划（实测 main 的提示词 3/3 这样）：说清楚再问一次
      const nothing = !r.plan && !r.meals.length && !r.workouts.length && !r.updates.length && !r.deletes.length && !r.bodyWeight;
      if (ctx && ctx.lastPlan && !ctx._editAgain && nothing && (ctx.editPlan || (!r.answer && TF.looksLikePlanEdit && TF.looksLikePlanEdit(text)))) {
        r = await this.viaLlm(text, Object.assign({}, ctx, { _editAgain: true }), onDelta);
      }
      return Object.assign(r, { source: 'llm' });
    }
  };

  Object.assign(TF, { partialAnswer, Parser, mergeItems, repairJson, dropNumberClauses });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
