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
    return /给我(定|制定|安排|推荐|出|做|列|想)|帮我(定|制定|安排|推荐|想|规划|看看)|(制定|安排|规划|推荐)(一下)?(明天|后天|今晚|晚上|下周|一周|一天)|(吃|练)点?(什么|啥)|该(吃|练)|(还)?(差|剩)多少|还能吃|能不能|可不可以|要不要|怎么(吃|练|办|样)|有什么(建议|推荐)|食谱|菜谱|训练计划|健身计划|吗[。！!]?\s*$/.test(t);
  }

  Object.assign(TF, { MUSCLES, MEAL_TYPES, num, cleanText, round1, mealTypeByHour, normMealType, mealTimes, mealSegments, NUTRIENTS, cleanNutrients, nutrientsText, toKg, quickWeight, findWeight, guessMuscle, looksLikeQuestion });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
