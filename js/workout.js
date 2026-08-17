/**
 * 练食AI · 高精度训练动作/组数/次数/重量精准语音解析引擎 (v1.1.2)
 * 支持：健身同音词纠错、活跃To-Do上下文偏置、Levenshtein模糊匹配、4要素缺失校验与多轮增量合并
 */

// 1. 健身语音同音词与口喷纠错映射矩阵 (FITNESS_HOMOPHONE_MAP)
const FITNESS_HOMOPHONE_MAP = [
  // 卧推 / 推胸类
  { pattern: /(?:卧腿|我推|卧退|平推|平胸推)/g, replacement: "卧推" },
  { pattern: /(?:上斜推|上邪推|斜推)/g, replacement: "上斜卧推" },
  { pattern: /(?:蝴蝶机夹胸|蝴蝶夹胸|蝴蝶机|大飞鸟|龙门架夹胸)/g, replacement: "绳索夹胸" },

  // 划船 / 下拉类
  { pattern: /(?:划川|划穿|划串|划床|花船)/g, replacement: "划船" },
  { pattern: /(?:高位下啦|高危下拉|告慰下拉|下拉背|宽握下啦)/g, replacement: "高位下拉" },

  // 硬拉类
  { pattern: /(?:硬啦|硬辣|硬落|硬纳|因拉)/g, replacement: "硬拉" },
  { pattern: /(?:直腿硬啦|直腿硬辣|罗马尼亚硬啦)/g, replacement: "罗马尼亚硬拉" },

  // 深蹲 / 腿举类
  { pattern: /(?:深登|神蹲|深顿|生蹲|蹲起)/g, replacement: "深蹲" },
  { pattern: /(?:后登|后顿)/g, replacement: "后蹲" },
  { pattern: /(?:前登|前顿)/g, replacement: "前蹲" },
  { pattern: /(?:倒登|导蹬|到蹬|导凳|倒凳)/g, replacement: "倒蹬" },
  { pattern: /(?:哈克蹲|哈克深登)/g, replacement: "哈克深蹲" },

  // 肩部 / 推举 / 侧平举类
  { pattern: /(?:侧平局|侧凭举|侧凭局|侧平聚|侧平巨)/g, replacement: "侧平举" },
  { pattern: /(?:面啦|面辣|绳索面啦)/g, replacement: "面拉" },
  { pattern: /(?:推巨|推局|肩推举|军推)/g, replacement: "推举" },

  // 手臂 / 弯举 / 臂屈伸类
  { pattern: /(?:二头弯局|二头完举|弯局|玩举)/g, replacement: "二头弯举" },
  { pattern: /(?:三头下压|三头虾压|三头压)/g, replacement: "三头肌绳索下压" },
  { pattern: /(?:双杆臂屈伸|双杠臂屈身|双杠臂曲伸|臂屈身|臂曲伸)/g, replacement: "双杠臂屈伸" },

  // 引体向上
  { pattern: /(?:引体向尚|影体向上|硬体向上|引体向深)/g, replacement: "引体向上" },

  // 器械 / 器具 / 杂音
  { pattern: /(?:杠玲|钢铃|钢玲|杠令)/g, replacement: "杠铃" },
  { pattern: /(?:鸭铃|压铃|雅铃|哑令)/g, replacement: "哑铃" },
  { pattern: /(?:史密斯|十米思|使密斯|石密斯)/g, replacement: "史密斯" }
];

/**
 * 快速 Levenshtein 编辑距离算法
 */
function levenshteinDistance(s1, s2) {
  if (!s1 || !s2) return (s1 || s2 || "").length;
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * 计算两个中文字符串相似度 (0.0 ~ 1.0)
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  }
  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen > 0 ? Math.max(0, 1.0 - dist / maxLen) : 0;
}

/**
 * 健身同音词与口语表达前置归一化
 */
function normalizeFitnessSpeech(text) {
  if (!text) return "";
  let s = ("" + text).trim();

  // 1. 口语化数字与特定短语模式替换
  // "四组八哥" -> "4组8个", "八哥" -> "8个"
  s = s.replace(/([0-9零一二两俩三四五六七八九十]+)\s*组\s*八哥/g, (m, g1) => {
    const num = parseChineseUniversalNum(g1);
    return `${num !== null ? num : g1}组8个`;
  });
  s = s.replace(/八哥/g, "8个");
  
  // "做4组把个" / "做把个" / "搞把个" / "把个" / "把次" / "把下" -> 8个/8次/8下
  s = s.replace(/(?:做了|做|来|搞|推了|蹲了|拉了)\s*把\s*(?:个|次|下)/g, "做8个");
  s = s.replace(/(?:做了|做|来|搞|推了|蹲了|拉了)\s*把/g, "做8个");
  s = s.replace(/([0-9零一二两俩三四五六七八九十]+)\s*组\s*把\s*(个|次|下)?/g, (m, g1) => {
    const num = parseChineseUniversalNum(g1);
    return `${num !== null ? num : g1}组8个`;
  });
  s = s.replace(/把\s*(个|次|下)/g, "8$1");

  // "俩组" -> "2组", "俩个" -> "2个", "俩次" -> "2次", "俩下" -> "2下"
  s = s.replace(/俩\s*组/g, "2组");
  s = s.replace(/俩\s*个/g, "2个");
  s = s.replace(/俩\s*次/g, "2次");
  s = s.replace(/俩\s*下/g, "2下");
  s = s.replace(/双\s*组/g, "2组");

  // "四个八" -> "4组8个", "4个8" -> "4组8个", "4个10" -> "4组10个"
  s = s.replace(/([0-9零一二两俩三四五六七八九十]+)\s*个\s*([0-9零一二两俩三四五六七八九十]+)/g, (m, g1, g2) => {
    const n1 = parseChineseUniversalNum(g1);
    const n2 = parseChineseUniversalNum(g2);
    return `${n1 !== null ? n1 : g1}组${n2 !== null ? n2 : g2}个`;
  });

  // 2. 应用同音词替换矩阵
  for (const item of FITNESS_HOMOPHONE_MAP) {
    s = s.replace(item.pattern, item.replacement);
  }

  return s;
}

// Universal high-precision Chinese & Arabic numeral parser
function parseChineseUniversalNum(str) {
  if (!str) return null;
  str = ("" + str).trim();
  if (!str) return null;

  if (str === "半") return 0.5;
  if (str === "俩" || str === "双") return 2;

  // Pure digits and optional decimal
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(str)) {
    return parseFloat(str);
  }

  // Handle "点" or "." (e.g. "两点五", "八十二点五", "2点5", "0点5", "82.5")
  if (str.includes("点") || (str.includes(".") && !/^[0-9]+(?:\.[0-9]+)?$/.test(str))) {
    const parts = str.split(/[点.]/);
    const intPart = parseChineseUniversalNum(parts[0]) || 0;
    let decStr = parts[1];
    let decVal = 0;
    if (/^[0-9]+$/.test(decStr)) {
      decVal = parseFloat("0." + decStr);
    } else {
      const chDigits = { '零': '0', '一': '1', '二': '2', '两': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9' };
      let dStr = "";
      for (const ch of decStr) {
        if (chDigits[ch] !== undefined) dStr += chDigits[ch];
        else if (/[0-9]/.test(ch)) dStr += ch;
      }
      decVal = dStr.length > 0 ? parseFloat("0." + dStr) : 0;
    }
    return intPart + decVal;
  }

  const digits = {
    '零': 0, '一': 1, '二': 2, '两': 2, '俩': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
  };

  // Single digit
  if (str.length === 1 && digits[str] !== undefined && digits[str] > 0) {
    return digits[str];
  }

  let total = 0;
  let section = 0;
  let currentDigit = null;
  let lastUnit = null;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '零') {
      currentDigit = 0;
      lastUnit = null;
    } else if (digits[ch] !== undefined) {
      currentDigit = digits[ch];
    } else if (/[0-9]/.test(ch)) {
      let numBuf = "";
      while (i < str.length && /[0-9.]/.test(str[i])) {
        numBuf += str[i];
        i++;
      }
      i--;
      currentDigit = parseFloat(numBuf);
    } else if (ch === '十') {
      const num = currentDigit !== null ? currentDigit : 1;
      section += num * 10;
      currentDigit = null;
      lastUnit = 10;
    } else if (ch === '百') {
      const num = currentDigit !== null ? currentDigit : 1;
      section += num * 100;
      currentDigit = null;
      lastUnit = 100;
    } else if (ch === '千') {
      const num = currentDigit !== null ? currentDigit : 1;
      section += num * 1000;
      currentDigit = null;
      lastUnit = 1000;
    } else if (ch === '万') {
      const num = currentDigit !== null ? currentDigit : 0;
      section += num;
      total += (section || 1) * 10000;
      section = 0;
      currentDigit = null;
      lastUnit = 10000;
    }
  }

  if (currentDigit !== null) {
    if (lastUnit === 100 && currentDigit > 0 && currentDigit < 10) {
      section += currentDigit * 10;
    } else if (lastUnit === 1000 && currentDigit > 0 && currentDigit < 10) {
      section += currentDigit * 100;
    } else if (lastUnit === 10000 && currentDigit > 0 && currentDigit < 10) {
      section += currentDigit * 1000;
    } else {
      section += currentDigit;
    }
  }

  total += section;
  return total > 0 ? total : (str === '0' ? 0 : null);
}

// Convert all Chinese numerals in a string into standardized Arabic digits
function normalizeTextWithNumbers(text) {
  if (!text) return "";
  let s = normalizeFitnessSpeech(text);

  // Normalize punctuation and spoken fillers
  s = s.replace(/[，、；;。！!\n\r]+/g, "，");
  s = s.replace(/(?:然后|接着|之后|再做了|再来|最后|还有|另外|顺便|换成|继续)+/g, "，");

  // Normalize self-bodyweight and empty bar
  s = s.replace(/(?:自重|徒手|不加重量|不加重|净体重)/g, " 0公斤 ");
  s = s.replace(/空杆/g, " 20公斤 ");

  // Pattern to find Chinese number phrases (e.g. "一百二十五点五", "八十", "四", "12点5")
  const chNumRegex = /([0-9]+(?:\.[0-9]+)?|[零一二两俩三四五六七八九十百千0-9]+(?:[点.][零一二三四五六七八九0-9]+)?)/g;

  s = s.replace(chNumRegex, (match) => {
    const parsed = parseChineseUniversalNum(match);
    return parsed !== null ? ` ${parsed} ` : match;
  });

  return s;
}

const EXERCISE_KNOWLEDGE_BASE = [
  { name: "杠铃卧推", aliases: ["杠铃卧推", "平板卧推", "平胸卧推", "卧推", "推胸", "卧推架"], muscle: "胸部", compound: true, minIncrement: 2.5, targetReps: 8 },
  { name: "哑铃上斜卧推", aliases: ["上斜哑铃卧推", "哑铃上斜卧推", "上斜卧推", "上斜推胸", "上斜哑铃推胸", "上斜卧推哑铃"], muscle: "胸部", compound: true, minIncrement: 2.0, targetReps: 10 },
  { name: "杠铃上斜卧推", aliases: ["杠铃上斜卧推", "上斜杠铃卧推"], muscle: "胸部", compound: true, minIncrement: 2.5, targetReps: 8 },
  { name: "双杠臂屈伸", aliases: ["双杠臂屈伸", "双杠下压", "双杠", "臂屈伸"], muscle: "胸部", compound: true, minIncrement: 2.5, targetReps: 10 },
  { name: "绳索夹胸", aliases: ["绳索夹胸", "龙门架夹胸", "夹胸", "蝴蝶机夹胸", "飞鸟"], muscle: "胸部", compound: false, minIncrement: 1.25, targetReps: 12 },
  { name: "杠铃深蹲", aliases: ["杠铃深蹲", "深蹲", "后蹲", "前蹲", "深蹲架"], muscle: "腿部", compound: true, minIncrement: 5.0, targetReps: 6 },
  { name: "倒蹬", aliases: ["倒蹬", "腿举", "哈克深蹲", "器械深蹲"], muscle: "腿部", compound: true, minIncrement: 10.0, targetReps: 10 },
  { name: "传统硬拉", aliases: ["传统硬拉", "杠铃硬拉", "硬拉", "相扑硬拉"], muscle: "背部/臀腿", compound: true, minIncrement: 5.0, targetReps: 6 },
  { name: "罗马尼亚硬拉", aliases: ["罗马尼亚硬拉", "RDL", "直腿硬拉"], muscle: "腿部", compound: true, minIncrement: 2.5, targetReps: 8 },
  { name: "腿屈伸", aliases: ["腿屈伸", "坐姿腿屈伸", "腿弯举", "俯卧腿弯举"], muscle: "腿部", compound: false, minIncrement: 2.5, targetReps: 12 },
  { name: "引体向上", aliases: ["引体向上", "引体", "正手引体", "反手引体", "助力引体"], muscle: "背部", compound: true, minIncrement: 2.5, targetReps: 8 },
  { name: "高位下拉", aliases: ["高位下拉", "下拉", "宽握下拉", "窄握下拉"], muscle: "背部", compound: true, minIncrement: 2.5, targetReps: 10 },
  { name: "杠铃划船", aliases: ["杠铃划船", "俯身划船", "划船", "T杠划船"], muscle: "背部", compound: true, minIncrement: 2.5, targetReps: 8 },
  { name: "坐姿划船", aliases: ["坐姿划船", "绳索划船", "器械划船"], muscle: "背部", compound: true, minIncrement: 2.5, targetReps: 10 },
  { name: "杠铃推举", aliases: ["杠铃推举", "推举", "肩推", "军推", "站姿推举", "坐姿推举", "肩上推举"], muscle: "肩部", compound: true, minIncrement: 2.5, targetReps: 8 },
  { name: "哑铃侧平举", aliases: ["哑铃侧平举", "侧平举", "飞鸟侧平举", "绳索侧平举"], muscle: "肩部", compound: false, minIncrement: 1.0, targetReps: 15 },
  { name: "面拉", aliases: ["面拉", "绳索面拉", "俯身飞鸟"], muscle: "肩部", compound: false, minIncrement: 1.0, targetReps: 15 },
  { name: "二头肌弯举", aliases: ["二头弯举", "二头肌弯举", "哑铃弯举", "杠铃弯举", "锤式弯举", "牧师凳弯举", "弯举"], muscle: "手臂", compound: false, minIncrement: 1.0, targetReps: 12 },
  { name: "三头肌绳索下压", aliases: ["三头下压", "绳索下压", "三头肌下压", "仰卧臂屈伸", "碎颅者"], muscle: "手臂", compound: false, minIncrement: 1.25, targetReps: 12 },
  { name: "跑步机有氧", aliases: ["跑步机", "慢跑", "跑步", "划船机", "爬楼机", "椭圆机", "单车"], muscle: "有氧", compound: false, minIncrement: 0, targetReps: 1 }
];

/**
 * 智能生成多轮追问引导文案
 */
function generateFollowUpPrompt(item) {
  if (item.isComplete) return "";

  const recognizedParts = [];
  if (item.exerciseName && item.exerciseName !== "综合力量训练") {
    recognizedParts.push(item.exerciseName);
  }
  if (item.weightKg !== null && !isNaN(item.weightKg)) {
    recognizedParts.push(item.weightKg === 0 ? "自重" : `${item.weightKg}kg`);
  }
  if (item.sets !== null && !isNaN(item.sets) && item.reps !== null && !isNaN(item.reps)) {
    recognizedParts.push(`${item.sets}组×${item.reps}次`);
  } else {
    if (item.sets !== null && !isNaN(item.sets)) recognizedParts.push(`${item.sets}组`);
    if (item.reps !== null && !isNaN(item.reps)) recognizedParts.push(`每组${item.reps}次`);
  }

  const prefix = recognizedParts.length > 0
    ? `已识别到【${recognizedParts.join(' ')}】，`
    : "已收到您的训练记录，";

  const missing = item.missingFactors || [];
  const missingTextList = [];

  if (missing.includes('exerciseName')) {
    missingTextList.push('做了哪项训练动作');
  }
  if (missing.includes('weightKg')) {
    missingTextList.push('使用了多少公斤重量（徒手/自重请说自重）');
  }
  if (missing.includes('sets') && missing.includes('reps')) {
    missingTextList.push('做了几组、每组几次');
  } else if (missing.includes('sets')) {
    missingTextList.push('一共做了几组');
  } else if (missing.includes('reps')) {
    missingTextList.push('每组做了几次');
  }

  const suffix = `请问${missingTextList.join('、')}？`;
  return `${prefix}${suffix}`;
}

const WorkoutEngine = {
  /**
   * 核心语音训练动作解析与要素提取引擎
   * @param {string} rawVoiceText 用户输入的口喷语音文本
   * @param {Object} options 可选参数：{ activeTodos?: Array, strictValidation?: boolean }
   * @returns {Array<Object>} 解析后的动作列表
   */
  parseWorkoutVoice(rawVoiceText, options = {}) {
    if (!rawVoiceText || !rawVoiceText.trim()) return [];

    // 1. 提取活跃 To-Do 清单 (Contextual Biasing)
    const activeTodos = Array.isArray(options.activeTodos) ? options.activeTodos : [];
    const activeNames = activeTodos.map(t => typeof t === 'string' ? t : (t.exerciseName || t.name || '')).filter(Boolean);

    // 2. 文本归一化与分句切割
    const normalized = normalizeTextWithNumbers(rawVoiceText);
    const segments = normalized.split(/[,，+＋]/).map(s => s.trim()).filter(s => s.length > 0);
    const results = [];

    // 3. 构建候选动作别名池 (活跃 To-Do 优先偏置排序)
    const allAliases = [];
    EXERCISE_KNOWLEDGE_BASE.forEach(item => {
      const isActive = activeNames.some(an => an === item.name || item.aliases.includes(an));
      item.aliases.forEach(alias => {
        allAliases.push({ alias, item, isActive });
      });
    });

    // 排序策略：活跃 To-Do 别名排在最前，同优先级下按别名长度降序排列（长词优先匹配）
    allAliases.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.alias.length - a.alias.length;
    });

    for (const segment of segments) {
      let exerciseName = null;
      let muscle = "胸部";
      let foundExercise = false;

      // 阶段 1: 上下文偏置与别名匹配
      // 如果存在活跃 To-Do，先检查活跃 To-Do 动作中是否存在关键词重合或完全匹配
      if (activeNames.length > 0) {
        // 1.1 活跃动作完全别名匹配
        for (const entry of allAliases) {
          if (entry.isActive && segment.includes(entry.alias)) {
            exerciseName = entry.item.name;
            muscle = entry.item.muscle;
            foundExercise = true;
            break;
          }
        }

        // 1.2 活跃动作上下文关键词偏置匹配 (如活跃 To-Do 有"哑铃上斜卧推"，口喷"推胸"优先匹配活跃动作)
        if (!foundExercise) {
          const coreKeywords = ["推胸", "卧推", "上斜", "划船", "下拉", "引体", "深蹲", "倒蹬", "硬拉", "推举", "侧平举", "弯举", "臂屈伸", "下压", "面拉"];
          for (const kw of coreKeywords) {
            if (segment.includes(kw)) {
              const activeMatch = allAliases.find(entry => entry.isActive && entry.item.aliases.some(al => al.includes(kw)));
              if (activeMatch) {
                exerciseName = activeMatch.item.name;
                muscle = activeMatch.item.muscle;
                foundExercise = true;
                break;
              }
            }
          }
        }
      }

      // 阶段 1.3: 常规别名精准匹配 (长词优先)
      if (!foundExercise) {
        for (const entry of allAliases) {
          if (segment.includes(entry.alias)) {
            exerciseName = entry.item.name;
            muscle = entry.item.muscle;
            foundExercise = true;
            break;
          }
        }
      }

      // 阶段 2: 模糊匹配与拼音/编辑距离相似度评分 (Contextual Biasing)
      if (!foundExercise) {
        let bestMatch = null;
        let highestScore = 0;

        for (const entry of allAliases) {
          const sim = calculateStringSimilarity(segment, entry.alias);
          const boostedScore = sim + (entry.isActive ? 0.25 : 0);
          if (boostedScore > highestScore && boostedScore >= 0.55) {
            highestScore = boostedScore;
            bestMatch = entry;
          }
        }

        if (bestMatch) {
          exerciseName = bestMatch.item.name;
          muscle = bestMatch.item.muscle;
          foundExercise = true;
        }
      }

      const hasNumbers = /[0-9]/.test(segment);
      let foundExplicitName = foundExercise;

      // 阶段 3: 关键字兜底与自定义动作名提取
      if (!foundExercise) {
        if (!hasNumbers) {
          // 纯聊天废话无数字 (如 "今天练了胸")，跳过
          continue;
        }

        if (segment.includes("上斜") || segment.includes("哑铃推胸")) { exerciseName = "哑铃上斜卧推"; muscle = "胸部"; foundExplicitName = true; }
        else if (segment.includes("卧推") || segment.includes("推胸")) { exerciseName = "杠铃卧推"; muscle = "胸部"; foundExplicitName = true; }
        else if (segment.includes("深蹲") || segment.includes("后蹲")) { exerciseName = "杠铃深蹲"; muscle = "腿部"; foundExplicitName = true; }
        else if (segment.includes("硬拉")) { exerciseName = "传统硬拉"; muscle = "背部/臀腿"; foundExplicitName = true; }
        else if (segment.includes("推举") || segment.includes("肩推")) { exerciseName = "杠铃推举"; muscle = "肩部"; foundExplicitName = true; }
        else if (segment.includes("划船")) { exerciseName = "杠铃划船"; muscle = "背部"; foundExplicitName = true; }
        else if (segment.includes("侧平举")) { exerciseName = "哑铃侧平举"; muscle = "肩部"; foundExplicitName = true; }
        else if (segment.includes("下拉")) { exerciseName = "高位下拉"; muscle = "背部"; foundExplicitName = true; }
        else if (segment.includes("弯举")) { exerciseName = "二头肌弯举"; muscle = "手臂"; foundExplicitName = true; }
        else if (segment.includes("臂屈伸")) { exerciseName = "双杠臂屈伸"; muscle = "胸部"; foundExplicitName = true; }
        else if (segment.includes("跑步") || segment.includes("有氧")) { exerciseName = "跑步机有氧"; muscle = "有氧"; foundExplicitName = true; }
        else {
          const cleanNameMatch = segment.match(/^([^\d\s]{2,8})/);
          if (cleanNameMatch && cleanNameMatch[1] && !/^(做|做了|来|搞|冲|练|完成了|每组|一共)/.test(cleanNameMatch[1])) {
            exerciseName = cleanNameMatch[1];
            muscle = "复合训练";
            foundExplicitName = true;
          } else {
            exerciseName = null;
            muscle = "胸部";
            foundExplicitName = false;
          }
        }
      }

      // --- 高精度提取重量、组数、次数、RPE ---
      let weightKg = null;
      let sets = null;
      let reps = null;
      let rpe = null;

      // 1. 复合连乘模式匹配 (如 "4*8", "4x10", "4乘10", "4组8个")
      const multiMatch = segment.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:[*xX乘××]|组|个)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:次|个|下|reps)?/i);
      if (multiMatch) {
        const v1 = parseFloat(multiMatch[1]);
        const v2 = parseFloat(multiMatch[2]);
        if (v1 <= 15 && v2 <= 50) {
          sets = Math.round(v1);
          reps = Math.round(v2);
        }
      }

      // 2. 显式组数模式 (如 "4组", "做4组", "4 sets")
      if (sets === null) {
        const sm = segment.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:组|组数|set|sets)/i);
        if (sm && sm[1]) {
          sets = Math.round(parseFloat(sm[1]));
        }
      }

      // 3. 显式次数模式 (如 "8次", "每组8个", "10下", "8 reps")
      if (reps === null) {
        const repPatterns = [
          /(?:每组|每组做|每组能做|各|均)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:次|个|下|reps|rep)/i,
          /(?:每组)\s*([0-9]+(?:\.[0-9]+)?)/i
        ];
        for (const rp of repPatterns) {
          const m = segment.match(rp);
          if (m && m[1]) {
            reps = Math.round(parseFloat(m[1]));
            break;
          }
        }
      }

      // 4. 显式重量模式 (如 "80公斤", "80kg", "单边24kg", "0公斤", "120千克", "80磅")
      const weightPatterns = [
        /(?:重量|重|负重|单边|每边|挂|用|上)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:公斤|kg|千克|KG|Kg)/i,
        /([0-9]+(?:\.[0-9]+)?)\s*(?:磅|lb|lbs)/i,
        /(?:重量|负重|重|用了|挂了|上了)\s*([0-9]+(?:\.[0-9]+)?)/i
      ];

      for (const wp of weightPatterns) {
        const m = segment.match(wp);
        if (m && m[1]) {
          let val = parseFloat(m[1]);
          if (segment.includes("磅") || segment.includes("lb")) val = Math.round(val * 0.453 * 10) / 10;
          weightKg = val;
          break;
        }
      }

      // 检查是否包含自重/徒手标志
      if (weightKg === null && /(?:自重|徒手|0公斤|0kg)/.test(segment)) {
        weightKg = 0.0;
      }

      // 5. 显式 RPE 模式
      const rpeMatch = segment.match(/(?:rpe|RPE|自觉强度|强度|疲劳度)\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (rpeMatch && rpeMatch[1]) {
        rpe = parseFloat(rpeMatch[1]);
      }

      // 6. 上下文未分配数字智能消歧
      const allFoundNums = [...segment.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\b/g)].map(m => parseFloat(m[1]));
      const unassignedNums = [];
      let setsAccounted = sets === null;
      let repsAccounted = reps === null;

      for (const num of allFoundNums) {
        if (!setsAccounted && num === sets) {
          setsAccounted = true;
        } else if (!repsAccounted && num === reps) {
          repsAccounted = true;
        } else if (weightKg !== null && num === weightKg) {
          // already assigned weight
        } else if (rpe !== null && num === rpe) {
          // already assigned rpe
        } else {
          unassignedNums.push(num);
        }
      }

      if (weightKg === null && unassignedNums.length > 0) {
        const heavyIdx = unassignedNums.findIndex(n => n >= 20);
        if (heavyIdx !== -1) {
          weightKg = unassignedNums[heavyIdx];
          unassignedNums.splice(heavyIdx, 1);
        }
      }

      if (sets === null && unassignedNums.length > 0) {
        const setIdx = unassignedNums.findIndex(n => n <= 10);
        if (setIdx !== -1) {
          sets = Math.round(unassignedNums[setIdx]);
          unassignedNums.splice(setIdx, 1);
        }
      }

      if (reps === null && unassignedNums.length > 0) {
        reps = Math.round(unassignedNums[0]);
        unassignedNums.splice(0, 1);
      }

      // 7. 自重动作特殊重量推断 (引体向上、双杠臂屈伸若未提供重量默认自重 0.0kg)
      if (weightKg === null && exerciseName && (exerciseName.includes("自重") || exerciseName.includes("引体") || exerciseName.includes("双杠"))) {
        weightKg = 0.0;
      }

      // 8. 缺失要素校验与完整性判定
      const missingFactors = [];
      if (!exerciseName || (!foundExplicitName && exerciseName === "综合力量训练")) {
        missingFactors.push('exerciseName');
      }
      if (weightKg === null || isNaN(weightKg) || weightKg < 0) {
        missingFactors.push('weightKg');
      }
      if (sets === null || isNaN(sets) || sets < 1) {
        missingFactors.push('sets');
      }
      if (reps === null || isNaN(reps) || reps < 1) {
        missingFactors.push('reps');
      }

      const isComplete = missingFactors.length === 0;

      // 9. 热量消耗估算 (缺失要素时安全兜底计算)
      const finalName = exerciseName || "综合力量训练";
      const isCompound = finalName.includes("卧推") || finalName.includes("深蹲") || finalName.includes("硬拉") || finalName.includes("划船") || finalName.includes("倒蹬");
      const calcSets = sets || 1;
      const calcWeight = weightKg !== null ? weightKg : (isCompound ? 60.0 : 15.0);
      const estBurn = isCompound ? Math.round(calcSets * 28 + (calcWeight * 0.45)) : Math.round(calcSets * 18 + (calcWeight * 0.2));

      const itemDraft = {
        exerciseName: finalName,
        muscleGroup: muscle,
        sets: sets,
        reps: reps,
        weightKg: weightKg,
        rpe: rpe !== null ? rpe : 8.0,
        isComplete: isComplete,
        missingFactors: missingFactors,
        followUpPrompt: "",
        burnedCalories: estBurn,
        notes: `AI 识别自语音: ${segment}`
      };

      itemDraft.followUpPrompt = generateFollowUpPrompt(itemDraft);
      results.push(itemDraft);
    }

    if (results.length === 0) {
      results.push({
        exerciseName: "杠铃卧推",
        muscleGroup: "胸部",
        sets: null,
        reps: null,
        weightKg: null,
        rpe: 8.0,
        isComplete: false,
        missingFactors: ['weightKg', 'sets', 'reps'],
        followUpPrompt: "已识别到【杠铃卧推】，请问使用了多少公斤重量（徒手/自重请说自重）、做了几组、每组几次？",
        burnedCalories: 148,
        notes: rawVoiceText
      });
    }

    return results;
  },

  /**
   * 多轮语音对话增量要素合并引擎
   * @param {Object} draftItem 当前未完成的动作草稿
   * @param {string} followUpText 用户补充回答的语音/文本
   * @param {Object} options 可选参数
   * @returns {Object} 合并更新后的 WorkoutItemDraft
   */
  mergeWorkoutFactors(draftItem, followUpText, options = {}) {
    if (!draftItem) {
      const parsed = this.parseWorkoutVoice(followUpText, options);
      return parsed.length > 0 ? parsed[0] : null;
    }
    if (!followUpText || !followUpText.trim()) {
      return { ...draftItem };
    }

    const merged = {
      exerciseName: draftItem.exerciseName || null,
      muscleGroup: draftItem.muscleGroup || "胸部",
      weightKg: draftItem.weightKg !== undefined ? draftItem.weightKg : null,
      sets: draftItem.sets !== undefined ? draftItem.sets : null,
      reps: draftItem.reps !== undefined ? draftItem.reps : null,
      rpe: draftItem.rpe !== undefined ? draftItem.rpe : 8.0,
      burnedCalories: draftItem.burnedCalories || 0,
      notes: draftItem.notes || "",
      isComplete: false,
      missingFactors: [],
      followUpPrompt: ""
    };

    const normalized = normalizeFitnessSpeech(followUpText);
    const normalizedWithNums = normalizeTextWithNumbers(normalized);

    // 1. 如果 draft 尚未确定有效动作名，尝试从 followUpText 提取动作
    if (!merged.exerciseName || merged.exerciseName === "综合力量训练") {
      const followUpItems = this.parseWorkoutVoice(followUpText, options);
      if (followUpItems.length > 0 && followUpItems[0].exerciseName && followUpItems[0].exerciseName !== "综合力量训练") {
        merged.exerciseName = followUpItems[0].exerciseName;
        merged.muscleGroup = followUpItems[0].muscleGroup;
      }
    }

    // 2. 显式要素提取 (Explicit Factor Extraction with mandatory unit anchors)
    let extractedWeight = null;
    let extractedSets = null;
    let extractedReps = null;
    let extractedRpe = null;
    const consumedNumbers = [];

    // 2.1 复合连乘模式匹配 (如 "4*8", "4x10", "4乘8", "4组8个", "4组8次")
    const compoundMatch = normalizedWithNums.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:[*xX乘××]|组)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:次|个|下|reps|rep)?/i);
    if (compoundMatch) {
      const sVal = Math.round(parseFloat(compoundMatch[1]));
      const rVal = Math.round(parseFloat(compoundMatch[2]));
      if (sVal >= 1 && sVal <= 30 && rVal >= 1 && rVal <= 200) {
        extractedSets = sVal;
        extractedReps = rVal;
        consumedNumbers.push(parseFloat(compoundMatch[1]), parseFloat(compoundMatch[2]));
      }
    }

    // 2.2 显式自重 / 空杆 / 0重量
    if (extractedWeight === null) {
      if (/(?:自重|徒手|净体重|0公斤|0kg)/i.test(normalizedWithNums)) {
        extractedWeight = 0.0;
      } else if (/空杆/i.test(normalizedWithNums)) {
        extractedWeight = 20.0;
      }
    }

    // 2.3 显式重量 (必须含有公斤/kg/千克/磅/lb，或明确的“重量/负重/用了/挂了”)
    if (extractedWeight === null) {
      const wm = normalizedWithNums.match(/(?:重量|重|负重|单边|每边|挂|用|上)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:公斤|kg|千克|KG|Kg|磅|lb|lbs)(?!\w)/i)
        || normalizedWithNums.match(/(?:重量|负重|用了|挂了|上了)\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (wm && wm[1]) {
        let val = parseFloat(wm[1]);
        if (/磅|lbs?/i.test(normalizedWithNums)) {
          val = Math.round(val * 0.453 * 10) / 10;
        }
        extractedWeight = val;
        consumedNumbers.push(parseFloat(wm[1]));
      }
    }

    // 2.4 显式组数 (必须含有组/set/sets，或前置“做了/做/来/搞/冲 X 组”)
    if (extractedSets === null) {
      const sm = normalizedWithNums.match(/([0-9]+)\s*(?:组|组数|sets?)(?!\w)/i)
        || normalizedWithNums.match(/(?:做了|做|来|搞|冲)\s*([0-9]+)\s*组/i);
      if (sm && sm[1]) {
        const val = parseInt(sm[1], 10);
        if (val >= 1 && val <= 30) {
          extractedSets = val;
          consumedNumbers.push(parseFloat(sm[1]));
        }
      }
    }

    // 2.5 显式次数 (必须含有次/个/下/reps/rep，或“每组 X”)
    if (extractedReps === null) {
      const rm = normalizedWithNums.match(/(?:每组|每组做|每组能做|各|均)?\s*([0-9]+)\s*(?:次|个|下|reps?)(?!\w)/i)
        || normalizedWithNums.match(/(?:每组)\s*([0-9]+)/i);
      if (rm && rm[1]) {
        const val = parseInt(rm[1], 10);
        if (val >= 1 && val <= 200) {
          extractedReps = val;
          consumedNumbers.push(parseFloat(rm[1]));
        }
      }
    }

    // 2.6 显式 RPE
    const rpeMatch = normalizedWithNums.match(/(?:rpe|RPE|自觉强度|强度|疲劳度)\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (rpeMatch && rpeMatch[1]) {
      extractedRpe = parseFloat(rpeMatch[1]);
      consumedNumbers.push(parseFloat(rpeMatch[1]));
    }

    // 3. 将显式提取的要素合并进 merged
    if (extractedWeight !== null) merged.weightKg = extractedWeight;
    if (extractedSets !== null) merged.sets = extractedSets;
    if (extractedReps !== null) merged.reps = extractedReps;
    if (extractedRpe !== null) merged.rpe = extractedRpe;

    // 4. 无单位孤立纯数字消歧 (Unitless isolated number disambiguation)
    const allFoundNums = [...normalizedWithNums.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\b/g)].map(m => parseFloat(m[1]));
    const unassignedNums = [];
    const consumedCopy = [...consumedNumbers];

    for (const num of allFoundNums) {
      const cIdx = consumedCopy.indexOf(num);
      if (cIdx !== -1) {
        consumedCopy.splice(cIdx, 1);
      } else {
        unassignedNums.push(num);
      }
    }

    // 如果只有一个未分配的孤立数字，且当前 draft 恰好只缺失一个要素，则安全赋给该缺失要素
    if (unassignedNums.length === 1) {
      const isolatedNum = unassignedNums[0];
      const missingWeight = merged.weightKg === null;
      const missingSets = merged.sets === null;
      const missingReps = merged.reps === null;
      const missingCount = (missingWeight ? 1 : 0) + (missingSets ? 1 : 0) + (missingReps ? 1 : 0);

      if (missingCount === 1) {
        if (missingWeight) {
          merged.weightKg = isolatedNum;
        } else if (missingSets) {
          if (isolatedNum >= 1 && isolatedNum <= 30) merged.sets = Math.round(isolatedNum);
        } else if (missingReps) {
          if (isolatedNum >= 1 && isolatedNum <= 200) merged.reps = Math.round(isolatedNum);
        }
      }
    }

    // 5. 自重动作特殊重量推断 (引体向上、双杠臂屈伸若未提供重量默认自重 0.0kg)
    if (merged.weightKg === null && merged.exerciseName && (merged.exerciseName.includes("自重") || merged.exerciseName.includes("引体") || merged.exerciseName.includes("双杠"))) {
      merged.weightKg = 0.0;
    }

    // 6. 校验要素完整性 (4-Factor strict validation)
    const missingFactors = [];
    if (!merged.exerciseName || merged.exerciseName === "综合力量训练") {
      missingFactors.push('exerciseName');
    }
    if (merged.weightKg === null || isNaN(merged.weightKg) || merged.weightKg < 0) {
      missingFactors.push('weightKg');
    }
    if (merged.sets === null || isNaN(merged.sets) || merged.sets < 1) {
      missingFactors.push('sets');
    }
    if (merged.reps === null || isNaN(merged.reps) || merged.reps < 1) {
      missingFactors.push('reps');
    }

    merged.missingFactors = missingFactors;
    merged.isComplete = missingFactors.length === 0;
    merged.followUpPrompt = merged.isComplete ? "" : generateFollowUpPrompt(merged);

    // 7. 计算热量消耗
    const isCompound = merged.exerciseName && (
      merged.exerciseName.includes("卧推") ||
      merged.exerciseName.includes("深蹲") ||
      merged.exerciseName.includes("硬拉") ||
      merged.exerciseName.includes("划船") ||
      merged.exerciseName.includes("倒蹬")
    );
    const s = merged.sets || 1;
    const w = merged.weightKg !== null ? merged.weightKg : (isCompound ? 60.0 : 15.0);
    merged.burnedCalories = isCompound
      ? Math.round(s * 28 + (w * 0.45))
      : Math.round(s * 18 + (w * 0.2));

    merged.notes = `${draftItem.notes || '语音记录'} + 补充: ${followUpText}`;

    return merged;
  },

  generateOverloadAdvices(workoutLogs) {
    if (!workoutLogs || workoutLogs.length === 0) return [];

    const grouped = {};
    workoutLogs.forEach(log => {
      if (!grouped[log.exerciseName]) grouped[log.exerciseName] = [];
      grouped[log.exerciseName].push(log);
    });

    const advices = [];

    for (const [name, logs] of Object.entries(grouped)) {
      const latest = logs[logs.length - 1];
      const isCompound = name.includes("卧推") || name.includes("深蹲") || name.includes("硬拉") || name.includes("划船") || name.includes("推举") || name.includes("倒蹬");
      const increment = isCompound ? 2.5 : 1.0;
      const targetRepsCap = isCompound ? 8 : 12;

      if (latest.reps >= targetRepsCap && latest.sets >= 3 && latest.rpe <= 8.5) {
        advices.push({
          exerciseName: name,
          muscleGroup: latest.muscleGroup,
          currentWeightKg: latest.weightKg,
          currentSets: latest.sets,
          currentReps: latest.reps,
          status: "READY_TO_ADD_PLATE",
          actionTitle: `🚀 达成双重累进标靶，建议加片 +${increment}kg`,
          actionDetail: `最近一次【${name}】以 ${latest.weightKg}kg 达成 ${latest.sets}组×${latest.reps}次 (RPE ${latest.rpe})！下次训练可直接上调至 ${(latest.weightKg + increment)}kg 冲刺！`,
          targetWeightKg: latest.weightKg + increment,
          targetSets: latest.sets,
          targetReps: Math.max(6, latest.reps - 2)
        });
      } else if (latest.reps < targetRepsCap) {
        advices.push({
          exerciseName: name,
          muscleGroup: latest.muscleGroup,
          currentWeightKg: latest.weightKg,
          currentSets: latest.sets,
          currentReps: latest.reps,
          status: "INCREASE_REPS",
          actionTitle: `📈 保持 ${latest.weightKg}kg，冲击更多次数`,
          actionDetail: `距离标靶 (${targetRepsCap}次) 还有余力，建议保持 ${latest.weightKg}kg 训练，尝试推进至 ${latest.reps + 1}~${targetRepsCap} 次后再加片。`,
          targetWeightKg: latest.weightKg,
          targetSets: latest.sets,
          targetReps: latest.reps + 1
        });
      } else {
        advices.push({
          exerciseName: name,
          muscleGroup: latest.muscleGroup,
          currentWeightKg: latest.weightKg,
          currentSets: latest.sets,
          currentReps: latest.reps,
          status: "MAINTAIN",
          actionTitle: `💪 巩固动作轨迹与向心控制`,
          actionDetail: `目前 ${latest.weightKg}kg ${latest.sets}组×${latest.reps}次 适应中，注重向心离心节奏与顶峰收缩。`,
          targetWeightKg: latest.weightKg,
          targetSets: latest.sets,
          targetReps: latest.reps
        });
      }
    }

    return advices;
  },

  calc1RM(weightKg, reps) {
    const w = parseFloat(weightKg) || 0;
    const r = parseInt(reps, 10) || 1;
    if (w <= 0) return 0;
    if (r <= 1) return Math.round(w);
    // Epley Formula: 1RM = W * (1 + r / 30)
    return Math.round(w * (1 + r / 30.0));
  },

  calcBarbellPlates(totalWeightKg, barWeight = 20) {
    const target = parseFloat(totalWeightKg) || 20;
    if (target < barWeight) {
      return {
        barWeight,
        targetWeight: target,
        perSideWeight: 0,
        platesPerSide: [],
        remainder: 0
      };
    }

    const netWeight = target - barWeight;
    const perSide = netWeight / 2.0;
    const availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25];
    const platesPerSide = [];
    let current = perSide;

    for (const p of availablePlates) {
      while (current >= p - 0.01) {
        platesPerSide.push(p);
        current = Math.round((current - p) * 100) / 100;
      }
    }

    return {
      barWeight,
      targetWeight: target,
      perSideWeight: perSide,
      platesPerSide,
      remainder: current
    };
  }
};

if (typeof window !== 'undefined') {
  window.WorkoutEngine = WorkoutEngine;
  window.parseChineseUniversalNum = parseChineseUniversalNum;
  window.normalizeTextWithNumbers = normalizeTextWithNumbers;
  window.normalizeFitnessSpeech = normalizeFitnessSpeech;
  window.FITNESS_HOMOPHONE_MAP = FITNESS_HOMOPHONE_MAP;
  window.generateFollowUpPrompt = generateFollowUpPrompt;
  window.calculateStringSimilarity = calculateStringSimilarity;
  window.levenshteinDistance = levenshteinDistance;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WorkoutEngine,
    parseChineseUniversalNum,
    normalizeTextWithNumbers,
    normalizeFitnessSpeech,
    FITNESS_HOMOPHONE_MAP,
    generateFollowUpPrompt,
    calculateStringSimilarity,
    levenshteinDistance
  };
}
