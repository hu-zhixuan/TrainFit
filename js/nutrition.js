/**
 * 练食AI · 高颗粒度中式餐饮/零食/补剂/分量规格精准营养解析引擎
 * 支持全场景中文字词、精细度单位换算（半斤=250g, 二两=100g, 听, 盒, 勺, 碗）与三大营养素实时核算
 */

// Helper to convert Chinese number words to float
function parseChineseDietNum(str) {
  if (typeof window !== 'undefined' && window.parseChineseUniversalNum) {
    return window.parseChineseUniversalNum(str);
  }
  if (!str) return null;
  str = ("" + str).trim();
  if (str === "半") return 0.5;
  if (str === "俩" || str === "双") return 2;
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(str)) return parseFloat(str);

  if (str.includes("点")) {
    const parts = str.split("点");
    const intPart = parseChineseDietNum(parts[0]) || 0;
    const decPart = parseChineseDietNum(parts[1]) || 0;
    return intPart + decPart / 10.0;
  }

  const digits = {
    '零': 0, '一': 1, '二': 2, '两': 2, '俩': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
  };

  if (str.length === 1 && digits[str] !== undefined) return digits[str];

  let total = 0;
  let section = 0;
  let currentDigit = null;
  let lastUnit = null;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (digits[ch] !== undefined) {
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
    }
  }

  if (currentDigit !== null) {
    if (lastUnit === 100 && currentDigit > 0 && currentDigit < 10) section += currentDigit * 10;
    else if (lastUnit === 1000 && currentDigit > 0 && currentDigit < 10) section += currentDigit * 100;
    else section += currentDigit;
  }

  total += section;
  return total > 0 ? total : null;
}

// Comprehensive Fine-Grained Food Database (per 100g) with Detailed Size Matrices
const EXPANDED_FOOD_DB = [
  // 优质主食
  {
    name: "米饭",
    aliases: ["白米饭", "紫米饭", "糙米饭", "大米饭", "米饭", "米", "白饭", "杂粮饭"],
    cal100g: 116, p100g: 2.6, c100g: 25.5, f100g: 0.3,
    defaultGrams: 200,
    unitGrams: { "大碗": 300, "小碗": 120, "平碗": 180, "满碗": 250, "半碗": 100, "碗": 200, "大份": 300, "小份": 120, "份": 200, "两": 50, "斤": 500 }
  },
  {
    name: "面条",
    aliases: ["拉面", "意面", "刀削面", "手擀面", "拌面", "打卤面", "面条", "面", "清汤面", "牛肉面"],
    cal100g: 140, p100g: 5.0, c100g: 28.0, f100g: 1.0,
    defaultGrams: 250,
    unitGrams: { "大碗": 400, "小碗": 180, "半碗": 120, "碗": 250, "大份": 400, "小份": 180, "份": 250, "大盘": 350, "盘": 300, "两": 50 }
  },
  {
    name: "全麦面包/吐司",
    aliases: ["全麦吐司", "全麦面包", "吐司片", "吐司", "贝果", "面包", "切片面包"],
    cal100g: 260, p100g: 10.0, c100g: 48.0, f100g: 3.0,
    defaultGrams: 70,
    unitGrams: { "厚片": 50, "薄片": 25, "片": 35, "大个": 100, "小个": 50, "个": 70, "包": 200 }
  },
  {
    name: "燕麦片",
    aliases: ["燕麦片", "燕麦", "即食燕麦", "纯燕麦", "世壮燕麦"],
    cal100g: 389, p100g: 15.0, c100g: 66.0, f100g: 6.5,
    defaultGrams: 60,
    unitGrams: { "大碗": 100, "小碗": 40, "碗": 60, "勺": 20, "大勺": 30, "袋": 50, "包": 50 }
  },
  {
    name: "蒸红薯/紫薯/玉米",
    aliases: ["红薯", "紫薯", "地瓜", "玉米", "芋头", "山药", "土豆", "蒸南瓜", "南瓜"],
    cal100g: 90, p100g: 2.0, c100g: 20.0, f100g: 0.3,
    defaultGrams: 150,
    unitGrams: { "大根": 220, "小根": 90, "根": 150, "半根": 75, "大个": 220, "小个": 90, "个": 150, "半个": 75, "块": 150 }
  },
  {
    name: "包子/饺子/馄饨",
    aliases: ["包子", "肉包", "菜包", "小笼包", "饺子", "水饺", "蒸饺", "煎饺", "馄饨", "抄手"],
    cal100g: 210, p100g: 8.0, c100g: 30.0, f100g: 6.5,
    defaultGrams: 150,
    unitGrams: { "个": 30, "只": 30, "大个": 80, "小个": 25, "碗": 250, "份": 200, "笼": 180 }
  },

  // 优质蛋白肉蛋
  {
    name: "鸡蛋",
    aliases: ["水煮蛋", "煎蛋", "荷包蛋", "卤蛋", "茶叶蛋", "鸡蛋", "蛋", "煮鸡蛋"],
    cal100g: 143, p100g: 12.6, c100g: 0.8, f100g: 9.5,
    defaultGrams: 100,
    unitGrams: { "大个": 60, "大只": 60, "小个": 40, "小只": 40, "个": 50, "只": 50, "颗": 50, "粒": 50, "份": 100 }
  },
  {
    name: "香煎鸡胸肉",
    aliases: ["香煎鸡胸肉", "香煎鸡胸", "水煮鸡胸", "鸡胸肉", "鸡胸", "鸡肉", "黑椒鸡胸肉", "水煮鸡胸肉"],
    cal100g: 133, p100g: 23.0, c100g: 0.0, f100g: 3.6,
    defaultGrams: 200,
    unitGrams: { "大块": 250, "小块": 100, "块": 150, "半块": 75, "大片": 150, "小片": 60, "片": 100, "大份": 300, "小份": 120, "份": 200, "两": 50, "斤": 500 }
  },
  {
    name: "精瘦牛肉/牛排",
    aliases: ["酱牛肉", "卤牛肉", "瘦牛肉", "牛排", "牛肉", "牛腩", "战斧牛排", "眼肉牛排", "菲力牛排"],
    cal100g: 180, p100g: 22.0, c100g: 0.0, f100g: 10.0,
    defaultGrams: 200,
    unitGrams: { "大块": 300, "小块": 100, "块": 150, "大片": 80, "小片": 30, "片": 50, "大份": 300, "小份": 120, "份": 200, "两": 50, "斤": 500 }
  },
  {
    name: "鱼虾海鲜",
    aliases: ["三文鱼", "基围虾", "清蒸鱼", "鱼排", "鱼肉", "虾仁", "虾", "大虾", "巴沙鱼", "金枪鱼", "鳕鱼", "煎三文鱼"],
    cal100g: 120, p100g: 20.0, c100g: 0.0, f100g: 4.5,
    defaultGrams: 150,
    unitGrams: { "大只": 25, "小只": 10, "只": 15, "大个": 25, "小个": 10, "个": 15, "整条": 350, "条": 250, "半条": 125, "块": 150, "大份": 250, "小份": 100, "份": 150 }
  },
  {
    name: "豆腐/豆制品",
    aliases: ["水豆腐", "老豆腐", "千张", "豆干", "豆皮", "豆腐", "嫩豆腐"],
    cal100g: 84, p100g: 8.1, c100g: 3.8, f100g: 4.2,
    defaultGrams: 150,
    unitGrams: { "大块": 250, "小块": 80, "块": 150, "大盒": 400, "盒": 300, "大份": 250, "小份": 100, "份": 150 }
  },

  // 补剂与饮品
  {
    name: "乳清蛋白粉",
    aliases: ["乳清蛋白粉", "蛋白粉", "分离乳清", "酪蛋白", "肌肉科技", "Myprotein", "ON蛋白粉"],
    cal100g: 390, p100g: 78.0, c100g: 8.0, f100g: 4.0,
    defaultGrams: 30,
    unitGrams: { "大勺": 40, "平勺": 30, "勺": 30, "份": 30, "杯": 30 }
  },
  {
    name: "鲜牛奶/纯牛奶",
    aliases: ["牛奶", "鲜牛奶", "纯牛奶", "脱脂牛奶", "全脂奶", "脱脂奶", "低脂奶", "燕麦奶"],
    cal100g: 54, p100g: 3.2, c100g: 4.8, f100g: 3.2,
    defaultGrams: 250,
    unitGrams: { "大盒": 500, "小盒": 200, "盒": 250, "大杯": 400, "中杯": 300, "小杯": 200, "杯": 250, "瓶": 250, "袋": 220 }
  },
  {
    name: "纯黑咖啡/美式",
    aliases: ["黑咖啡", "美式咖啡", "冰美式", "热美式", "浓缩咖啡", "冷萃咖啡", "黑咖"],
    cal100g: 2, p100g: 0.2, c100g: 0.3, f100g: 0.0,
    defaultGrams: 350,
    unitGrams: { "超大杯": 600, "大杯": 473, "中杯": 355, "小杯": 240, "杯": 350, "瓶": 300 }
  },
  {
    name: "拿铁/奶咖",
    aliases: ["拿铁", "燕麦拿铁", "生椰拿铁", "摩卡", "卡布奇诺", "奶咖"],
    cal100g: 50, p100g: 2.8, c100g: 4.5, f100g: 2.2,
    defaultGrams: 350,
    unitGrams: { "超大杯": 600, "大杯": 473, "中杯": 355, "小杯": 240, "杯": 350 }
  },
  {
    name: "可乐/碳酸饮料",
    aliases: ["可乐", "百事可乐", "可口可乐", "雪碧", "芬达", "汽水"],
    cal100g: 43, p100g: 0.0, c100g: 10.6, f100g: 0.0,
    defaultGrams: 330,
    unitGrams: { "大瓶": 1250, "瓶": 500, "小瓶": 300, "大罐": 500, "听": 330, "罐": 330, "杯": 400 }
  },
  {
    name: "无糖饮料/零度可乐",
    aliases: ["零度可乐", "无糖可乐", "东方树叶", "元气森林", "无糖雪碧", "三得利乌龙茶", "燃茶", "纯净水"],
    cal100g: 0, p100g: 0.0, c100g: 0.0, f100g: 0.0,
    defaultGrams: 500,
    unitGrams: { "瓶": 500, "听": 330, "罐": 330, "杯": 400 }
  },
  {
    name: "奶茶/果茶",
    aliases: ["奶茶", "霸气鲜果茶", "芋圆奶茶", "波霸奶茶", "喜茶", "霸王茶姬", "奈雪"],
    cal100g: 65, p100g: 1.2, c100g: 11.5, f100g: 1.8,
    defaultGrams: 500,
    unitGrams: { "超大杯": 700, "大杯": 600, "中杯": 500, "小杯": 400, "杯": 500 }
  },

  // 蔬菜与水果
  {
    name: "水煮西兰花",
    aliases: ["水煮西兰花", "西兰花", "西蓝花"],
    cal100g: 34, p100g: 2.8, c100g: 6.6, f100g: 0.4,
    defaultGrams: 150,
    unitGrams: { "大盘": 250, "小盘": 100, "盘": 150, "大碗": 200, "小碗": 80, "碗": 120, "大份": 250, "小份": 100, "份": 150 }
  },
  {
    name: "时令蔬菜/沙拉",
    aliases: ["时蔬", "沙拉", "生菜", "黄瓜", "番茄", "西红柿", "菠菜", "蔬菜", "青菜", "芦笋", "生菜沙拉"],
    cal100g: 25, p100g: 1.5, c100g: 4.5, f100g: 0.2,
    defaultGrams: 150,
    unitGrams: { "大盘": 250, "小盘": 100, "盘": 150, "大碗": 200, "小碗": 80, "碗": 120, "大份": 250, "小份": 100, "份": 150, "大根": 200, "小根": 80, "根": 120, "大个": 220, "小个": 90, "个": 150 }
  },
  {
    name: "新鲜香蕉",
    aliases: ["香蕉"],
    cal100g: 89, p100g: 1.1, c100g: 22.8, f100g: 0.3,
    defaultGrams: 120,
    unitGrams: { "大根": 160, "小根": 80, "根": 120, "大只": 160, "小只": 80, "只": 120, "个": 120, "半根": 60 }
  },
  {
    name: "红富士苹果/梨",
    aliases: ["苹果", "梨", "橙子", "火龙果", "蓝莓"],
    cal100g: 52, p100g: 0.3, c100g: 13.8, f100g: 0.2,
    defaultGrams: 150,
    unitGrams: { "大个": 230, "小个": 100, "个": 150, "大只": 230, "小只": 100, "只": 150, "半个": 75, "盒": 125 }
  },

  // 零食、坚果与快餐
  {
    name: "坚果",
    aliases: ["坚果", "巴旦木", "核桃", "腰果", "花生", "瓜子", "开心果", "每日坚果"],
    cal100g: 610, p100g: 20.0, c100g: 18.0, f100g: 52.0,
    defaultGrams: 30,
    unitGrams: { "大包": 60, "小包": 20, "包": 30, "袋": 30, "大把": 40, "小把": 15, "把": 25, "颗": 2 }
  },
  {
    name: "辣条",
    aliases: ["辣条", "卫龙", "亲嘴烧", "魔芋爽", "大面筋", "素大豆排"],
    cal100g: 410, p100g: 9.5, c100g: 48.0, f100g: 20.0,
    defaultGrams: 70,
    unitGrams: { "大包": 120, "小包": 35, "包": 70, "袋": 70, "根": 15, "条": 15, "盒": 150 }
  },
  {
    name: "薯片",
    aliases: ["薯片", "乐事", "品客", "可比克", "原切薯片"],
    cal100g: 536, p100g: 6.8, c100g: 52.0, f100g: 33.6,
    defaultGrams: 75,
    unitGrams: { "大包": 135, "小包": 40, "包": 75, "袋": 75, "筒": 104, "罐": 104 }
  },
  {
    name: "巧克力",
    aliases: ["巧克力", "德芙", "黑巧克力", "费列罗", "士力架"],
    cal100g: 550, p100g: 7.5, c100g: 54.0, f100g: 34.0,
    defaultGrams: 45,
    unitGrams: { "大块": 90, "小块": 25, "块": 45, "条": 50, "颗": 12, "粒": 12, "盒": 150 }
  },
  {
    name: "汉堡",
    aliases: ["汉堡", "牛肉堡", "香辣鸡腿堡", "巨无霸", "双层吉士堡", "板烧鸡腿堡"],
    cal100g: 250, p100g: 13.0, c100g: 24.0, f100g: 11.0,
    defaultGrams: 200,
    unitGrams: { "大个": 250, "小个": 140, "个": 200, "份": 200, "半个": 100 }
  },
  {
    name: "炸鸡",
    aliases: ["炸鸡", "炸鸡块", "吮指原味鸡", "麦辣鸡翅", "炸鸡腿", "鸡米花"],
    cal100g: 270, p100g: 18.0, c100g: 12.0, f100g: 17.0,
    defaultGrams: 150,
    unitGrams: { "大份": 300, "小份": 100, "份": 180, "大块": 150, "小块": 70, "块": 100, "个": 120, "只": 120, "对": 80 }
  },
  {
    name: "薯条",
    aliases: ["薯条", "炸薯条"],
    cal100g: 290, p100g: 3.5, c100g: 40.0, f100g: 13.0,
    defaultGrams: 110,
    unitGrams: { "大份": 160, "大包": 160, "小份": 75, "小包": 75, "中份": 110, "份": 110, "包": 110 }
  }
];

const NutritionEngine = {
  parseDietVoice(rawText) {
    if (!rawText || !rawText.trim()) {
      return {
        mealType: "午餐",
        foodSummary: "常规营养餐",
        totalCalories: 450,
        proteinG: 30,
        carbsG: 50,
        fatG: 12,
        items: [{ name: "常规营养餐", estimatedGrams: 300, calories: 450, proteinG: 30, carbsG: 50, fatG: 12 }],
        advice: "合理摄入蛋白质与碳水。"
      };
    }

    let text = rawText.trim();

    // 1. Meal Type Detection
    let mealType = "午餐";
    if (text.includes("早")) mealType = "早餐";
    else if (text.includes("午")) mealType = "午餐";
    else if (text.includes("晚") || text.includes("夜宵")) mealType = "晚餐";
    else if (text.includes("加餐") || text.includes("补剂") || text.includes("蛋白粉") || text.includes("练后") || text.includes("下午茶")) mealType = "加餐/补剂";

    // 2. Clean leading chatter phrases
    text = text.replace(/^(?:今天|刚才|现在|中午|早上|晚上|下午|夜宵)?\s*(?:吃了|喝了|点了|干了|消灭了|来了一份|来了一碗|来了一个|吞了|来点|整了|吃了点)+/g, "");
    text = text.replace(/[。！!？?~哈呗啦啊]+$/g, "");

    // 3. Scan for matching food entities
    const matches = [];
    const allAliases = [];
    EXPANDED_FOOD_DB.forEach(profile => {
      profile.aliases.forEach(alias => {
        allAliases.push({ alias, profile });
      });
    });
    // Sort aliases by length descending
    allAliases.sort((a, b) => b.alias.length - a.alias.length);

    let searchCopy = text;
    const matchedRanges = [];

    for (const entry of allAliases) {
      let idx = searchCopy.indexOf(entry.alias);
      while (idx !== -1) {
        const start = idx;
        const end = idx + entry.alias.length;
        const isOverlap = matchedRanges.some(r => (start >= r.start && start < r.end) || (end > r.start && end <= r.end));
        if (!isOverlap) {
          matchedRanges.push({ start, end });
          matches.push({
            start,
            end,
            alias: entry.alias,
            profile: entry.profile
          });
        }
        idx = searchCopy.indexOf(entry.alias, end);
      }
    }

    // Sort matches in order of appearance in text
    matches.sort((a, b) => a.start - b.start);

    const extractedItems = [];
    const matchedSummaries = [];

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const curr = matches[i];
        const prevEnd = i === 0 ? 0 : matches[i - 1].end;
        const nextStart = i === matches.length - 1 ? text.length : matches[i + 1].start;

        const contextBefore = text.slice(prevEnd, curr.start).trim();
        const contextAfter = text.slice(curr.end, nextStart).trim();

        let totalGrams = curr.profile.defaultGrams;
        let countUnitLabel = "";

        const explicitGramPattern = /([半零一二两俩三四五六七八九十百千0-9.]+)\s*(千克|公斤|kg|毫升|ml|克|g|斤|两)/i;

        // Check contextAfter first (e.g. "牛奶 250毫升", "鸡胸肉 200克")
        let egMatch = contextAfter.match(explicitGramPattern);
        // If not in contextAfter, check contextBefore (e.g. "200克 鸡胸肉")
        if (!egMatch) {
          egMatch = contextBefore.match(explicitGramPattern);
        }

        if (egMatch) {
          const numVal = parseChineseDietNum(egMatch[1]);
          const unitStr = egMatch[2].toLowerCase();

          if (numVal && numVal > 0) {
            if (unitStr === "千克" || unitStr === "kg" || unitStr === "公斤") {
              totalGrams = numVal * 1000;
            } else if (unitStr === "斤") {
              totalGrams = numVal * 500;
            } else if (unitStr === "两") {
              totalGrams = numVal * 50;
            } else {
              totalGrams = numVal;
            }
            countUnitLabel = `${Math.round(totalGrams)}${unitStr === '毫升' || unitStr === 'ml' ? 'ml' : 'g'}`;
          }
        } else {
          // Check for fine-grained units with size prefixes
          const unitKeys = Object.keys(curr.profile.unitGrams || {});
          unitKeys.sort((a, b) => b.length - a.length);

          const unitPatternStr = `([零一二两俩三四五六七八九十百千0-9.]*)\\s*(${unitKeys.join("|")}|大份|小份|中份|份|大碗|小碗|平碗|满碗|半碗|碗|大杯|中杯|小杯|超大杯|杯|大盘|小盘|盘|大块|小块|半块|块|大片|厚片|薄片|片|大根|小根|半根|根|大个|小个|半个|个|大只|小只|只|大包|小包|包|大袋|小袋|袋|大桶|桶|大罐|罐|听|大瓶|小瓶|瓶|大盒|小盒|盒|大勺|平勺|半勺|勺|串|张|笼)`;
          const unitRegex = new RegExp(unitPatternStr);

          // Check contextBefore (e.g. "2个 鸡蛋", "一杯 牛奶") then contextAfter (e.g. "鸡蛋 2个")
          let unitMatch = contextBefore.match(unitRegex) || contextAfter.match(unitRegex);

          if (unitMatch && unitMatch[2]) {
            const rawNum = unitMatch[1].trim();
            const count = rawNum ? (parseChineseDietNum(rawNum) || 1) : 1;
            const unit = unitMatch[2];

            let perUnitGram = (curr.profile.unitGrams && curr.profile.unitGrams[unit]) ? curr.profile.unitGrams[unit] : null;

            if (!perUnitGram) {
              const baseUnit = unit.replace(/^(?:大|小|中|超大|特大|平|满|厚|薄)/, "");
              const baseGram = (curr.profile.unitGrams && curr.profile.unitGrams[baseUnit]) ? curr.profile.unitGrams[baseUnit] : (curr.profile.defaultGrams || 100);

              if (unit.startsWith("超大") || unit.startsWith("特大")) perUnitGram = baseGram * 1.6;
              else if (unit.startsWith("大") || unit.startsWith("满") || unit.startsWith("厚")) perUnitGram = baseGram * 1.4;
              else if (unit.startsWith("小") || unit.startsWith("薄")) perUnitGram = baseGram * 0.6;
              else if (unit.startsWith("半")) perUnitGram = baseGram * 0.5;
              else perUnitGram = baseGram;
            }

            totalGrams = count * perUnitGram;
            countUnitLabel = `${count > 1 ? count : ''}${unit}`;
          } else {
            // Standalone number prefix (e.g. "2 鸡蛋")
            const leadNumMatch = contextBefore.match(/([零一二两俩三四五六七八九十百千0-9.]+)\s*$/);
            if (leadNumMatch) {
              const count = parseChineseDietNum(leadNumMatch[1]) || 1;
              totalGrams = count * curr.profile.defaultGrams;
              countUnitLabel = `${count}份`;
            }
          }
        }

        const factor = totalGrams / 100.0;
        const itemCal = Math.round(curr.profile.cal100g * factor);
        const itemP = Math.round(curr.profile.p100g * factor * 10) / 10;
        const itemC = Math.round(curr.profile.c100g * factor * 10) / 10;
        const itemF = Math.round(curr.profile.f100g * factor * 10) / 10;

        extractedItems.push({
          name: curr.profile.name,
          estimatedGrams: totalGrams,
          calories: itemCal,
          proteinG: itemP,
          carbsG: itemC,
          fatG: itemF
        });

        matchedSummaries.push(`${curr.profile.name}${countUnitLabel ? ' ' + countUnitLabel : ''} (${Math.round(totalGrams)}g)`);
      }
    } else {
      const cleanName = text.replace(/^[0-9零一二两三四五六七八九十百千\s包个碗份克g]+/, "").trim() || text;
      extractedItems.push({
        name: cleanName.slice(0, 12),
        estimatedGrams: 200,
        calories: 320,
        proteinG: 16.0,
        carbsG: 28.0,
        fatG: 14.0
      });
      matchedSummaries.push(`${cleanName} (约200g)`);
    }

    const totalCal = Math.round(extractedItems.reduce((sum, i) => sum + i.calories, 0));
    const totalP = Math.round(extractedItems.reduce((sum, i) => sum + i.proteinG, 0) * 10) / 10;
    const totalC = Math.round(extractedItems.reduce((sum, i) => sum + i.carbsG, 0) * 10) / 10;
    const totalF = Math.round(extractedItems.reduce((sum, i) => sum + i.fatG, 0) * 10) / 10;
    const summaryText = matchedSummaries.join(" + ");

    return {
      mealType,
      foodSummary: summaryText,
      totalCalories: totalCal,
      proteinG: totalP,
      carbsG: totalC,
      fatG: totalF,
      items: extractedItems,
      advice: totalCal > 2000
        ? `⚠️ 单餐热量极高 (${totalCal} kcal)！已超出单餐建议，注意全天热量平衡！`
        : `AI 营养算法：根据精准分量规格计算热量 ${totalCal} kcal (蛋白 ${totalP}g)，已实时计入缺口！`
    };
  }
};

if (typeof window !== 'undefined') {
  window.NutritionEngine = NutritionEngine;
  window.parseChineseDietNum = parseChineseDietNum;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = NutritionEngine;
}
