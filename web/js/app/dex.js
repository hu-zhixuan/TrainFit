/**
 * 食物图鉴（v6.1，用户发了「易减」小程序「减脂食物大全」的截图：「能不能做个图鉴，集成到小人的入口，
 * 让用户自主选择饮食安排，小人在旁边指导」）。
 *  - 从小人进：点小人的气泡里「食物图鉴 · 自己搭一顿」、饭前小人推荐时「去图鉴挑」。不加栏目、不加页面，是一张底部面板。
 *  - 五栏：碳水 / 蛋白质 / 蔬菜 / 脂肪 / 外卖，每栏分几组（更耐饿、看份量、少量吃…），每样写每 100 克多少千卡。
 *    数都从本机食物库（中国食物成分表 + 成品菜库）现查，图鉴自己不存营养数；吃过的点亮一个勾（收集感）。
 *  - 点一样看详情：每 100 克的热量、蛋白、碳水、脂肪，一份大概多少，小人的一句话；「放进这顿」。
 *  - 底下「搭一顿」：今天 / 明天的哪一顿，放进来的每样能加减份数；小人看着这顿实时说（蛋白够不够、热量多不多、
 *    有没有菜、甜的少吃），能一键补上它建议的那样；搭好了「加到计划」（今天页的虚线计划行）或「现在记上」（直接变成记录）。
 * 都在本机算，不调大模型。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 每样：[显示名, 食物库里的名字, 图标（没有合适的 emoji 就空着，显示名字的第一个字）, 一份几克, 一份怎么说, 小人的一句话]
  // tone：good 放心吃 / ok 看份量 / treat 少量吃
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
        ['榴莲', '榴莲', '', 100, '两块', '热量高，吃了就当半顿主食']
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
        ['蛋白粉', '乳清蛋白粉', '', 30, '一勺', '一勺二十多克蛋白，肉吃不够的时候补']
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
        ['三文鱼', '三文鱼', '🐟', 150, '一块', '鱼油也是好脂肪']
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
  // 实物照片（v6.2，维基共享资源，scripts/build-food-photos.py 生成 web/img/food/<key>.webp 和出处 FOOD_PHOTOS）：显示名 → 文件名
  const PHOTO_KEY = {
    燕麦片: 'oatmeal', 杂粮饭: 'multigrain-rice', 玉米: 'corn', 红薯: 'sweet-potato', 贝贝南瓜: 'kabocha', 土豆: 'potato', 山药: 'yam', 全麦面包: 'wholewheat-bread',
    荞麦面: 'soba', 米饭: 'rice', 馒头: 'mantou', 面条: 'noodles', 水饺: 'jiaozi', 馄饨: 'wonton', 肉包: 'baozi', 白粥: 'congee', 手抓饼: 'shouzhuabing', 苹果: 'apple',
    香蕉: 'banana', 橙子: 'orange', 梨: 'pear', 草莓: 'strawberry', 猕猴桃: 'kiwi', 西瓜: 'watermelon', 葡萄: 'grape', 芒果: 'mango', 樱桃: 'cherry', 榴莲: 'durian',
    奶茶: 'bubble-tea', 可乐: 'cola', 生椰拿铁: 'coconut-latte', 油条: 'youtiao', 葡萄干: 'raisin', 啤酒: 'beer', 鸡胸肉: 'chicken-breast', 瘦牛肉: 'beef',
    猪里脊: 'pork-loin', 鸡腿肉: 'chicken-leg', 羊肉: 'lamb', 鸡爪: 'chicken-feet', 虾仁: 'shrimp', 三文鱼: 'salmon', 鳕鱼: 'cod', 金枪鱼: 'tuna', 鱿鱼: 'squid',
    鲈鱼: 'seabass', 蛤蜊: 'clam', 鸡蛋: 'egg', 蛋白: 'egg-white', 牛奶: 'milk', 脱脂牛奶: 'skim-milk', 酸奶: 'yogurt', 奶酪: 'cheese', 蛋白粉: 'whey', 豆腐: 'tofu',
    豆浆: 'soymilk', 毛豆: 'edamame', 腐竹: 'yuba', 西兰花: 'broccoli', 菠菜: 'spinach', 生菜: 'lettuce', 大白菜: 'napa', 油麦菜: 'youmaicai', 芹菜: 'celery',
    黄瓜: 'cucumber', 番茄: 'tomato', 茄子: 'eggplant', 西葫芦: 'zucchini', 冬瓜: 'winter-melon', 香菇: 'shiitake', 金针菇: 'enoki', 海带: 'kelp', 胡萝卜: 'carrot',
    南瓜: 'pumpkin', 洋葱: 'onion', 黄豆芽: 'bean-sprout', 豆角: 'green-bean', 坚果: 'nuts', 杏仁: 'almond', 腰果: 'cashew', 开心果: 'pistachio', 南瓜子: 'pumpkin-seed',
    炒菜油: 'oil', 橄榄油: 'olive-oil', 黄油: 'butter', 红烧肉: 'hongshaorou', 回锅肉: 'huiguorou', 糖醋里脊: 'tangcu', 炸鸡块: 'fried-chicken', 汉堡: 'burger',
    番茄炒蛋: 'tomato-egg', 蒜蓉西兰花: 'garlic-broccoli', 麻婆豆腐: 'mapo-tofu', 宫保鸡丁: 'kungpao', 水煮牛肉: 'shuizhu-beef', 牛肉拉面: 'lanzhou-noodles',
    皮蛋瘦肉粥: 'pidan-congee', 麻辣烫: 'malatang', 黄焖鸡米饭: 'huangmenji', 麻辣香锅: 'xiangguo', 猪脚饭: 'zhujiaofan', 螺蛳粉: 'luosifen', 鱼香肉丝: 'yuxiang',
    地三鲜: 'disanxian', 沙县拌面: 'shaxian-noodles'
  };


  /** 所有条目（带上属于哪一栏、哪一组），同一样出现两次的（三文鱼）各算一个 */
  function all() {
    const out = [];
    TABS.forEach(t => t.sections.forEach((s, si) => s.items.forEach((x, i) => out.push({
      id: `${t.key}.${si}.${i}`, tab: t.key, section: s.title, tone: s.tone,
      name: x[0], db: x[1], icon: x[2], grams: x[3], portion: x[4], tip: x[5], photo: PHOTO_KEY[x[0]] || ''
    }))));
    return out;
  }
  let cache = null;
  const items = () => cache || (cache = all());
  const byId = (id) => items().find(x => x.id === id);

  /** 每 100 克（从食物库现查）：{k, p, c, f, src}；库里没有返回 null */
  function per100(item) {
    const e = TF.FoodDB && TF.FoodDB.find(item.db);
    return e ? { k: e.k, p: e.p, c: e.c, f: e.f, src: e.src } : null;
  }

  /** n 份的营养（一份 = item.grams 克） */
  function portion(item, n) {
    const e = per100(item);
    const g = Math.round(item.grams * n);
    const r = (x) => Math.round(x * g / 10) / 10;
    return { grams: g, calories: Math.round(e.k * g / 100), proteinG: r(e.p), carbsG: r(e.c), fatG: r(e.f) };
  }

  /** 份数说出来：「1 个」「半碗」「2 份」 */
  function amountText(item, n) {
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

  /** 这顿 → 一条饮食（计划行或记录用的字段） */
  function toMeal(tray, mealType) {
    const its = tray.map(x => {
      const it = byId(x.id);
      const p = portion(it, x.n);
      const e = per100(it);
      return Object.assign({ name: it.name, amount: amountText(it, x.n), source: e.src === 'cfct' ? '成分表' : '菜品库' }, p);
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

  /** 这一样的实物照片出处（没有照片返回 null） */
  function photoOf(item) {
    const P = root.FOOD_PHOTOS || {};
    return item && item.photo && P[item.photo] ? Object.assign({ src: `img/food/${item.photo}.webp` }, P[item.photo]) : null;
  }

  TF.Dex = { TABS, TONE, PHOTO_KEY, photoOf, items, byId, per100, portion, amountText, totals, advice, toMeal, eatenIds, quiz };
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

  /**
   * 打开图鉴。opts：{ tab, meal, date, tray: [{id, n}], say } —— 小人推荐时带着挑好的几样进来
   */
  openDex(opts) {
    opts = opts || {};
    const next = this.dexNextMeal();
    this._dex = {
      tab: opts.tab || (this._dex && this._dex.tab) || 'carb',
      date: opts.date || next.date, meal: opts.meal || next.meal,
      tray: (opts.tray || []).slice(), detail: null, say: opts.say || ''
    };
    this._dexEaten = TF.Dex.eatenIds(this.diet);
    document.getElementById('buddy-pop').classList.add('hidden');
    document.getElementById('dex-overlay').classList.remove('hidden');
    this.renderDex();
    window.Haptics && window.Haptics.fire('tap');
    this.bondGain && this.bondGain('ask');
  },

  closeDex() {
    document.getElementById('dex-overlay').classList.add('hidden');
    this._dex = null;
  },

  /** 小人在这顿旁边说的话：这天的预算、已经吃了多少一起算 */
  dexAdvice() {
    const d = this._dex;
    const s = this.getDaySummary(d.date);
    // 今天：已经记了的（不含这一顿已记的那部分也算进去，表示这天还能吃多少）
    return TF.Dex.advice(d.tray, { meal: d.meal, budget: s.budget, eaten: d.date === getTodayDateString() ? s.intake : 0,
      proteinTarget: this.gaugeProteinTarget(), simple: this.isSimple() });
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
    // 小人：图鉴里它在左上角看着，说一句（详情时说这一样，平时说这顿）
    const adv = this.dexAdvice();
    const item = d.detail && D.byId(d.detail);
    const look = this.buddyLook();
    const say = d.say || (item ? (item.tip || `${item.name}：${D.TONE[item.tone]}。`) : adv.text);
    d.say = '';
    $('dex-buddy').innerHTML = (look.show ? `<span class="dex-buddy-art">${TF.Buddy.svg(this.buddyArt({ mood: adv.good ? 'good' : 'ok', gear: [], pose: 'lie' }))}</span>` : '') +
      `<p class="dex-say">${esc(say)}</p>` +
      (!item && adv.add && D.byId(adv.add) ? `<button type="button" class="dex-add-tip" data-add="${adv.add}">+ ${esc(D.byId(adv.add).name)}</button>` : '');
    $('dex-tabs').innerHTML = D.TABS.map(t => `<button type="button" class="seg-btn${t.key === d.tab && !item ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('');
    $('dex-body').innerHTML = item ? this.dexDetailHtml(item) : this.dexListHtml(d.tab);
    $('dex-tray').innerHTML = this.dexTrayHtml();
  },

  /** 图标：有实物照片用照片（圆的），没有就用 emoji / 名字第一个字 */
  dexIcon(it, big) {
    const ph = TF.Dex.photoOf(it);
    if (ph) return `<span class="dex-icon photo${big ? ' big' : ''}"><img src="${ph.src}" alt="" loading="lazy" decoding="async"></span>`;
    return `<span class="dex-icon tone-${it.tone}${big ? ' big' : ''}">${it.icon ? it.icon : `<b>${esc(it.name.slice(0, 1))}</b>`}</span>`;
  },

  dexListHtml(tab) {
    const D = TF.Dex;
    const t = D.TABS.find(x => x.key === tab) || D.TABS[0];
    const eaten = this._dexEaten || new Set();
    const inTray = new Set(this._dex.tray.map(x => x.id));
    return t.sections.map((s, si) => `<section class="dex-sec"><h4 class="dex-sec-title tone-${s.tone}">${esc(s.title)}<small>${D.TONE[s.tone]}</small></h4><div class="dex-grid">` +
      s.items.map((x, i) => {
        const it = D.byId(`${t.key}.${si}.${i}`);
        const e = D.per100(it);
        return `<button type="button" class="dex-item${eaten.has(it.id) ? ' eaten' : ''}${inTray.has(it.id) ? ' picked' : ''}" data-id="${it.id}">` +
          `${this.dexIcon(it)}<b>${esc(it.name)}</b><small>${e ? e.k : '?'} 千卡</small></button>`;
      }).join('') + '</div></section>').join('') + '<p class="dex-foot">数字是每 100 克的千卡（中国食物成分表 / 常见做法）。点一样看详情，打勾的是你吃过的。' +
      (Object.keys(root.FOOD_PHOTOS || {}).length ? '照片来自维基共享资源（Wikimedia Commons），作者和授权写在每样的详情里。' : '') + '</p>';
  },

  dexDetailHtml(it) {
    const D = TF.Dex;
    const e = D.per100(it);
    const one = D.portion(it, 1);
    const eatenN = this.diet.filter(d => (d.items || []).some(i => i.name === it.name) || String(d.foodSummary || '').includes(it.name)).length;
    const cell = (v, u, l) => `<div class="dex-cell"><b>${v}<small>${u}</small></b><span>${l}</span></div>`;
    return `<div class="dex-detail"><button type="button" class="dex-back" data-back="1">‹ 返回</button>` +
      `<div class="dex-detail-top">${this.dexIcon(it, true)}<div><b class="dex-detail-name">${esc(it.name)}</b>` +
      `<span class="dex-tag tone-${it.tone}">${D.TONE[it.tone]}</span>${eatenN ? `<span class="dex-tag">你吃过 ${eatenN} 次</span>` : ''}</div></div>` +
      `<div class="dex-per">每 100 克</div><div class="dex-cells">${cell(e.k, '千卡', '热量')}${cell(e.p, 'g', '蛋白')}${cell(e.c, 'g', '碳水')}${cell(e.f, 'g', '脂肪')}</div>` +
      `<p class="dex-portion">${esc(it.portion)}大约 ${one.grams} 克：<b>${one.calories} 千卡</b>${this.isSimple() ? '' : `，蛋白 ${one.proteinG}g`}</p>` +
      (D.photoOf(it) ? `<p class="dex-credit">照片：${esc(D.photoOf(it).author || '佚名')} · ${esc(D.photoOf(it).license)} · 维基共享资源</p>` : '') +
      `<div class="dex-detail-acts"><button type="button" class="btn btn-primary btn-wide" data-put="${it.id}">放进${esc(this.dexMealLabel())}</button></div></div>`;
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
      return `<span class="dex-pick"><button type="button" data-dec="${x.id}" aria-label="少一点">−</button>${esc(it.name)} ${esc(D.amountText(it, x.n))}<button type="button" data-inc="${x.id}" aria-label="多一点">+</button></span>`;
    }).join('');
    const isToday = d.date === today;
    return `<div class="dex-target"><span class="dex-target-label">搭一顿</span>` +
      `<span class="seg seg-sm">${days.map(([v, l]) => `<button type="button" class="seg-btn${d.date === v ? ' active' : ''}" data-day="${v}">${l}</button>`).join('')}</span>` +
      `<span class="seg seg-sm">${meals.map(m => `<button type="button" class="seg-btn${d.meal === m ? ' active' : ''}" data-meal="${m}">${m.replace('/补剂', '')}</button>`).join('')}</span></div>` +
      (d.tray.length ? `<div class="dex-picks">${picks}</div>` +
        `<div class="dex-sum"><b>${t.calories}</b> 千卡${this.isSimple() ? '' : ` · 蛋白 <b>${Math.round(t.proteinG)}</b>g`} · 碳水 ${Math.round(t.carbsG)}g · 脂肪 ${Math.round(t.fatG)}g</div>` +
        `<div class="dex-acts"><button type="button" class="btn" data-commit="plan">加到${esc(this.dexMealLabel())}的计划</button>` +
        (isToday ? `<button type="button" class="btn btn-primary" data-commit="log">吃了，记上</button>` : '') + '</div>'
        : `<p class="dex-empty">点上面的食物，放进${esc(this.dexMealLabel())}</p>`);
  },

  /** 往这顿里放一样（已经有了就多一份） */
  dexPut(id, n) {
    const d = this._dex;
    const it = TF.Dex.byId(id);
    if (!d || !it) return;
    const cur = d.tray.find(x => x.id === id);
    if (cur) cur.n = Math.min(10, cur.n + (n || 1));
    else d.tray.push({ id, n: n || 1 });
    window.Haptics && window.Haptics.fire('tick');
    window.Sound && window.Sound.play('blip');
    d.detail = null;
    // 小人马上说这一样
    const adv = this.dexAdvice();
    d.say = adv.text;
    this.renderDex();
  },

  /** 搭好了：加到那天那一顿的计划（只换掉那一顿的计划，别的计划不动），或者今天的直接记上 */
  dexCommit(mode) {
    const d = this._dex;
    if (!d || !d.tray.length) return;
    const meal = TF.Dex.toMeal(d.tray, d.meal);
    const label = this.dexMealLabel();
    if (mode === 'log' && d.date === getTodayDateString() && window.QuickLog && QuickLog.save) {
      const result = { dayOffset: 0, workouts: [], meals: [meal], updates: [], deletes: [], bodyWeight: null, reply: `${label}记上了`, source: 'dex', said: '图鉴：' + meal.foodSummary };
      this.closeDex();
      const batch = QuickLog.save(result, d.date);
      QuickLog.showSnack(batch, result);
      if (this.reactRecord) this.reactRecord(result, batch);
      return;
    }
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
   * 饭前（早 7～9 点、午 10:30～12 点、晚 16:30～18:30）这顿还空着、也没计划：小人挑一顿推荐给你，
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
    ]);
  },

  /**
   * 猜热量（v6.1，每天一题，日常小游戏）：从图鉴里挑一样常见的，问一份多少千卡，三个选项。
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
    })));
  },

  bindDex() {
    const ov = document.getElementById('dex-overlay');
    if (!ov) return;
    ov.addEventListener('click', (e) => {
      const d = this._dex;
      if (!d) return;
      if (e.target === ov || e.target.closest('#dex-close')) { this.closeDex(); return; }
      const b = e.target.closest('button');
      if (!b) return;
      const ds = b.dataset;
      if (ds.tab) { d.tab = ds.tab; d.detail = null; }
      else if (ds.id) { d.detail = ds.id; window.Haptics && window.Haptics.fire('tick'); }
      else if (ds.back) d.detail = null;
      else if (ds.put || ds.add) { this.dexPut(ds.put || ds.add); return; }
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
      if (ds.tab || ds.back) document.getElementById('dex-body').scrollTop = 0;
    });
  }
});
