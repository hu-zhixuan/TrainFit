/**
 * 食物图鉴（v6.1，用户发了「易减」小程序「减脂食物大全」的截图：「能不能做个图鉴，集成到小人的入口，
 * 让用户自主选择饮食安排，小人在旁边指导」）。
 *  - 从小人进：点小人的气泡里「食物图鉴」、饭前小人推荐时「我自己挑」、小人问「吃了吗」时「点图片选」。不加栏目、不加页面，是一张底部面板。
 *  - 五栏：碳水 / 蛋白质 / 蔬菜 / 脂肪 / 外卖，每栏分几组（更耐饿、看份量、少量吃…），每样写每 100 克多少千卡。
 *    数都从本机食物库（中国食物成分表 + USDA + 成品菜库）现查，图鉴自己不存营养数；吃过的点亮一个勾（收集感）。
 *  - 点一样看详情：每 100 克的热量、蛋白、碳水、脂肪，一份大概多少，数据来源，小人的一句话；「放进这顿」「只吃了这个，记上」。
 *  - 底下「搭一顿」：今天 / 明天的哪一顿，放进来的每样能加减份数；小人看着这顿实时说（蛋白够不够、热量多不多、
 *    有没有菜、甜的少吃），能一键补上它建议的那样；搭好了「加到计划」（今天页的虚线计划行）或「吃了，记上」（直接变成记录）。
 * v6.2（用户：「抓取已有的方案，用实物 icon，入口还是在小人这里，增进小人的交互」）：
 *  - 每样一张实拍照片（scripts/build-food-img.py 生成，开放授权，「照片来源」里列作者），没有照片的还用 emoji / 第一个字。
 *  - 小人在图鉴里站着陪你挑：打开时按今天还差多少蛋白、还能吃多少推荐两三样（点一下放进来）；点到它爱吃的会害羞，
 *    少量吃的它嘴上说一句不拦你；放进来时照片飞进「搭一顿」、它蹦一下；能「喂它一口」；点它推荐你没吃过的；长按摸头；
 *    发呆一会儿它主动说一样你没吃过的。记录里点亮了新的一样（「图鉴点亮：鳕鱼 · 第 23 样」），到 5 / 10 / 20… 样它庆祝一下。
 *  - 搜一下：图鉴里没有的，一键「直接记」或「问它多少热量」（走平常那个按钮的流程）。
 * 都在本机算，不调大模型。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 每样：[显示名, 食物库里的名字, 图标（没有照片时用；没有合适的 emoji 就空着，显示名字的第一个字）, 一份几克, 一份怎么说, 小人的一句话]
  // tone：good 放心吃 / ok 看份量 / treat 少量吃。新加的往一组的最后加（id 是「栏.组.第几个」，代码里有用到）
  const TABS = [
    { key: 'carb', label: '碳水', sections: [
      { title: '高纤维，更耐饿', tone: 'good', items: [
        ['燕麦片', '燕麦片', '🥣', 40, '一小碗（干）', '用牛奶冲，蛋白也有了'],
        ['杂粮饭', '杂粮饭', '🍚', 180, '一碗', '比白米饭耐饿，升糖慢一点'],
        ['玉米', '玉米', '🌽', 180, '一根', ''],
        ['红薯', '甘薯', '🍠', 200, '一个', '当主食吃，就别再配米饭了'],
        ['贝贝南瓜', '贝贝南瓜', '🎃', 250, '一个', ''],
        ['土豆', '马铃薯', '🥔', 150, '一个', '当主食算，土豆丝配米饭等于两份主食'],
        ['山药', '山药', '', 150, '一段', ''],
        ['全麦面包', '全麦面包', '🍞', 70, '两片', '看配料表，第一个是全麦粉的才算'],
        ['荞麦面', '荞麦面', '🍜', 80, '一把（干）', '']
      ] },
      { title: '日常主食，看份量', tone: 'ok', items: [
        ['米饭', '蒸米饭', '🍚', 180, '一碗', '减脂不用戒，一顿一拳头大就够'],
        ['馒头', '馒头', '', 100, '一个', ''],
        ['面条', '熟面条', '🍜', 250, '一碗', '多加个蛋、加点青菜'],
        ['水饺', '水饺', '🥟', 200, '十来个', ''],
        ['馄饨', '馄饨', '', 350, '一碗', ''],
        ['肉包', '鲜肉包', '', 90, '一个', ''],
        ['白粥', '粳米粥', '', 300, '一碗', '稀，饿得快，配个蛋'],
        ['手抓饼', '手抓饼', '', 180, '一个', '油不少，偶尔吃']
      ] },
      { title: '水果和加餐', tone: 'ok', items: [
        ['苹果', '苹果', '🍎', 200, '一个', ''],
        ['香蕉', '香蕉', '🍌', 120, '一根', '练前吃一根正好'],
        ['橙子', '橙', '🍊', 200, '一个', ''],
        ['梨', '梨', '🍐', 200, '一个', ''],
        ['草莓', '草莓', '🍓', 150, '一小盒', ''],
        ['猕猴桃', '中华猕猴桃', '🥝', 100, '一个', ''],
        ['西瓜', '西瓜', '🍉', 300, '一大块', '水多，但一次别抱半个'],
        ['葡萄', '葡萄', '🍇', 150, '一小串', ''],
        ['芒果', '芒果', '🥭', 200, '一个', ''],
        ['樱桃', '樱桃', '🍒', 100, '一小把', ''],
        ['榴莲', '榴莲', '', 100, '两块', '热量高，吃了就当半顿主食'],
        ['柚子', '柚', '', 200, '两三瓣', '水多、热量低，一次两三瓣']
      ] },
      { title: '甜饮点心，少量吃', tone: 'treat', items: [
        ['奶茶', '珍珠奶茶', '🧋', 500, '一杯', '一杯三百多千卡，馋了选少糖小杯'],
        ['可乐', '可乐', '🥤', 330, '一罐', '换零度的就没热量了'],
        ['生椰拿铁', '生椰拿铁', '☕', 400, '一杯', ''],
        ['油条', '油条', '', 70, '一根', '油炸的，偶尔一根'],
        ['葡萄干', '葡萄干', '', 30, '一小把', '糖很浓，一小把就行'],
        ['啤酒', '啤酒', '🍺', 500, '一瓶', '']
      ] }
    ] },
    { key: 'protein', label: '蛋白质', sections: [
      { title: '瘦肉禽类，蛋白主力', tone: 'good', items: [
        ['鸡胸肉', '鸡胸肉', '🍗', 150, '一块', '最省心的蛋白，一块三十多克'],
        ['瘦牛肉', '精瘦牛肉', '🥩', 150, '一份', '还有铁和锌'],
        ['猪里脊', '猪里脊', '🥓', 150, '一份', ''],
        ['鸡腿肉', '鸡腿(生)', '🍗', 150, '一个（去骨）', '去皮更瘦'],
        ['羊肉', '羊肉(生)', '', 150, '一份', ''],
        ['鸡爪', '鸡爪', '', 100, '三四个', '蛋白不少，脂肪也有']
      ] },
      { title: '鱼虾海鲜，高蛋白又低脂', tone: 'good', items: [
        ['虾仁', '鲜虾仁', '🦐', 150, '一份', ''],
        ['三文鱼', '三文鱼', '🐟', 150, '一块', '有好脂肪'],
        ['鳕鱼', '鳕鱼', '🐟', 150, '一块', ''],
        ['金枪鱼', '金枪鱼', '🐟', 100, '一罐（水浸）', ''],
        ['鱿鱼', '鱿鱼', '🦑', 150, '一份', ''],
        ['鲈鱼', '鲈鱼', '🐟', 200, '半条', ''],
        ['蛤蜊', '蛤蜊', '🐚', 200, '一盘', '']
      ] },
      { title: '蛋和奶', tone: 'good', items: [
        ['鸡蛋', '水煮蛋', '🥚', 50, '一个', '一个六克蛋白，早上来两个'],
        ['蛋白', '鸡蛋白', '🥚', 35, '一个蛋的', '只吃蛋白，几乎没脂肪'],
        ['牛奶', '鲜牛奶', '🥛', 250, '一盒', ''],
        ['脱脂牛奶', '脱脂牛奶', '🥛', 250, '一盒', '减脂期换这个'],
        ['酸奶', '酸奶', '', 150, '一杯', '选无糖的'],
        ['奶酪', '奶酪', '🧀', 20, '一片', ''],
        ['蛋白粉', '乳清蛋白粉', '', 30, '一勺', '一勺二十多克蛋白，肉吃不够的时候补'],
        ['希腊酸奶', '希腊酸奶', '', 150, '一杯', '蛋白是普通酸奶的三倍多，选无糖的']
      ] },
      { title: '豆制品', tone: 'good', items: [
        ['豆腐', '老豆腐', '', 150, '半盒', ''],
        ['豆浆', '豆浆', '', 300, '一杯', '无糖的'],
        ['毛豆', '毛豆', '', 100, '一小碗', ''],
        ['腐竹', '腐竹(干)', '', 30, '一小把（干）', '']
      ] }
    ] },
    { key: 'veg', label: '蔬菜', sections: [
      { title: '绿叶菜，放开吃', tone: 'good', items: [
        ['西兰花', '西兰花', '🥦', 200, '一盘', '饱腹，热量还低'],
        ['菠菜', '菠菜', '🥬', 200, '一盘', ''],
        ['生菜', '生菜', '🥬', 150, '一盘', ''],
        ['大白菜', '大白菜', '🥬', 200, '一盘', ''],
        ['油麦菜', '油麦菜', '🥬', 200, '一盘', ''],
        ['芹菜', '芹菜', '', 150, '一盘', '']
      ] },
      { title: '瓜茄菌菇', tone: 'good', items: [
        ['黄瓜', '黄瓜', '🥒', 150, '一根', '饿了啃一根'],
        ['番茄', '番茄', '🍅', 150, '一个', ''],
        ['茄子', '茄子', '🍆', 200, '一盘', '很吸油，蒸的比油焖的好'],
        ['西葫芦', '西葫芦', '', 200, '一盘', ''],
        ['冬瓜', '冬瓜', '', 200, '一碗', ''],
        ['香菇', '香菇', '🍄', 100, '一小碗', ''],
        ['金针菇', '金针菇', '🍄', 100, '一把', ''],
        ['海带', '海带', '', 100, '一小碗', '']
      ] },
      { title: '根茎豆角', tone: 'ok', items: [
        ['胡萝卜', '胡萝卜', '🥕', 100, '一根', ''],
        ['南瓜', '南瓜', '🎃', 200, '一块', ''],
        ['洋葱', '洋葱', '🧅', 100, '半个', ''],
        ['黄豆芽', '黄豆芽', '', 200, '一盘', ''],
        ['豆角', '豆角', '', 200, '一盘', '']
      ] }
    ] },
    { key: 'fat', label: '脂肪', sections: [
      { title: '好脂肪，一小把', tone: 'ok', items: [
        ['坚果', '坚果', '🥜', 30, '一小把', '一小把就够，一袋下去三百多千卡'],
        ['杏仁', '杏仁', '', 30, '一小把', ''],
        ['腰果', '腰果', '', 30, '一小把', ''],
        ['开心果', '开心果', '', 30, '一小把', ''],
        ['南瓜子', '南瓜子', '', 30, '一小把', ''],
        ['三文鱼', '三文鱼', '🐟', 150, '一块', '鱼油也是好脂肪'],
        ['牛油果', '鳄梨', '🥑', 70, '半个', '好脂肪，半个一百二十千卡左右']
      ] },
      { title: '油和黄油，看着放', tone: 'treat', items: [
        ['炒菜油', '烹调油', '🫗', 10, '一勺', '一勺九十千卡，外卖的油是看不见的大头'],
        ['橄榄油', '橄榄油', '', 10, '一勺', ''],
        ['黄油', '黄油', '🧈', 10, '一小块', '']
      ] },
      { title: '油多的菜，少量吃', tone: 'treat', items: [
        ['红烧肉', '红烧肉', '', 180, '一份', '一份六百多千卡'],
        ['回锅肉', '回锅肉', '', 220, '一份', ''],
        ['糖醋里脊', '糖醋里脊', '', 200, '一份', ''],
        ['炸鸡块', '炸鸡块', '🍗', 150, '一份', ''],
        ['汉堡', '汉堡', '🍔', 200, '一个', '']
      ] }
    ] },
    { key: 'out', label: '外卖', sections: [
      { title: '点外卖，这些更稳', tone: 'good', items: [
        ['番茄炒蛋', '番茄炒蛋', '🍅', 200, '一份', ''],
        ['蒜蓉西兰花', '蒜蓉西兰花', '🥦', 200, '一份', ''],
        ['麻婆豆腐', '麻婆豆腐', '', 250, '一份', ''],
        ['宫保鸡丁', '宫保鸡丁', '', 220, '一份', ''],
        ['水煮牛肉', '水煮牛肉', '🥩', 350, '一份', '肉多，汤别喝'],
        ['牛肉拉面', '兰州牛肉拉面', '🍜', 650, '一碗', '加份牛肉，面剩一点'],
        ['皮蛋瘦肉粥', '皮蛋瘦肉粥', '', 350, '一碗', ''],
        ['麻辣烫', '麻辣烫', '', 550, '一碗', '多选菜和肉，少放粉面，汤别喝']
      ] },
      { title: '好吃但热量高', tone: 'treat', items: [
        ['黄焖鸡米饭', '黄焖鸡米饭', '🍛', 600, '一份', '一份八百多千卡，饭吃一半'],
        ['麻辣香锅', '麻辣香锅', '', 450, '一份', ''],
        ['猪脚饭', '隆江猪脚饭', '', 480, '一份', ''],
        ['螺蛳粉', '柳州螺蛳粉', '', 600, '一碗', ''],
        ['鱼香肉丝', '鱼香肉丝', '', 220, '一份', ''],
        ['地三鲜', '地三鲜', '', 220, '一份', '茄子土豆都吸油'],
        ['沙县拌面', '沙县拌面', '', 220, '一份', '']
      ] }
    ] }
  ];
  const TONE = { good: '放心吃', ok: '看份量', treat: '少量吃' };
  // 每 100 克的数从哪来（详情里写一行）
  const SOURCE = { cfct: '中国食物成分表（第6版）', usda: 'USDA 食物数据库', food: '常见做法整理', dish: '常见做法整理' };

  /** 所有条目（带上属于哪一栏、哪一组），同一样出现两次的（三文鱼）各算一个 */
  function all() {
    const out = [];
    TABS.forEach(t => t.sections.forEach((s, si) => s.items.forEach((x, i) => out.push({
      id: `${t.key}.${si}.${i}`, tab: t.key, section: s.title, tone: s.tone,
      name: x[0], db: x[1], icon: x[2], grams: x[3], portion: x[4], tip: x[5]
    }))));
    return out;
  }
  let cache = null;
  const items = () => cache || (cache = all());
  const byId = (id) => items().find(x => x.id === id);
  const byName = (name) => items().find(x => x.name === name);

  /** 实拍照片的路径（scripts/build-food-img.py 生成，见 js/data/food_img.js）；没有返回空 */
  function img(item) {
    const x = item && TF.FOOD_IMG && TF.FOOD_IMG[item.name];
    return x ? `img/food/${x[0]}.webp` : '';
  }

  /** 每 100 克（从食物库现查）：{k, p, c, f, src, name}；库里没有返回 null */
  function per100(item) {
    const e = TF.FoodDB && TF.FoodDB.find(item.db);
    return e ? { k: e.k, p: e.p, c: e.c, f: e.f, src: e.src, name: e.name } : null;
  }

  /** n 份的营养（一份 = item.grams 克） */
  function portion(item, n) {
    const e = per100(item);
    const g = Math.round(item.grams * n);
    const r = (x) => Math.round(x * g / 10) / 10;
    return { grams: g, calories: Math.round(e.k * g / 100), proteinG: r(e.p), carbsG: r(e.c), fatG: r(e.f) };
  }

  /** 份数说出来：「1 个」「半碗」「2 份」；一份本来就是「半个」的（牛油果），一份就说「半个」 */
  function amountText(item, n) {
    if (n === 1 && /^半[个根块碗盒杯]$/.test(item.portion)) return item.portion;
    // 「一个」「一小碗（干）」「半盒」按这个量词说；「十来个」「两片」这种一份不止一个的，说「份」
    const unit = /^一/.test(item.portion) ? (item.portion.match(/[个碗根块份盒杯片勺把串罐瓶段盘条]/) || ['份'])[0] : '份';
    if (n === 0.5) return '半' + unit;
    return `${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;
  }

  /** 这顿加起来 */
  function totals(tray) {
    return tray.reduce((t, x) => {
      const p = portion(byId(x.id), x.n);
      return { calories: t.calories + p.calories, proteinG: Math.round((t.proteinG + p.proteinG) * 10) / 10,
        carbsG: Math.round((t.carbsG + p.carbsG) * 10) / 10, fatG: Math.round((t.fatG + p.fatG) * 10) / 10 };
    }, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  }

  // 一顿占一天预算的大概比例
  const MEAL_SHARE = { 早餐: 0.28, 午餐: 0.36, 晚餐: 0.3, '加餐/补剂': 0.12 };

  /**
   * 小人看着这顿说一句（按先后：太多了 → 甜的油的少量吃 → 蛋白不够 → 没有菜 → 搭得好）。
   * ctx：{ meal, budget（这天的热量预算）, eaten（这天已经吃了的，不含这顿）, proteinTarget, simple（只记吃的，不提蛋白） }
   * 返回 { text, add: 建议补上的那样的 id, good: 搭得好 }
   */
  function advice(tray, ctx) {
    ctx = ctx || {};
    const meal = ctx.meal || '午餐';
    const main = meal !== '加餐/补剂';
    if (!tray.length) return { text: `${meal.replace('/补剂', '')}想吃点什么？点一样放进来，我帮你看着。` };
    const list = tray.map(x => Object.assign({ n: x.n }, byId(x.id)));
    const t = totals(tray);
    const treat = list.find(x => x.tone === 'treat');
    const has = (tab) => list.some(x => x.tab === tab);
    const pick = (ids) => ids.find(id => !tray.some(x => x.id === id));
    const share = MEAL_SHARE[meal] || 0.3;
    const room = ctx.budget > 0 ? Math.max(0, ctx.budget - (ctx.eaten || 0)) : 0;
    const cap = ctx.budget > 0 ? Math.max(ctx.budget * share, Math.min(room, ctx.budget * share * 1.3)) : 0;
    if (cap > 0 && t.calories > cap * 1.3) {
      const carb = list.filter(x => x.tab === 'carb').sort((a, b) => portion(b, b.n).calories - portion(a, a.n).calories)[0];
      return { text: `这顿 ${t.calories} 千卡，有点多了${carb ? `，${carb.name}少一点` : ''}。` };
    }
    if (treat) return { text: `${treat.name}${treat.tip ? '：' + treat.tip : '少量吃哦'}。真想吃就吃，别的清淡点。` };
    if (!ctx.simple && main && t.proteinG < 20) {
      const add = pick(['protein.2.0', 'protein.0.0', 'protein.3.0', 'protein.1.0']);
      const a = add && byId(add);
      return { text: `蛋白才 ${Math.round(t.proteinG)}g，${a ? `加个${a.name}？` : '再加点肉蛋奶？'}`, add };
    }
    if (main && meal !== '早餐' && !has('veg') && !list.some(x => /菜|西兰花|番茄|黄瓜/.test(x.name))) {
      const add = pick(['veg.0.0', 'veg.1.1', 'veg.1.0']);
      return { text: '加份绿叶菜？饱腹，热量还低。', add };
    }
    if (main && !has('carb') && !list.some(x => x.tab === 'out' && /面|饭|粥/.test(x.name)) && meal !== '晚餐') {
      return { text: `有肉有菜，再来点主食更扛饿（${meal === '早餐' ? '燕麦、全麦面包' : '半碗杂粮饭'}）。`, add: pick(meal === '早餐' ? ['carb.0.0', 'carb.0.7'] : ['carb.0.1', 'carb.1.0']), good: true };
    }
    return { text: `这顿搭得好：${t.calories} 千卡${ctx.simple ? '' : `，蛋白 ${Math.round(t.proteinG)}g`}。`, good: true };
  }

  /**
   * 刚打开、这顿还空着：小人按这天的情况说一句、推荐两三样（点一下放进来）。吃过的优先（它认识你）。
   * ctx：{ meal, today（看的是今天）, budget, eaten, protein（今天已吃的蛋白）, proteinTarget, simple, eatenIds: Set }
   * 返回 { text, adds: [id…] }
   */
  function opening(ctx) {
    ctx = ctx || {};
    const meal = ctx.meal || '午餐';
    const label = { 早餐: '早饭', 午餐: '午饭', 晚餐: '晚饭' }[meal] || '加餐';
    const fam = ctx.eatenIds || new Set();
    const one = (ids) => ids.find(id => fam.has(id)) || ids[0];
    const some = (ids, n) => ids.filter(id => fam.has(id)).concat(ids.filter(id => !fam.has(id))).slice(0, n);
    const room = ctx.today && ctx.budget > 0 ? Math.round(ctx.budget - (ctx.eaten || 0)) : null;
    const gap = ctx.today && !ctx.simple && ctx.proteinTarget > 0 ? Math.round(ctx.proteinTarget - (ctx.protein || 0)) : 0;
    if (meal === '加餐/补剂') {
      return { text: room != null && room < 150 ? '今天快吃满了，加餐挑点热量低的：' : '加餐来点水果、酸奶，或者一小把坚果？', adds: some(['carb.2.0', 'protein.2.4', 'carb.2.4', 'veg.1.0', 'fat.0.0'], 3) };
    }
    if (meal === '早餐') {
      return { text: `${label}一个主食、一个蛋、一杯奶${gap >= 40 ? `，今天蛋白还差 ${gap}g，蛋来两个` : '就很好'}。`,
        adds: [one(['carb.0.0', 'carb.0.7', 'carb.1.5', 'carb.0.3']), 'protein.2.0', one(['protein.2.2', 'protein.3.1', 'protein.2.4'])] };
    }
    if (room != null && room < 350) {
      return { text: `今天只剩 ${Math.max(0, room)} 千卡了，${label}肉和菜多一点、主食少一点：`, adds: [one(['veg.0.0', 'veg.0.1', 'veg.1.0']), one(['protein.1.0', 'protein.1.2', 'protein.0.0']), one(['protein.3.0', 'veg.1.5'])] };
    }
    if (gap >= 25) return { text: `蛋白还差 ${gap}g，${label}先挑一样肉蛋？`, adds: some(['protein.0.0', 'protein.0.1', 'protein.1.0', 'protein.2.0', 'protein.3.0', 'protein.1.1'], 3) };
    return { text: `${label}想吃点什么？一样肉、一样主食、一样菜，点一下就放进来，我帮你看着。`,
      adds: [one(['protein.0.0', 'protein.0.1', 'protein.1.0', 'protein.0.2']), one(['carb.0.1', 'carb.1.0', 'carb.0.3', 'carb.1.2']), one(['veg.0.0', 'veg.0.1', 'veg.1.1'])] };
  }

  /** 搜一下：名字、库里的名字和别名里有这几个字，或者说的话里有它的名字（「一个苹果」）。同名的只留一个 */
  function search(q) {
    const k = String(q || '').replace(/\s+/g, '').toLowerCase();
    if (!k) return [];
    const seen = new Set();
    return items().filter(it => {
      if (seen.has(it.name)) return false;
      const e = TF.FoodDB && TF.FoodDB.find(it.db);
      const keys = [it.name, it.db.replace(/\(.*$/, '')].concat(e ? e.aliases : []);
      const hit = keys.some(x => x && (x.toLowerCase().includes(k) || (x.length >= 2 && k.includes(x.toLowerCase()))));
      if (hit) seen.add(it.name);
      return hit;
    });
  }

  // 点亮多少样时小人庆祝一下
  const MILESTONES = [5, 10, 20, 30, 50, 75, 100];
  /** 从 a 样点亮到 b 样，跨过了哪一档（最大的那个；没有是 0） */
  function milestone(a, b) { return MILESTONES.filter(m => a < m && b >= m).pop() || 0; }

  /** 小人推荐一样你没吃过的（放心吃的里挑，这一栏的优先）；都吃过了返回 null */
  function discover(eaten, tab, seed) {
    const pool = items().filter(x => x.tone === 'good' && !(eaten && eaten.has(x.id)));
    const inTab = tab ? pool.filter(x => x.tab === tab) : [];
    const list = inTab.length ? inTab : pool;
    if (!list.length) return null;
    const s = seed == null ? Math.floor(Math.random() * 1e6) : Math.abs(seed | 0);
    return list[s % list.length];
  }

  /** 这顿 → 一条饮食（计划行或记录用的字段） */
  function toMeal(tray, mealType) {
    const its = tray.map(x => {
      const it = byId(x.id);
      const p = portion(it, x.n);
      const e = TF.FoodDB.find(it.db);
      return Object.assign({ name: it.name, amount: amountText(it, x.n), source: TF.FoodDB.label(e) }, p);
    });
    const t = totals(tray);
    return Object.assign({ mealType, foodSummary: its.map(x => x.name + x.amount).join('、').slice(0, 60), items: its }, t);
  }

  /** 吃过的（记录里出现过这个名字或食物库的名字 / 别名）→ id 的集合 */
  function eatenIds(diet) {
    const names = new Set();
    (diet || []).forEach(d => {
      (d.items || []).forEach(i => names.add(String(i.name || '').replace(/[\s(（].*$/, '')));
      String(d.foodSummary || '').split(/[、，,+＋]/).forEach(s => names.add(s.replace(/[\d一两二三四五六七八九十半]+.*$/, '').trim()));
    });
    const out = new Set();
    items().forEach(it => {
      const e = TF.FoodDB && TF.FoodDB.find(it.db);
      const keys = [it.name, it.db.replace(/\(.*$/, '')].concat(e ? e.aliases : []);
      if (keys.some(k => k && names.has(k))) out.add(it.id);
    });
    return out;
  }

  /** 今天的考题：随便挑一样常见的，问一份多少千卡，三个选项（对的、少一截、多一截） */
  function quiz(seed) {
    const pool = items().filter(x => x.tone !== 'good' || x.tab === 'carb' || x.tab === 'protein');
    const it = pool[Math.abs(seed | 0) % pool.length];
    const right = portion(it, 1).calories;
    const round = (x) => (x >= 100 ? Math.round(x / 10) * 10 : Math.round(x / 5) * 5);
    const opts = [...new Set([round(right * 0.55), right, round(right * 1.7)])].filter(x => x > 0).sort((a, b) => a - b);
    // 对的那个别老在中间：按种子转一转
    const k = Math.abs(seed | 0) % opts.length;
    opts.push(...opts.splice(0, k));
    return { id: it.id, name: it.name, portion: it.portion, right, opts };
  }

  TF.Dex = { TABS, TONE, SOURCE, MILESTONES, items, byId, byName, img, per100, portion, amountText, totals, advice, opening, search, milestone, discover, toMeal, eatenIds, quiz };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Dex;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 下一顿：按现在的钟点，过了晚饭就是明天早餐 */
  dexNextMeal() {
    const h = new Date().getHours();
    const today = getTodayDateString();
    if (h < 9) return { date: today, meal: '早餐' };
    if (h < 13) return { date: today, meal: '午餐' };
    if (h < 19) return { date: today, meal: '晚餐' };
    return { date: shiftDateString(today, 1), meal: '早餐' };
  },

  /** 一样食物的图：实拍照片（懒加载），没有照片就 emoji / 名字的第一个字。size：'' / big / sm / xs */
  dexIcon(it, size) {
    if (!it) return '';
    const src = TF.Dex.img(it);
    const inner = src ? `<img src="${src}" alt="" loading="lazy" decoding="async" draggable="false">` : it.icon ? it.icon : `<b>${esc(it.name.slice(0, 1))}</b>`;
    return `<span class="dex-icon tone-${it.tone}${size ? ' ' + size : ''}${src ? ' photo' : ''}">${inner}</span>`;
  },

  /** 小人气泡里的一排照片（饭前帮你挑的、考题、点亮的新食物）：names 是图鉴里的名字 */
  dexPicsHtml(names) {
    const list = (names || []).map(n => TF.Dex.byName(n)).filter(Boolean).slice(0, 4);
    if (!list.length) return '';
    return `<div class="buddy-pics">${list.map(it => `<span class="buddy-pic">${this.dexIcon(it, 'sm')}<small>${esc(it.name)}</small></span>`).join('')}</div>`;
  },

  /** 点小人的气泡里那一行入口：三张最近吃过的照片 + 吃过几样 */
  dexEntryHtml() {
    const D = TF.Dex;
    const eaten = D.eatenIds(this.diet);
    const total = new Set(D.items().map(x => x.name)).size;
    const got = new Set(D.items().filter(x => eaten.has(x.id)).map(x => x.name));
    const pics = [];
    const recent = this.diet.slice().sort((a, b) => recordTs(b) - recordTs(a));
    for (const d of recent) {
      if (pics.length >= 3) break;
      const ids = D.eatenIds([d]);
      D.items().forEach(it => { if (ids.has(it.id) && !pics.includes(it.name) && pics.length < 3) pics.push(it.name); });
    }
    ['鸡胸肉', '西兰花', '米饭'].forEach(n => { if (pics.length < 3 && !pics.includes(n)) pics.push(n); });
    return `<button class="buddy-dex" type="button"><span class="buddy-dex-pics">${pics.map(n => this.dexIcon(D.byName(n), 'xs')).join('')}</span>` +
      `<span class="buddy-dex-text"><b>食物图鉴</b><small>${got.size ? `吃过 ${got.size}/${total} 样` : '点图片也能记'}</small></span>` +
      `<span class="buddy-dex-go" aria-hidden="true">›</span></button>`;
  },

  /**
   * 记录里点亮了几样图鉴里的（和上次比）。第一次用：先把现在吃过的记下来，不算新点亮（except 是这次刚记的那几条）。
   * 存在 profile.buddy.dexSeen（名字），跟着备份走。返回 { fresh: 新点亮的名字, got: 一共点亮几样 }
   */
  dexSync(exceptIds) {
    const D = TF.Dex;
    const nameSet = (diet) => { const ids = D.eatenIds(diet); return [...new Set(D.items().filter(x => ids.has(x.id)).map(x => x.name))]; };
    const names = nameSet(this.diet);
    this._dexEaten = D.eatenIds(this.diet);
    const seen = (this.profile.buddy || {}).dexSeen;
    if (!Array.isArray(seen)) {
      const ex = new Set(exceptIds || []);
      const base = ex.size ? nameSet(this.diet.filter(d => !ex.has(d.id))) : names;
      this.setBuddy({ dexSeen: base });
      return { fresh: names.filter(n => !base.includes(n)), got: names.length };
    }
    const fresh = names.filter(n => !seen.includes(n));
    if (fresh.length) this.setBuddy({ dexSeen: seen.concat(fresh) });
    return { fresh, got: names.length };
  },

  /** 记完一条（reactRecord 里先看这个）：点亮了图鉴里新的一样，小人举着照片说「图鉴点亮：鳕鱼 · 第 23 样」；到 5 / 10 / 20… 样庆祝 */
  dexUnlock(batch) {
    if (!this.buddyLook().show || this._touring || !batch) return false;
    const { fresh, got } = this.dexSync(batch.dietIds);
    if (!fresh.length) return false;
    const C = this.cast().dex;
    const b = this.profile.buddy || {};
    const mile = TF.Dex.milestone(Math.max(+b.dexMile || 0, got - fresh.length), got);
    if (mile) this.setBuddy({ dexMile: mile });
    const text = mile ? C.milestone.replace('{n}', mile) : C.unlock.replace('{food}', fresh.slice(0, 2).join('、')).replace('{n}', got);
    const pop = document.getElementById('buddy-pop');
    setTimeout(() => {
      if (!pop || !pop.classList.contains('hidden') || !document.getElementById('dex-overlay').classList.contains('hidden')) return;
      this.buddyQuip(text, { pics: fresh.slice(0, 3), ms: 3200 });
      this.buddyMood(mile ? 'great' : 'good', 2000);
      if (mile) { this.buddyBang('★'); if (this.bondGain) this.bondGain('note'); }
    }, 900);
    return true;
  },

  /**
   * 打开图鉴。opts：{ tab, meal, date, tray: [{id, n}], say, log（从「吃了吗」「点图片记」进来：主要是记这顿）, detail（直接看这一样） }
   */
  openDex(opts) {
    opts = opts || {};
    const next = this.dexNextMeal();
    const prev = this._dex;
    const detail = opts.detail && TF.Dex.byId(opts.detail) ? opts.detail : null;
    this._dex = {
      tab: opts.tab || (detail && TF.Dex.byId(detail).tab) || (prev && prev.tab) || 'carb',
      date: opts.date || next.date, meal: opts.meal || next.meal, log: !!opts.log,
      tray: (opts.tray || []).slice(), detail, q: null, credits: false,
      say: opts.say || '', mood: '', pose: 'wave', react: true, at: Date.now(), idleSaid: false, full: false, favSaid: false
    };
    const sync = this.dexSync();
    // 点亮到了 5 / 10 / 20… 样（老用户第一次打开就是现在吃过的那么多）：一打开它先庆祝
    const b = this.profile.buddy || {};
    const mile = TF.Dex.milestone(+b.dexMile || 0, sync.got);
    if (mile) {
      this.setBuddy({ dexMile: mile });
      if (!opts.say) Object.assign(this._dex, { say: this.cast().dex.milestone.replace('{n}', mile), mood: 'great', pose: 'flex' });
    }
    if (!b.dexOpened) this.setBuddy({ dexOpened: true });
    if (detail) Object.assign(this._dex, this.dexViewReact(TF.Dex.byId(detail)), opts.say ? { say: opts.say } : {});
    document.getElementById('buddy-pop').classList.add('hidden');
    this.closeDexSearch(true);
    document.getElementById('dex-overlay').classList.remove('hidden');
    this.renderDex();
    document.getElementById('dex-body').scrollTop = 0;
    window.Haptics && window.Haptics.fire('tap');
    this.bondGain && this.bondGain('ask');
    this.dexIdleWatch();
  },

  closeDex() {
    document.getElementById('dex-overlay').classList.add('hidden');
    clearInterval(this._dexIdleT);
    this._dex = null;
  },

  /** 在图鉴里发呆一会儿（9 秒没碰），小人主动说一样你没吃过的（这次打开只说一回） */
  dexIdleWatch() {
    clearInterval(this._dexIdleT);
    this._dexIdleT = setInterval(() => {
      const d = this._dex;
      if (!d) { clearInterval(this._dexIdleT); return; }
      if (d.idleSaid || d.q != null || d.credits || document.hidden || Date.now() - d.at < 9000) return;
      d.idleSaid = true;
      if (this.buddyLook().show) this.dexDiscover(true);
    }, 1500);
  },

  /** 小人在这顿旁边说的话：这天的预算、已经吃了多少一起算 */
  dexAdvice() {
    const d = this._dex;
    const s = this.getDaySummary(d.date);
    return TF.Dex.advice(d.tray, { meal: d.meal, budget: s.budget, eaten: d.date === getTodayDateString() ? s.intake : 0,
      proteinTarget: this.gaugeProteinTarget(), simple: this.isSimple() });
  },

  /** 这顿还空着：按今天还差多少蛋白、还能吃多少说一句，推荐两三样 */
  dexOpening() {
    const d = this._dex;
    const s = this.getDaySummary(d.date);
    const today = d.date === getTodayDateString();
    const o = TF.Dex.opening({ meal: d.meal, today, budget: s.budget, eaten: s.intake, protein: s.protein,
      proteinTarget: this.gaugeProteinTarget(), simple: this.isSimple(), eatenIds: this._dexEaten });
    if (d.log) o.text = `${d.meal.replace('/补剂', '')}吃了啥？点图片放进来，选好点「吃了，记上」。`;
    return o;
  },

  /** 点开一样时小人的反应：它爱吃的会害羞，少量吃的说一句不拦你，放心吃的说要点 */
  dexViewReact(it, stable) {
    const C = this.cast().dex;
    const pick = (a) => a[stable ? 0 : Math.floor(Math.random() * a.length)];
    if (C.fav.includes(it.name)) return { say: pick(C.favLine).replace('{food}', it.name), mood: 'shy', pose: 'stand', react: true };
    if (it.tone === 'treat') return { say: it.tip || pick(C.treat), mood: 'ok', pose: 'stand', react: true };
    return { say: it.tip || `${pick(C.good)}${it.name}${TF.Dex.TONE[it.tone]}。`, mood: 'good', pose: 'stand', react: true };
  },

  /** 小人推荐一样你没吃过的（点它、或者在图鉴里发呆时）；都吃过了就说句别的 */
  dexDiscover(idle) {
    const d = this._dex;
    if (!d) return;
    const D = TF.Dex;
    const C = this.cast().dex;
    const skip = new Set([...(this._dexEaten || []), ...d.tray.map(x => x.id)]);
    const it = D.discover(skip, d.detail || d.q != null ? null : d.tab);
    if (!it) Object.assign(d, { say: C.tap[Math.floor(Math.random() * C.tap.length)], peek: null });
    else {
      const one = D.portion(it, 1);
      const tip = it.tip ? it.tip.replace(/[。！!～]?$/, '。') : `${it.portion} ${one.calories} 千卡${this.isSimple() ? '' : `、蛋白 ${Math.round(one.proteinG)}g`}。`;
      Object.assign(d, { say: C.nudge.replace('{food}', it.name).replace('{tip}', tip), peek: it.id });
    }
    Object.assign(d, { mood: 'good', pose: idle ? 'wave' : 'stand', react: true });
    if (idle) window.Sound && window.Sound.play('blip');
    this.renderDex();
  },

  /** 长按图鉴里的小人：摸摸头（话按亲密度，一天前三次加亲密度） */
  dexPat() {
    const d = this._dex;
    if (!d) return;
    const lines = this.cast().pat[this.bond().lv - 1] || this.cast().pat[0];
    Object.assign(d, { say: lines[Math.floor(Math.random() * lines.length)], mood: 'love', pose: 'stand', react: true, peek: null });
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('blip');
    this.bondGain && this.bondGain('pat');
    this.renderDex();
  },

  /** 喂它一口：照片飞到它嘴边，它闭眼冒爱心，说一句（爱吃的、少量吃的、放心吃的不一样）；一天前三次加亲密度 */
  dexFeed(id, from) {
    const d = this._dex;
    const it = TF.Dex.byId(id);
    if (!d || !it) return;
    const C = this.cast().dex;
    const fav = C.fav.includes(it.name);
    const lines = fav ? C.feed.fav : it.tone === 'treat' ? C.feed.treat : C.feed.good;
    this.dexFly(from, document.querySelector('#dex-buddy .dex-buddy-art'));
    Object.assign(d, { say: lines[Math.floor(Math.random() * lines.length)], mood: 'love', pose: 'stand', react: 'feed', peek: null });
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('blip');
    this.bondGain && this.bondGain('feed');
    setTimeout(() => this.renderDex(), this.reducedMotion() ? 0 : 420);
  },

  /** 照片飞过去（放进这顿：飞到下面「搭一顿」；喂它：飞到它嘴边） */
  dexFly(from, to) {
    if (!from || !to || this.reducedMotion() || !from.animate) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const ghost = from.cloneNode(true);
    ghost.classList.add('dex-ghost');
    Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    document.body.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + Math.min(b.height / 2, 24) - (a.top + a.height / 2);
    ghost.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 50}px) scale(0.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.15 }
    ], { duration: 480, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => ghost.remove();
  },

  renderDex() {
    const d = this._dex;
    if (!d) return;
    const $ = (id) => document.getElementById(id);
    const D = TF.Dex;
    const eaten = this._dexEaten || new Set();
    const total = new Set(D.items().map(x => x.name)).size;
    const got = new Set(D.items().filter(x => eaten.has(x.id)).map(x => x.name)).size;
    $('dex-count').textContent = `吃过 ${got} / ${total}`;
    // 小人：站在左上角看着，说一句（反应 > 详情里说这一样 > 这顿空着时的推荐 > 看着这顿说）
    const item = d.detail && D.byId(d.detail);
    const look = this.buddyLook();
    let say = d.say, adds = [], mood = d.mood;
    const browsing = !item && !d.credits && d.q == null;
    if (!say) {
      if (item) say = this.dexViewReact(item, true).say;
      else if (d.credits) say = '这些照片的作者，谢谢他们。';
      else if (d.q != null) say = '想找什么？打个名字就行。';
      else if (!d.tray.length) { const o = this.dexOpening(); say = o.text; adds = o.adds || []; }
      else { const adv = this.dexAdvice(); say = adv.text; adds = adv.add ? [adv.add] : []; mood = mood || (adv.good ? 'good' : 'ok'); }
    } else if (browsing && d.tray.length) { const adv = this.dexAdvice(); adds = adv.add ? [adv.add] : []; }
    else if (browsing && !d.peek) adds = this.dexOpening().adds || [];
    adds = adds.filter(id => D.byId(id) && !d.tray.some(x => x.id === id)).slice(0, 3);
    const peek = d.peek && D.byId(d.peek);
    const chips = (peek ? `<button type="button" class="dex-add-tip peek" data-id="${peek.id}">${this.dexIcon(peek, 'xs')}看看${esc(peek.name)}</button>` : '') +
      (item || d.credits ? '' : adds.map(id => `<button type="button" class="dex-add-tip" data-add="${id}">${this.dexIcon(D.byId(id), 'xs')}+ ${esc(D.byId(id).name)}</button>`).join(''));
    const art = look.show ? TF.Buddy.svg(this.buddyArt({ mood: mood || 'ok', gear: [], pose: d.pose || 'stand' })) : '';
    $('dex-buddy').innerHTML = (art ? `<button type="button" class="dex-buddy-art${d.react === 'feed' ? ' feed' : d.react ? ' hop' : ''}" data-buddy="1" aria-label="点点${esc(this.buddyName())}">${art}</button>` : '') +
      `<div class="dex-say-wrap"><p class="dex-say">${esc(say)}</p>${chips ? `<div class="dex-add-row">${chips}</div>` : ''}</div>`;
    Object.assign(d, { say: '', mood: '', pose: 'stand', react: false, peek: null });
    const searching = d.q != null;
    $('dex-tabs').classList.toggle('hidden', searching);
    $('dex-tabs').innerHTML = D.TABS.map(t => `<button type="button" class="seg-btn${t.key === d.tab && !item && !d.credits ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('');
    $('dex-body').innerHTML = d.credits ? this.dexCreditsHtml() : item ? this.dexDetailHtml(item) : searching ? this.dexSearchHtml(d.q) : this.dexListHtml(d.tab);
    $('dex-tray').innerHTML = this.dexTrayHtml();
  },

  dexGridHtml(list) {
    const D = TF.Dex;
    const eaten = this._dexEaten || new Set();
    const inTray = new Set(this._dex.tray.map(x => x.id));
    return '<div class="dex-grid">' + list.map(it => {
      const e = D.per100(it);
      return `<button type="button" class="dex-item${eaten.has(it.id) ? ' eaten' : ''}${inTray.has(it.id) ? ' picked' : ''}" data-id="${it.id}">` +
        `${this.dexIcon(it)}<b>${esc(it.name)}</b><small>${e ? e.k : '?'} 千卡</small></button>`;
    }).join('') + '</div>';
  },

  dexListHtml(tab) {
    const D = TF.Dex;
    const t = D.TABS.find(x => x.key === tab) || D.TABS[0];
    const eaten = this._dexEaten || new Set();
    return t.sections.map((s, si) => {
      const list = s.items.map((x, i) => D.byId(`${t.key}.${si}.${i}`));
      const n = list.filter(it => eaten.has(it.id)).length;
      return `<section class="dex-sec"><h4 class="dex-sec-title tone-${s.tone}">${esc(s.title)}<small>${D.TONE[s.tone]}${n ? ` · 吃过 ${n}/${list.length}` : ''}</small></h4>` + this.dexGridHtml(list) + '</section>';
    }).join('') + '<p class="dex-foot">数字是每 100 克的千卡（中国食物成分表 / USDA / 常见做法）。点一样看详情，打勾的是你吃过的。<button type="button" class="dex-credit-link" data-credits="1">照片来源</button></p>';
  },

  /** 搜一下：图鉴里有的列出来；没有的，一键「直接记」或者「问它多少热量」 */
  dexSearchHtml(q) {
    const k = String(q || '').trim();
    if (!k) return '<p class="dex-empty dex-search-tip">打个名字就行：鸡蛋、米饭、牛油果……</p>';
    const list = TF.Dex.search(k);
    const name = this.buddyName();
    const none = `<div class="dex-none"><p>${list.length ? `没找到想要的？` : `图鉴里还没有「${esc(k)}」。`}</p>` +
      `<div class="dex-none-acts"><button type="button" class="btn btn-primary" data-ql="log">直接记「${esc(k.slice(0, 12))}」</button>` +
      `<button type="button" class="btn" data-ql="ask">问${esc(name)}多少热量</button></div></div>`;
    return (list.length ? this.dexGridHtml(list) : '') + none;
  },

  /** 照片来源（CC BY / BY-SA 要署名） */
  dexCreditsHtml() {
    const map = TF.FOOD_IMG || {};
    const rows = Object.keys(map).map(n => `<li><b>${esc(n)}</b><span>${esc(map[n][1])} · ${esc(map[n][2])} · ${esc(map[n][3])}</span></li>`).join('');
    return `<div class="dex-detail"><button type="button" class="dex-back" data-back="1">‹ 返回</button>` +
      `<p class="dex-credit-head">图鉴里的照片都是开放授权的实拍图（经 Openverse 检索，来自 Flickr、Wikimedia），裁成方形、缩小后使用。谢谢这些作者：</p>` +
      `<ul class="dex-credits">${rows}</ul><p class="dex-foot">完整链接见项目里的 web/img/food/CREDITS.md。营养数据来自《中国食物成分表（第6版）》和 USDA FoodData Central。</p></div>`;
  },

  dexDetailHtml(it) {
    const D = TF.Dex;
    const e = D.per100(it);
    const one = D.portion(it, 1);
    const eatenN = this.diet.filter(d => (d.items || []).some(i => i.name === it.name) || String(d.foodSummary || '').includes(it.name)).length;
    const cell = (v, u, l) => `<div class="dex-cell"><b>${v}<small>${u}</small></b><span>${l}</span></div>`;
    const today = this._dex.date === getTodayDateString();
    const look = this.buddyLook();
    return `<div class="dex-detail"><button type="button" class="dex-back" data-back="1">‹ 返回</button>` +
      `<div class="dex-detail-top">${this.dexIcon(it, 'big')}<div><b class="dex-detail-name">${esc(it.name)}</b>` +
      `<span class="dex-tag tone-${it.tone}">${D.TONE[it.tone]}</span>${eatenN ? `<span class="dex-tag">你吃过 ${eatenN} 次</span>` : ''}` +
      `<span class="dex-src">每 100 克 · ${esc(D.SOURCE[e.src] || '')}</span></div></div>` +
      `<div class="dex-cells">${cell(e.k, '千卡', '热量')}${cell(e.p, 'g', '蛋白')}${cell(e.c, 'g', '碳水')}${cell(e.f, 'g', '脂肪')}</div>` +
      `<p class="dex-portion">${esc(it.portion)}大约 ${one.grams} 克：<b>${one.calories} 千卡</b>${this.isSimple() ? '' : `，蛋白 ${one.proteinG}g`}，碳水 ${one.carbsG}g，脂肪 ${one.fatG}g</p>` +
      `<div class="dex-detail-acts"><button type="button" class="btn btn-primary" data-put="${it.id}">放进${esc(this.dexMealLabel())}</button>` +
      (today ? `<button type="button" class="btn" data-eat="${it.id}">只吃了这个，记上</button>` : '') + '</div>' +
      (look.show ? `<button type="button" class="dex-feed" data-feed="${it.id}"><i aria-hidden="true">♥</i>喂${esc(this.buddyName())}一口</button>` : '') + '</div>';
  },

  dexMealLabel() {
    const d = this._dex;
    const today = getTodayDateString();
    const day = d.date === today ? '今天' : d.date === shiftDateString(today, 1) ? '明天' : `${+d.date.slice(5, 7)}月${+d.date.slice(8)}日`;
    return day + d.meal.replace('/补剂', '');
  },

  dexTrayHtml() {
    const d = this._dex;
    const D = TF.Dex;
    const today = getTodayDateString();
    const days = [[today, '今天'], [shiftDateString(today, 1), '明天']];
    const meals = ['早餐', '午餐', '晚餐', '加餐/补剂'];
    const t = D.totals(d.tray);
    const picks = d.tray.map(x => {
      const it = D.byId(x.id);
      return `<span class="dex-pick"><button type="button" data-dec="${x.id}" aria-label="少一点">−</button>${this.dexIcon(it, 'xs')}${esc(it.name)} ${esc(D.amountText(it, x.n))}<button type="button" data-inc="${x.id}" aria-label="多一点">+</button></span>`;
    }).join('');
    const isToday = d.date === today;
    const plan = `<button type="button" class="btn${isToday && d.log ? '' : isToday ? '' : ' btn-primary'}" data-commit="plan">加到${esc(this.dexMealLabel())}的计划</button>`;
    const log = isToday ? `<button type="button" class="btn btn-primary" data-commit="log">吃了，记上</button>` : '';
    return `<div class="dex-target"><span class="dex-target-label">${d.log ? '记一顿' : '搭一顿'}</span>` +
      `<span class="seg seg-sm">${days.map(([v, l]) => `<button type="button" class="seg-btn${d.date === v ? ' active' : ''}" data-day="${v}">${l}</button>`).join('')}</span>` +
      `<span class="seg seg-sm">${meals.map(m => `<button type="button" class="seg-btn${d.meal === m ? ' active' : ''}" data-meal="${m}">${m.replace('/补剂', '')}</button>`).join('')}</span></div>` +
      (d.tray.length ? `<div class="dex-picks">${picks}</div>` +
        `<div class="dex-sum"><b>${t.calories}</b> 千卡${this.isSimple() ? '' : ` · 蛋白 <b>${Math.round(t.proteinG)}</b>g`} · 碳水 ${Math.round(t.carbsG)}g · 脂肪 ${Math.round(t.fatG)}g</div>` +
        `<div class="dex-acts">${d.log ? log + plan : plan + log}</div>`
        : `<p class="dex-empty">点上面的照片，放进${esc(this.dexMealLabel())}</p>`);
  },

  /** 往这顿里放一样（已经有了就多一份）；from：点的那张照片（飞进「搭一顿」） */
  dexPut(id, n, from) {
    const d = this._dex;
    const it = TF.Dex.byId(id);
    if (!d || !it) return;
    this.dexFly(from, document.getElementById('dex-tray'));
    const cur = d.tray.find(x => x.id === id);
    if (cur) cur.n = Math.min(10, cur.n + (n || 1));
    else d.tray.push({ id, n: n || 1 });
    window.Haptics && window.Haptics.fire('tick');
    window.Sound && window.Sound.play('blip');
    d.detail = null;
    // 小人马上说这一样：它爱吃的先害羞一下；搭得好（三样以上）它秀一下
    const C = this.cast().dex;
    const adv = this.dexAdvice();
    if (C.fav.includes(it.name) && !d.favSaid) {
      d.favSaid = true;
      Object.assign(d, { say: C.favLine[Math.floor(Math.random() * C.favLine.length)].replace('{food}', it.name) + adv.text.replace(/^这顿搭得好：/, ' 这顿 '), mood: 'shy' });
    } else if (adv.good && d.tray.length >= 3 && !d.full) {
      d.full = true;
      Object.assign(d, { say: `${C.full}${adv.text.replace(/^这顿搭得好/, '')}`, mood: 'great', pose: 'flex' });
    } else Object.assign(d, { say: adv.text, mood: adv.good ? 'good' : 'ok' });
    d.react = true;
    this.renderDex();
  },

  /** 记上（今天）：这顿 → 一条记录，能撤销；记完小人回一句、点亮新的图鉴 */
  dexLog(tray, meal) {
    if (!tray.length || !window.QuickLog || !QuickLog.save) return;
    const m = TF.Dex.toMeal(tray, meal);
    const result = { dayOffset: 0, workouts: [], meals: [m], updates: [], deletes: [], bodyWeight: null, reply: `今天${meal.replace('/补剂', '')}记上了`, source: 'dex', said: '图鉴：' + m.foodSummary };
    this.closeDex();
    const batch = QuickLog.save(result, getTodayDateString());
    QuickLog.showSnack(batch, result);
    if (this.reactRecord) this.reactRecord(result, batch);
  },

  /** 搭好了：加到那天那一顿的计划（只换掉那一顿的计划，别的计划不动），或者今天的直接记上 */
  dexCommit(mode) {
    const d = this._dex;
    if (!d || !d.tray.length) return;
    if (mode === 'log' && d.date === getTodayDateString()) { this.dexLog(d.tray, d.meal); return; }
    const meal = TF.Dex.toMeal(d.tray, d.meal);
    const label = this.dexMealLabel();
    const stamp = Date.now();
    this.plans = (this.plans || []).filter(p => !(p.date === d.date && p.kind === 'meal' && p.mealType === d.meal && !p.done))
      .concat({ id: `pl_${stamp}_dex`, date: d.date, kind: 'meal', ts: stamp, from: stamp, mealType: meal.mealType, foodSummary: meal.foodSummary,
        calories: meal.calories, proteinG: meal.proteinG, carbsG: meal.carbsG, fatG: meal.fatG, items: meal.items });
    this.bondGain && this.bondGain('plan');
    this.closeDex();
    this.selectedDate = d.date;
    this.saveData();
    this.render();
    this.showToast(`加到${label}的计划了，吃了点 ✓ 就记上`);
    window.Haptics && window.Haptics.fire('success');
  },

  /**
   * 小人帮你挑一顿（饭前推荐用）：一样蛋白、一样主食、一样菜；早餐是主食 + 两个蛋 + 一杯奶 / 豆浆。
   * 六成挑你吃过的（它认识你），晚饭减脂时主食半份。
   */
  dexSuggest(meal) {
    const eaten = TF.Dex.eatenIds(this.diet);
    const choose = (ids) => {
      const fam = ids.filter(id => eaten.has(id));
      const pool = fam.length && Math.random() < 0.6 ? fam : ids;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    if (meal === '早餐') return [{ id: choose(['carb.0.0', 'carb.0.7', 'carb.0.3', 'carb.0.2']), n: 1 }, { id: 'protein.2.0', n: 2 },
      { id: choose(['protein.2.2', 'protein.3.1', 'protein.2.4', 'protein.2.3']), n: 1 }];
    const lose = (this.profile.goalType || 'fat_loss') === 'fat_loss';
    return [{ id: choose(['protein.0.0', 'protein.0.1', 'protein.1.0', 'protein.1.1', 'protein.1.2', 'protein.3.0']), n: 1 },
      { id: choose(['carb.0.1', 'carb.1.0', 'carb.0.3', 'carb.0.2']), n: meal === '晚餐' && lose ? 0.5 : 1 },
      { id: choose(['veg.0.0', 'veg.0.1', 'veg.1.1', 'veg.0.4', 'veg.1.5']), n: 1 }];
  },

  /**
   * 饭前（早 7～9 点、午 10:30～12 点、晚 16:30～18:30）这顿还空着、也没计划：小人挑一顿推荐给你（带照片），
   * 「就这样」一键加到计划，「我自己挑」打开图鉴（挑好的先放进去），每顿一天问一次。idle：发呆时问的，次数那边记。
   */
  mealPick(idle) {
    if (!this.canChat() || this._touring || this.needsOnboarding || Date.now() - (this._popAt || 0) < 60000) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden') || this.view !== 'today') return false;
    const now = new Date();
    const t = now.getHours() + now.getMinutes() / 60;
    const meal = t >= 7 && t < 9 ? '早餐' : t >= 10.5 && t < 12 ? '午餐' : t >= 16.5 && t < 18.5 ? '晚餐' : null;
    const today = getTodayDateString();
    if (!meal || this.diet.some(d => d.date === today && d.mealType === meal) || (this.plans || []).some(p => p.date === today && p.mealType === meal)) return false;
    const key = 'pick:' + meal;
    if (this.nudgeSaid(key) || (!idle && !this.voiceBudget('guide', false))) return false;
    this.nudgeMark(key);
    if (!idle) this.voiceBudget('guide', true);
    const tray = this.dexSuggest(meal);
    const D = TF.Dex;
    const sum = D.totals(tray);
    const names = tray.map(x => D.byId(x.id).name + (x.n === 1 ? '' : D.amountText(D.byId(x.id), x.n))).join(' + ');
    const name = this.callName();
    const label = meal.replace('餐', '饭');
    return this.askUser(`${name ? name + '，' : ''}${label}想好吃啥了吗？我挑了：${names}，大概 ${sum.calories} 千卡${this.isSimple() ? '' : `、蛋白 ${Math.round(sum.proteinG)}g`}。`, [
      { label: '就这样', pick: () => { this._dex = { date: today, meal, tray: tray.slice() }; this.dexCommit('plan'); }, reply: '加到计划了，吃了点 ✓ 就记上。' },
      { label: '我自己挑', pick: () => setTimeout(() => this.openDex({ date: today, meal, tray, say: '我先放了几样，换着挑，我看着。' }), 60) },
      { label: '不用了', reply: '好，吃完说一声。' }
    ], { pics: tray.map(x => D.byId(x.id).name) });
  },

  /**
   * 猜热量（v6.1，每天一题，日常小游戏）：从图鉴里挑一样常见的，问一份多少千卡，三个选项（v6.2 带照片）。
   * 答对冒爱心、加一点亲密度；答错告诉你是多少。idle：发呆时问的，次数那边记。
   */
  quizNudge(idle) {
    if (!this.canChat() || this._touring || this.needsOnboarding || Date.now() - (this._popAt || 0) < 60000) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden') || this.view !== 'today') return false;
    const today = getTodayDateString();
    let q;
    try { q = JSON.parse(localStorage.getItem('tf_quiz') || '{}'); } catch (e) { q = {}; }
    if (!q || typeof q !== 'object') q = {};
    if (q.date === today || (!idle && !this.voiceBudget('chat', false))) return false;
    const seed = [...today].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) + (q.n || 0) * 13;
    const z = TF.Dex.quiz(seed);
    q = { date: today, n: (q.n || 0) + 1, right: q.right || 0 };
    try { localStorage.setItem('tf_quiz', JSON.stringify(q)); } catch (e) {}
    if (!idle) this.voiceBudget('chat', true);
    const won = () => {
      q.right += 1;
      try { localStorage.setItem('tf_quiz', JSON.stringify(q)); } catch (e) {}
      this.buddyMood('love', 1800);
      this.buddyBang('♥');
    };
    return this.askUser(`考考你：${z.portion}${z.name}，大概多少千卡？`, z.opts.map(v => ({
      label: `${v} 千卡`,
      pick: v === z.right ? won : null,
      reply: v === z.right ? `答对了！${q.right + 1 > 1 ? `你已经答对 ${q.right + 1} 次了。` : ''}食物图鉴里还有一百多样，点我就能看。` : `差一点，${z.portion}${z.name}是 ${z.right} 千卡左右。没事，明天再考你。`
    })), { pics: [z.name] });
  },

  /**
   * 还没打开过图鉴：小人主动介绍一次（不想说话的人可以点图片记）。今天说过就不说，最多说三天，打开过就不再说。
   */
  dexIntro() {
    if (!this.canChat() || Date.now() - (this._popAt || 0) < 60000) return false;
    const b = this.profile.buddy || {};
    if (b.dexOpened || (+b.dexIntro || 0) >= 3 || this.nudgeSaid('dex:intro') || !this.voiceBudget('guide', false)) return false;
    this.nudgeMark('dex:intro');
    this.voiceBudget('guide', true);
    this.setBuddy({ dexIntro: (+b.dexIntro || 0) + 1 });
    const name = this.callName();
    return this.askUser(`${name ? name + '，' : ''}给你看个东西：一本带照片的食物图鉴，一百多样常吃的，热量、蛋白一眼看清。不想说话的时候，点图片也能记。`, [
      { label: '翻翻看', pick: () => setTimeout(() => this.openDex(), 60) },
      { label: '以后再说', reply: '好，点我就能找到。' }
    ], { pics: ['鸡胸肉', '西兰花', '贝贝南瓜'] });
  },

  /** 今天页发呆时：推荐一样你没吃过的（带照片，「看看」直接打开那一样） */
  dexNudge() {
    const D = TF.Dex;
    const it = D.discover(D.eatenIds(this.diet));
    if (!it || !this.buddyLook().show) return false;
    const one = D.portion(it, 1);
    const tip = it.tip ? it.tip.replace(/[。！!～]?$/, '。') : `${it.portion} ${one.calories} 千卡${this.isSimple() ? '' : `、蛋白 ${Math.round(one.proteinG)}g`}。`;
    return this.askUser(this.cast().dex.nudge.replace('{food}', it.name).replace('{tip}', tip), [
      { label: '看看', pick: () => setTimeout(() => this.openDex({ detail: it.id }), 60) },
      { label: '下次试试', reply: '嗯，记住了就行。' }
    ], { pics: [it.name] });
  },

  closeDexSearch(silent) {
    const box = document.getElementById('dex-search');
    if (!box) return;
    box.classList.add('hidden');
    const input = document.getElementById('dex-q');
    if (input) { input.value = ''; input.blur(); }
    if (this._dex) this._dex.q = null;
    if (!silent) this.renderDex();
  },

  bindDex() {
    const ov = document.getElementById('dex-overlay');
    if (!ov) return;
    ov.addEventListener('click', (e) => {
      const d = this._dex;
      if (!d) return;
      d.at = Date.now();
      if (e.target === ov || e.target.closest('#dex-close')) { this.closeDex(); return; }
      if (e.target.closest('#dex-find')) {
        const box = document.getElementById('dex-search');
        if (!box.classList.contains('hidden')) { this.closeDexSearch(); return; }
        box.classList.remove('hidden');
        Object.assign(d, { q: '', detail: null, credits: false });
        this.renderDex();
        document.getElementById('dex-q').focus();
        return;
      }
      if (e.target.closest('#dex-q-cancel')) { this.closeDexSearch(); return; }
      const b = e.target.closest('button');
      if (!b) return;
      const ds = b.dataset;
      const photo = b.querySelector('.dex-icon');
      if (ds.buddy) {
        if (this._dexLong) { this._dexLong = false; return; } // 长按刚摸过头
        this.dexDiscover(false);
        return;
      }
      if (ds.tab) { d.tab = ds.tab; d.detail = null; d.credits = false; }
      else if (ds.id) { d.detail = ds.id; d.credits = false; Object.assign(d, this.dexViewReact(TF.Dex.byId(ds.id))); window.Haptics && window.Haptics.fire('tick'); }
      else if (ds.back) { d.detail = null; d.credits = false; }
      else if (ds.credits) { d.credits = true; d.detail = null; }
      else if (ds.put || ds.add) { this.dexPut(ds.put || ds.add, 1, ds.put ? document.querySelector('#dex-body .dex-icon.big') : photo); return; }
      else if (ds.eat) { this.dexLog([{ id: ds.eat, n: 1 }], d.meal); return; }
      else if (ds.feed) { this.dexFeed(ds.feed, document.querySelector('#dex-body .dex-icon.big')); return; }
      else if (ds.ql) {
        const q = String(d.q || '').trim();
        if (!q || !window.QuickLog) return;
        this.closeDex();
        window.QuickLog.submit(ds.ql === 'ask' ? `${q}多少热量` : q, ds.ql === 'ask' ? { ask: true } : undefined);
        return;
      }
      else if (ds.inc || ds.dec) {
        const x = d.tray.find(t => t.id === (ds.inc || ds.dec));
        if (x) {
          x.n = ds.inc ? Math.min(10, x.n + 0.5) : x.n - 0.5;
          if (x.n <= 0) d.tray = d.tray.filter(t => t !== x);
        }
        window.Haptics && window.Haptics.fire('tick');
      } else if (ds.day) d.date = ds.day;
      else if (ds.meal) d.meal = ds.meal;
      else if (ds.commit) { this.dexCommit(ds.commit); return; }
      else return;
      this.renderDex();
      if (ds.tab || ds.back || ds.id || ds.credits) document.getElementById('dex-body').scrollTop = 0;
    });
    // 长按小人：摸摸头
    let pressT = null;
    ov.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('[data-buddy]')) return;
      this._dexLong = false;
      clearTimeout(pressT);
      pressT = setTimeout(() => { this._dexLong = true; this.dexPat(); }, 550);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => ov.addEventListener(ev, () => clearTimeout(pressT)));
    // 搜一下：边打边出
    const input = document.getElementById('dex-q');
    if (input) input.addEventListener('input', () => {
      const d = this._dex;
      if (!d) return;
      d.q = input.value;
      d.at = Date.now();
      document.getElementById('dex-body').innerHTML = this.dexSearchHtml(d.q);
    });
  }
});
