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
    return /给我(定|制定|安排|推荐|出|做|列|想)|帮我(定|制定|安排|推荐|想|规划|看看)|(制定|安排|规划|推荐)(一下)?(明天|后天|今晚|晚上|下周|一周|一天)|(吃|练)点?(什么|啥)|该(吃|练)|(还)?(差|剩)多少|还能吃|能不能|可不可以|要不要|怎么(吃|喝|练|做|办|样)|给我排|帮我排|够不够|多不多|(练|吃|喝)多少|咋(行|办|样|整|弄|吃|喝|练|回事|没|不)|为(啥|什么)|行不行|好不好|有什么(建议|推荐)|食谱|菜谱|训练计划|健身计划|上(周|个月|一周)|这(周|个月)|几(次|天|顿|公斤|斤)|多少(次|天|斤|公斤|克|热量|卡)|哪(天|顿|个动作)|最(好|重|多|少)(的|是)|吗[。！!]?\s*$/.test(t);
  }

  /**
   * 问的是以前的事（「上周练了几次」「最近瘦了多少」「哪天吃得最多」）：要把最近两周一天一行带给大模型。
   * 别的问题（「明天吃啥」「腿怎么练」）带一行画像就够了，省 token、也快。
   */
  /** 这句话里说没说重量（「80公斤」「一百斤」「自重」）：没说的话，记下的重量是按上次 / 常见估的 */
  function saidWeight(text) {
    return /(\d+(\.\d+)?|[一二两三四五六七八九十百半]+)\s*(公斤|kg|千克|斤|磅|lb)|自重|空杆|徒手/i.test(String(text || ''));
  }

  function needsHistory(text) {
    return /上(周|个?星期|个?礼拜|个?月|次|回)|这(周|星期|礼拜|个月|几天|段时间|阵子)|本(周|月)|最近|近(期|来|一周|两周|几天)|哪(天|一天|顿|次|回)|几(次|天|顿|回)|多少(天|次|回)|瘦了|胖了|轻了|重了|涨了|降了|掉了|长了|变化|趋势|以前|之前|昨天|前天|平均|一直|每天|天天|那天|连续|进步|退步|停滞|平台期|卡住|够不够|多不多/.test(String(text || ''));
  }

  /**
   * 「不要米饭，换成红薯」「蛋白再多点」「晚上少吃点」「深蹲换成腿举」：像在改小人刚给的计划（不是报吃了练了什么、不是改记录）。
   * 只在刚给过计划时用（v5.5）
   */
  function looksLikePlanEdit(text) {
    const t = String(text || '');
    if (/(吃|喝|练|跑|做|骑|游|走)了(?!几|多少|啥|什么|没)|刚才|刚刚|今天|昨|前天|体重|称了|删|记错|撤销|挪/.test(t)) return false;
    return /不要|不想|别(放|吃|喝|排|练|加)|换成|换个|换一|换掉|改成|改一|(多|少)(吃|喝|练|放|来|做)?(一)?(点|些)|再(多|少|加|来|轻|重)|加(一)?点|减(一)?点|去掉|太(多|少|重|轻|油|辣|甜|难)/.test(t);
  }

  /** 待整理的这句只是在问（「晚上吃点啥」）、在改小人给的计划、在跟小人聊天：没整理出来也不留「没整理好」卡片，小人气泡里能重试 */
  function noCard(p) {
    return !!(p && p.ask && (p.plan || p.chat || pureQuestion(p.text)));
  }

  /**
   * 在跟小人聊天、说心情（「今天好累」「你在干嘛」「谢谢你」「晚安」），不是报吃了练了啥、也不是问吃和练的事（v5.8）。
   * v6.3 起工作、学习、感情、爱好、随便问它的问题也算（聊什么都行），正在聊的时候不是记录的话都算。
   * 走聊天：小人用自己的性格接话，不出「正在整理」卡片。宁可漏判（漏了照常走整理），不能把记录当成聊天吃掉：
   * 说了吃了 / 练了 / 数量 / 体重、提到吃的练的东西，一律不算聊天。
   * name：小人的名字（「阿肌你在吗」）；inThread：刚才正在聊（15 分钟内），「还行」「嗯」这种接话也算
   */
  function looksLikeChat(text, name, inThread) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 80) return false;
    // 「不想练了」「没吃」「懒得动」：没做的事，去掉再看
    const t = raw.replace(/(不想|不要|不能|不敢|没有?|懒得|别|不)(去)?(吃|喝|练|跑|做|运动|健身|动(?!力))(饭|东西)?了?/g, '')
      // 带着「面」「果」「蛋」但不是吃的词（v6.3：「明天面试好紧张」以前被当成吃了面）
      .replace(/面试|[一二三四终]面(?![条包粉])|见面|面对|面子|表面|方面|里面|外面|上面|下面|前面|后面|面膜|面前|全面|当面|会面|面临|笨蛋|坏蛋|滚蛋|完蛋|肉麻|菜鸟|太菜|结果|如果|果然|效果|成果|后果|奶奶|酒店|摸鱼|鸡汤|鸡血/g, '');
    if (/(吃|喝|练|跑|做|骑|游|走|撸)(了|完)(?!几|多少|啥|什么)|体重|称了|\d|[一两二三四五六七八九十半几]\s*(碗|杯|个|片|块|根|勺|份|盘|组|次|公斤|斤|克|分钟|小时|公里|瓶|袋|包)/.test(t)) return false;
    // 在改记录（「删掉刚才那条」「改成昨天的」「帮我记一下」）：正在聊也交给整理
    if (/改成|改为|改一下|删掉|删了|删除|去掉|撤销|撤回|记一下|记上|帮我记|挪到|移到|补记|补一下/.test(raw)) return false;
    const you = new RegExp(`(你|小练|江叙|阿叙|夏柚|柚子${name ? '|' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''})你?(是谁|叫什么|几岁|多大|喜欢|在干|在做|会不会|觉得我|累不累|饿不饿|吃饭了|睡了|想不想|怎么样|好吗|在吗|还在|开心吗|呢)`);
    const fit = /(吃|喝|练)(点)?(什么|啥)|食谱|菜谱|计划|蛋白|热量|卡路里|千卡|大卡|碳水|脂肪|减脂|增肌|动作|训练|饮食|排(一下|个)|怎么(吃|练|减|瘦)/;
    // 问小人自己的事（「你在干嘛」「你喜欢吃什么」）；问的是自己吃练（「你觉得我明天练什么」）的不算
    if (you.test(raw) && !(fit.test(t) && /我/.test(t))) return true;
    // 提到吃的、练的东西（「好累，早餐包子豆浆」）：交给整理，别漏记
    if (/早餐|午餐|晚餐|早饭|午饭|晚饭|宵夜|夜宵|加餐|饭|面|粥|包子|馒头|饺子|蛋|奶|豆浆|咖啡|奶茶|肉|鸡|鱼|虾|菜|果|沙拉|面包|汉堡|披萨|火锅|烧烤|零食|可乐|酒|卧推|深蹲|硬拉|跑步|有氧|瑜伽|游泳|俯卧撑|引体|跳绳|骑车|散步|步数/.test(t)) return false;
    // 问吃和练的事：交给整理（能排计划、算热量）
    if (fit.test(t)) return false;
    const feel = /累|困|乏|烦|压力|难受|不舒服|开心|高兴|郁闷|焦虑|emo|失眠|睡不着|无聊|心情|难过|伤心|生气|委屈|崩溃|孤单|孤独|寂寞|想哭|哭了|丧|紧张|害怕|担心|没动力|不想动|坚持不下去|放弃|好胖|好丑|自卑|讨厌自己|不想活|撑不住/i;
    const social = /^(嗨|hi|hello|哈喽|你好|早安|早上好|午安|晚安|晚上好|在吗|在不在|在嘛|谢谢|谢了|多谢|辛苦了|哈哈|嘿嘿|嘻嘻|么么|抱抱|摸摸)/i;
    const about = /陪我|聊聊|聊天|说说话|想你|爱你|喜欢你|讨厌你|笨蛋|夸夸我|安慰我|骂我|鼓励我/;
    const reply = /^(还行|还好|一般般?|没事|随便|算了|不知道|是吗|真的吗?|对|对啊|是的|好吧|行吧|好的?|行|嗯+|哦+|噢|哈+|没有|有啊?|不是)[。！!~～…，,啊呀吧呢]*$/;
    // v6.3 聊什么都行：工作、学习、感情、家里、爱好、天气……不是吃和练的事，都交给小人聊（上面已经把记录、问吃练的排除了）
    const life = /工作|上班|下班|加班|老板|领导|同事|公司|项目|面试|辞职|跳槽|工资|实习|考试|考研|考公|学习|作业|论文|期末|上课|老师|同学|室友|朋友|闺蜜|兄弟|对象|男朋友|女朋友|男友|女友|老公|老婆|喜欢的人|暗恋|表白|分手|恋爱|约会|相亲|结婚|爸|妈|家里|孩子|猫|狗|电影|电视剧|追剧|综艺|游戏|小说|音乐|唱歌|旅游|旅行|出差|下雨|天气|放假|周末|假期|生日|礼物|房租|搬家|看病|医院|感冒|发烧|头疼|牙疼/;
    // 随便问它一个问题（「地球为什么是圆的」「怎么跟老板提加薪」），不是问吃和练的
    const ask = (looksLikeQuestion(raw) || /^(推荐|介绍|讲讲|说说|教我|帮我想|给我讲)/.test(raw)) && !/练|健身|动作|器械|减|增肌|瘦|胖|体重|体脂|肌|吃|喝|饭|餐|食|蛋白|热量|卡|碳水|脂肪|饿|饱|记|计划/.test(raw);
    return feel.test(raw) || social.test(raw) || about.test(raw) || life.test(raw) || ask || (reply.test(raw) && (inThread || raw.length <= 4)) ||
      inThread; // 正在聊（15 分钟内）：只要不是在报吃了练了什么（上面已经排除），都接着聊
  }

  /**
   * 聊天里说到的「过几天会有结果的事」（v6.3）：「周五我有个面试」→ { t: '周五面试', d: 4 }（事情过后一天问问）。
   * 大模型聊天时会输出 life，但真实 Atria 实测「周五我有个面试，有点紧张」2/2 没给，所以本机也认一遍，没给就用这个。
   * 已经过去的（「昨天面试了」「刚考完」）过三天问结果；没说哪天的过两天问。认不出返回 null。
   * now：现在（测试用）
   */
  const LIFE_EVENT = /面试|笔试|复试|考试|考研|考公|期末|四六级|答辩|体检|复查|看病|手术|拔牙|出差|旅游|旅行|约会|相亲|见家长|比赛|马拉松|演出|汇报|述职|搬家|入职|报到|开学|婚礼|deadline|ddl/i;
  function lifeEvent(text, now) {
    const raw = String(text || '');
    const m = raw.match(LIFE_EVENT);
    if (!m) return null;
    const ev = m[0];
    now = now || new Date();
    const WK = '日一二三四五六天';
    let when = '', days = -1;
    const past = /昨天|前天|上周|上个?星期|刚刚?|已经|完了|过了|结束了|考完|面完/.test(raw);
    let w;
    if ((w = raw.match(/(下+)?(个)?(周|星期|礼拜)([一二三四五六日天])/))) {
      // 按自然周算（周一开头）：「周五」今天已经过了就是下周五；「下周三」是下一个自然周的周三
      const mon = (x) => (x + 6) % 7;
      const target = mon(WK.indexOf(w[4]) % 7), today = mon(now.getDay());
      const next = (w[1] || '').length;
      days = next ? 7 * next - today + target : target >= today ? target - today : target - today + 7;
      when = `${w[1] || ''}${w[3] === '周' ? '周' : w[3]}${w[4]}`;
    } else if ((w = raw.match(/(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[号日]/))) {
      const n = /\d/.test(w[1]) ? +w[1] : cnDay(w[1]);
      if (n >= 1 && n <= 31) {
        const d = new Date(now.getFullYear(), now.getMonth(), n);
        if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setMonth(d.getMonth() + 1);
        days = Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
        when = `${d.getMonth() + 1}月${d.getDate()}日`;
      }
    } else if ((w = raw.match(/大后天|后天|明天|明早|明晚|今天|今晚|下午|晚上|下周|下个?星期|下个月|月底/))) {
      days = { 大后天: 3, 后天: 2, 明天: 1, 明早: 1, 明晚: 1, 今天: 0, 今晚: 0, 下午: 0, 晚上: 0, 下周: 7, 下星期: 7, 下个星期: 7, 下个月: 14, 下月: 14, 月底: 10 }[w[0]];
      if (/下周|下个?星期|下个?月|月底/.test(w[0])) when = w[0];
    }
    const t = (when + ev).slice(0, 12);
    if (past) return { t, d: 3 };
    return { t, d: days < 0 ? 2 : Math.max(1, Math.min(14, days + 1)) };
  }

  function cnDay(s) {
    const D = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (s === '十') return 10;
    if (s[0] === '十') return 10 + (D[s[1]] || 0);
    if (s.length === 3 && s[1] === '十') return D[s[0]] * 10 + (D[s[2]] || 0);
    if (s.length === 2 && s[1] === '十') return D[s[0]] * 10;
    return D[s] || 0;
  }

  /**
   * 只是在问、没在报吃了练了什么（「晚上吃点啥」「上周练了几次」）。
   * 「中午吃了牛肉面，晚上吃点啥」这种又记又问的不算——它没整理完时要留卡片，免得记录丢了。
   */
  function pureQuestion(text) {
    const t = String(text || '');
    if (!looksLikeQuestion(t)) return false;
    return !/(吃|喝|练|跑|做|骑|游|走)了(?!几|多少|啥|什么|没)|体重\s*\d|称了|\d+(\.\d+)?\s*(克|g|公斤|kg|斤|组|个|次|分钟|碗|杯|片|块|根|勺|毫升|ml)/i.test(t);
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

  Object.assign(TF, { MUSCLES, MEAL_TYPES, num, cleanText, round1, mealTypeByHour, normMealType, mealTimes, mealSegments, NUTRIENTS, cleanNutrients, nutrientsText, toKg, quickWeight, findWeight, guessMuscle, looksLikeQuestion, looksLikePlanEdit, looksLikeChat, lifeEvent, LIFE_EVENT, pureQuestion, noCard, needsHistory, saidWeight, quickIntent });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
