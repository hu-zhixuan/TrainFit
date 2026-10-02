/**
 * 一键记录用到的小工具：数字/文字清洗、餐次（按时间猜 / 口语叫法）、补剂营养素、猜肌群、从一句话里认体重。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  const MUSCLES = ['胸部', '背部', '腿部', '肩部', '手臂', '核心', '有氧'];
  const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐/补剂'];

  // ---------------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function cleanText(s, maxLen) {
    return String(s == null ? '' : s)
      .replace(/[<>"'`&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen || 40);
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function mealTypeByHour(hour) {
    if (hour >= 4 && hour < 10) return '早餐';
    if (hour >= 10 && hour < 15) return '午餐';
    if (hour >= 17 && hour < 21) return '晚餐';
    return '加餐/补剂';
  }

  // 口语里的吃饭时间 → 餐次
  const MEAL_WORDS = {
    早上: '早餐', 早晨: '早餐', 早饭: '早餐', 早餐: '早餐', 今早: '早餐',
    中午: '午餐', 午饭: '午餐', 中饭: '午餐', 午餐: '午餐',
    晚上: '晚餐', 晚饭: '晚餐', 晚餐: '晚餐', 傍晚: '晚餐', 昨晚: '晚餐', 今晚: '晚餐',
    下午茶: '加餐/补剂', 夜宵: '加餐/补剂', 宵夜: '加餐/补剂', 睡前: '加餐/补剂', 半夜: '加餐/补剂',
    练完: '加餐/补剂', 练后: '加餐/补剂', 加餐: '加餐/补剂', 零食: '加餐/补剂', 补剂: '加餐/补剂'
  };
  const MEAL_WORDS_RE = new RegExp(Object.keys(MEAL_WORDS).sort((a, b) => b.length - a.length).join('|'), 'g');

  /** 大模型写的餐次（「早饭」「夜宵」…）换成标准叫法；认不出返回 '' */
  function normMealType(s) {
    s = cleanText(s, 8);
    if (MEAL_TYPES.includes(s)) return s;
    if (MEAL_WORDS[s]) return MEAL_WORDS[s];
    const m = s.match(MEAL_WORDS_RE);
    return m ? MEAL_WORDS[m[0]] : '';
  }

  /** 一句话里按顺序说到的吃饭时间，每个餐次只留第一次：[{word:'早上',type:'早餐'}, …] */
  function mealTimes(text) {
    const out = [];
    (String(text || '').match(MEAL_WORDS_RE) || []).forEach(w => {
      if (!out.some(o => o.type === MEAL_WORDS[w])) out.push({ word: w, type: MEAL_WORDS[w] });
    });
    return out;
  }

  /** 按说到的吃饭时间把原话切段，第一个时间词前面的话算第一段：[{type:'早餐', text:'今天早上吃了…'}, {type:'晚餐', text:'晚上…'}] */
  function mealSegments(text) {
    const s = String(text || '');
    const hits = Array.from(s.matchAll(MEAL_WORDS_RE));
    return hits.map((m, i) => ({ type: MEAL_WORDS[m[0]], text: s.slice(i ? m.index : 0, i + 1 < hits.length ? hits[i + 1].index : s.length) }));
  }

  // ---------------------------------------------------------------------------
  // 补剂里的营养素：只认这几种，单位固定；ul 是每天可耐受最高摄入量（中国居民膳食营养素参考摄入量 2023，
  // 镁取美国 IOM 对补剂的上限 350mg，EPA+DHA 取 EFSA 的 5g），超过就在健康度里扣分
  // ---------------------------------------------------------------------------
  const NUTRIENTS = {
    'EPA+DHA': { unit: 'mg', ul: 5000 },
    '维生素D': { unit: 'μg', ul: 50 },
    '维生素C': { unit: 'mg', ul: 2000 },
    '维生素A': { unit: 'μg', ul: 3000 },
    '维生素E': { unit: 'mg', ul: 700 },
    '维生素B6': { unit: 'mg', ul: 60 },
    '叶酸': { unit: 'μg', ul: 1000 },
    '钙': { unit: 'mg', ul: 2000 },
    '镁': { unit: 'mg', ul: 350 },
    '锌': { unit: 'mg', ul: 40 },
    '铁': { unit: 'mg', ul: 42 },
    '硒': { unit: 'μg', ul: 400 }
  };
  const NUTRIENT_ALIAS = { 'DHA+EPA': 'EPA+DHA', 'omega-3': 'EPA+DHA', 'Omega-3': 'EPA+DHA', 'ω-3': 'EPA+DHA', '维D': '维生素D', '维C': '维生素C', '维A': '维生素A', '维E': '维生素E', 'VD': '维生素D', 'VC': '维生素C' };

  /** 大模型给的 {"钙":600,"维生素D":10,…} → 只留认识的、数值合理的 */
  function cleanNutrients(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const out = {};
    Object.keys(obj).forEach(k0 => {
      const k = NUTRIENTS[k0] ? k0 : NUTRIENT_ALIAS[String(k0).trim()];
      const v = num(obj[k0]);
      if (k && v !== null && v > 0 && v < 1e6) out[k] = round1((out[k] || 0) + v);
    });
    return Object.keys(out).length ? out : null;
  }

  /** 「钙 600mg · 维生素D 10μg」 */
  function nutrientsText(n, max) {
    const keys = Object.keys(n || {});
    const parts = keys.slice(0, max || keys.length).map(k => `${k} ${round1(n[k])}${(NUTRIENTS[k] || {}).unit || ''}`);
    return parts.join(' · ') + (max && keys.length > max ? ' …' : '');
  }

  // ---------------------------------------------------------------------------
  // 体重：「体重62.5」「今天称了124斤」「61.8」
  // ---------------------------------------------------------------------------
  /** 没说单位时：用上次体重判断是公斤还是斤（中国人常说斤） */
  function toKg(v, unit, lastKg) {
    if (!Number.isFinite(v)) return null;
    let kg;
    if (/公斤|kg|千克/i.test(unit || '')) kg = v;
    else if (/斤/.test(unit || '')) kg = v / 2;
    else if (lastKg) kg = Math.abs(v / 2 - lastKg) < Math.abs(v - lastKg) ? v / 2 : v;
    else kg = v > 150 ? v / 2 : v;
    kg = Math.round(kg * 10) / 10;
    return kg >= 25 && kg <= 300 ? kg : null;
  }

  /** 整句话只是在报体重：不用等大模型，直接记 */
  function quickWeight(text, lastKg) {
    // 语音识别会加标点（「称了一下，61.8公斤。」）：句中的逗号、空格去掉，句尾标点去掉
    const s = String(text || '').trim().replace(/[，,、\s]+/g, '').replace(/[。.!！~～]+$/, '');
    const m = s.match(/^(?:今天|今早|早上|早晨|刚才|刚刚)?\s*(?:的)?\s*(体重|称了?一?下|称了|称重|上秤)?\s*(?:是|为|有|了)?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(斤|公斤|kg|KG|千克)?$/);
    if (!m) return null;
    return toKg(parseFloat(m[2]), m[3], lastKg);
  }

  /** 一句话里提到体重（离线兜底用） */
  function findWeight(text, lastKg) {
    const m = String(text || '').match(/(?:体重|称了?一?下|称了|称重|上秤)[^\d]{0,4}(\d{2,3}(?:\.\d{1,2})?)\s*(斤|公斤|kg|KG|千克)?/);
    return m ? toKg(parseFloat(m[1]), m[2], lastKg) : null;
  }

  function guessMuscle(name) {
    const n = name || '';
    if (/跑|骑|单车|椭圆|跳绳|游泳|快走|爬坡|划船机|有氧|HIIT|楼梯/i.test(n)) return '有氧';
    if (/卧推|夹胸|飞鸟|俯卧撑|胸/.test(n)) return '胸部';
    if (/引体|划船|下拉|硬拉|背/.test(n)) return '背部';
    if (/蹲|腿|臀|箭步|提踵/.test(n)) return '腿部';
    if (/推举|侧平举|肩|面拉/.test(n)) return '肩部';
    if (/弯举|二头|三头|臂屈伸|下压/.test(n)) return '手臂';
    if (/卷腹|平板|腹|核心/.test(n)) return '核心';
    return '胸部';
  }

  /**
   * 听着像在提问 / 要建议（「给我定一下明天的食谱」「今天还差多少蛋白」「能不能吃火锅」）：
   * 小人马上说「我想想…」，不用等大模型回来才知道。只是猜，猜错了也没关系（大模型回来照常处理）
   */
  function looksLikeQuestion(text) {
    const t = String(text || '');
    if (/[？?]\s*$/.test(t)) return true;
    return /给我(定|制定|安排|推荐|出|做|列|想)|帮我(定|制定|安排|推荐|想|规划|看看)|(制定|安排|规划|推荐)(一下)?(明天|后天|今晚|晚上|下周|一周|一天)|(吃|练)点?(什么|啥)|该(吃|练)|(还)?(差|剩)多少|还能吃|能不能|可不可以|要不要|怎么(吃|喝|练|做|办|样)|有什么(建议|推荐)|食谱|菜谱|训练计划|健身计划|上(周|个月|一周)|这(周|个月)|几(次|天|顿|公斤|斤)|多少(次|天|斤|公斤|克|热量|卡)|哪(天|顿|个动作)|最(好|重|多|少)(的|是)|吗[。！!]?\s*$/.test(t);
  }

  /**
   * 手机自己就能算的问题（「还差多少蛋白」「还能吃多少」「卧推最好多少」「这周练了几次」）：不问大模型，马上答。
   * 只认整句都是这个意思的（去掉语气词以后从头到尾对得上），又记又问、问建议的都交给大模型。
   * @param names 记过的动作名（认「卧推最好多少」里的卧推）
   * @returns {{kind, name?, span?}} 或 null
   */
  function quickIntent(text, names) {
    let t = String(text || '').toLowerCase()
      .replace(/[\s，。,.!！？?、~～…]+/g, '')
      .replace(/我操|卧槽|嗯+|呃+|啊|呀|吧|呢|哈|那个|就是|请问|小人|告诉我|帮我(看看|查查|算算|看一下|查一下|算一下)?|你(说)?|现在|目前|一下/g, '');
    // 动作名：「卧推」能对上「杠铃卧推」
    const list = [];
    (names || []).forEach(n => {
      list.push([n, n]);
      const short = n.replace(/^(杠铃|哑铃|器械|史密斯|坐姿|站姿|绳索)/, '');
      if (short !== n && short.length >= 2) list.push([short, n]);
    });
    list.sort((a, b) => b[0].length - a[0].length);
    const hit = list.find(([k]) => t.includes(k.toLowerCase()));
    if (hit) t = t.replace(hit[0].toLowerCase(), '§');
    const R = (re) => re.test(t);
    if (hit && (R(/^我?的?§的?(最好|最重|最大|记录|pr|上次|上一次)(的?成绩|的?重量|是|练了|做了)?(多少|几公斤|几kg|多重)?了?$/) ||
        R(/^我?(上次|上一次)§(练了|做了|是|用了)?(多少|几公斤|多重)(公斤|kg)?$/))) return { kind: 'lift', name: hit[1] };
    if (hit && R(/^§(下次|下一次)(该|要|应该)?(练|做|用)?(多少|多重|几公斤)(公斤|kg)?$/)) return { kind: 'lift', name: hit[1] };
    if (hit) return null;
    if (R(/^(今天)?我?的?蛋白质?(还)?(差|剩|缺|吃了|够了没|够了吗|够不够|够没够|多少了|有多少)(多少|几克)?了?(吗)?$/) ||
        R(/^(今天)?(还)?(差|缺|剩)(多少|几克)蛋白质?了?$/)) return { kind: 'protein' };
    if (R(/^(今天)?(我)?(还)?(能|可以)吃多少(热量|卡|大卡|千卡|kcal)?了?$/) || R(/^(今天)?(还)?剩(多少|几)(热量|卡|大卡|千卡|kcal)?了?$/) ||
        R(/^(今天)?我?(已经)?吃了多少(热量|卡|大卡|千卡|kcal)?了?$/) || R(/^(今天)?(我)?(吃|热量)超了?(没|吗|没有)$/) ||
        R(/^(今天)?热量(还)?(剩|差)?多少了?$/)) return { kind: 'kcal' };
    if (R(/^(今天)?的?(热量)?赤字(是|有)?(多少|够不够|够了吗|够了没)了?$/)) return { kind: 'deficit' };
    if (R(/^我?的?(最近|最新)?体重(是|有)?多少了?$/) || R(/^体重(变化|怎么样|有变化吗)$/)) return { kind: 'weight', span: 7 };
    const sp = /这个月|本月|一个月|这一个月/.test(t) ? 30 : 7;
    if (R(/^(我)?(这周|本周|这个星期|这礼拜|最近一周|这几天|最近|这个月|本月|一个月|这一个月)?(瘦|胖|掉|涨|轻|重)了(多少|几)(斤|公斤|kg)?了?$/)) return { kind: 'weight', span: sp };
    if (R(/^我?(已经)?连续(记|打卡|记录)了?(几|多少)天了?$/) || R(/^我?(一共)?(记|记录)了(几|多少)天了?$/)) return { kind: 'streak' };
    if (R(/^我?(这周|本周|这个星期|这礼拜|最近一周|这个月|本月)练了(几|多少)(次|天)了?$/)) return { kind: 'trains', span: sp };
    return null;
  }

  Object.assign(TF, { MUSCLES, MEAL_TYPES, num, cleanText, round1, mealTypeByHour, normMealType, mealTimes, mealSegments, NUTRIENTS, cleanNutrients, nutrientsText, toKg, quickWeight, findWeight, guessMuscle, looksLikeQuestion, quickIntent });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
