/**
 * 练食AI · 高颗粒度中式餐饮/零食/分量规格精准营养解析引擎
 */

// Helper to convert Chinese number words to float (e.g. "一百", "两点五", "十二", "半", "两", "三两")
function parseChineseDietNum(str) {
  if (!str) return null;
  str = str.trim();

  if (str === "半") return 0.5;
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(str)) {
    return parseFloat(str);
  }

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

  if (str.length === 1 && digits[str] !== undefined) {
    return digits[str];
  }

  let total = 0;
  let temp = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (digits[char] !== undefined) {
      temp = digits[char];
      if (i === str.length - 1) {
        total += temp;
      }
    } else if (char === '十') {
      if (temp === 0) temp = 1;
      total += temp * 10;
      temp = 0;
    } else if (char === '百') {
      if (temp === 0) temp = 1;
      total += temp * 100;
      temp = 0;
    } else if (char === '千') {
      if (temp === 0) temp = 1;
      total += temp * 1000;
      temp = 0;
    } else if (/[0-9]/.test(char)) {
      let numStr = "";
      while (i < str.length && /[0-9.]/.test(str[i])) {
        numStr += str[i];
        i++;
      }
      i--;
      return parseFloat(numStr);
    }
  }

  return total > 0 ? total : (temp > 0 ? temp : null);
}

// Comprehensive Fine-Grained Food Database (per 100g) with Detailed Size Matrices
const EXPANDED_FOOD_DB = [
  // 零食与休闲小吃
  {
    name: "辣条",
    aliases: ["辣条", "卫龙", "亲嘴烧", "魔芋爽", "大面筋", "素大豆排"],
    cal100g: 410, p100g: 9.5, c100g: 48.0, f100g: 20.0,
    defaultGrams: 70,
    unitGrams: { "大包": 120, "小包": 35, "包": 70, "袋": 70, "大袋": 120, "小袋": 35, "根": 15, "条": 15, "盒": 150 }
  },
  {
    name: "薯片",
    aliases: ["薯片", "乐事", "品客", "可比克", "原切薯片"],
    cal100g: 536, p100g: 6.8, c100g: 52.0, f100g: 33.6,
    defaultGrams: 75,
    unitGrams: { "大包": 135, "小包": 40, "包": 75, "袋": 75, "大袋": 135, "小袋": 40, "筒": 104, "罐": 104 }
  },
  {
    name: "巧克力",
    aliases: ["巧克力", "德芙", "黑巧克力", "费列罗", "士力架"],
    cal100g: 550, p100g: 7.5, c100g: 54.0, f100g: 34.0,
    defaultGrams: 45,
    unitGrams: { "大块": 90, "小块": 25, "块": 45, "条": 50, "颗": 12, "粒": 12, "盒": 150 }
  },
  {
    name: "饼干",
    aliases: ["饼干", "曲奇", "奥利奥", "威化", "苏打饼干"],
    cal100g: 480, p100g: 7.0, c100g: 65.0, f100g: 22.0,
    defaultGrams: 100,
    unitGrams: { "大包": 200, "小包": 50, "包": 100, "块": 15, "片": 10, "盒": 200 }
  },
  {
    name: "蛋糕/甜点",
    aliases: ["蛋糕", "奶油蛋糕", "芝士蛋糕", "提拉米苏", "面包糕点", "蛋挞"],
    cal100g: 350, p100g: 6.0, c100g: 45.0, f100g: 16.0,
    defaultGrams: 100,
    unitGrams: { "大块": 150, "小块": 60, "块": 100, "个": 120, "只": 60, "盒": 250 }
  },
  {
    name: "坚果",
    aliases: ["坚果", "巴旦木", "核桃", "腰果", "花生", "瓜子", "开心果"],
    cal100g: 610, p100g: 20.0, c100g: 18.0, f100g: 52.0,
    defaultGrams: 30,
    unitGrams: { "大包": 60, "小包": 20, "包": 30, "袋": 30, "大把": 40, "小把": 15, "把": 25, "颗": 2 }
  },
  {
    name: "肉脯/熟食",
    aliases: ["猪肉脯", "牛肉干", "肉脯", "鸭脖", "凤爪", "卤鸡爪"],
    cal100g: 340, p100g: 35.0, c100g: 25.0, f100g: 10.0,
    defaultGrams: 50,
    unitGrams: { "大包": 100, "小包": 30, "包": 50, "袋": 50, "片": 20, "根": 40, "只": 40 }
  },
  {
    name: "烤肠/热狗",
    aliases: ["烤肠", "热狗肠", "淀粉肠", "火腿肠", "香肠"],
    cal100g: 280, p100g: 12.0, c100g: 18.0, f100g: 18.0,
    defaultGrams: 60,
    unitGrams: { "大根": 85, "小根": 40, "根": 60, "条": 60, "串": 60, "个": 60 }
  },

  // 快餐外卖
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
    unitGrams: { "大份": 160, "大包": 160, "大盒": 160, "小份": 75, "小包": 75, "小盒": 75, "中份": 110, "中包": 110, "份": 110, "包": 110, "盒": 110 }
  },
  {
    name: "披萨",
    aliases: ["披萨", "披萨饼", "比萨", "意式披萨"],
    cal100g: 260, p100g: 11.0, c100g: 30.0, f100g: 10.0,
    defaultGrams: 150,
    unitGrams: { "大片": 160, "小片": 80, "片": 120, "块": 120, "个": 400, "份": 300 }
  },
  {
    name: "包子/生煎/馒头",
    aliases: ["肉包", "小笼包", "生煎", "生煎包", "锅贴", "菜包", "包子", "馒头", "花卷"],
    cal100g: 220, p100g: 7.5, c100g: 38.0, f100g: 4.5,
    defaultGrams: 80,
    unitGrams: { "大个": 120, "小个": 40, "个": 80, "只": 80, "笼": 320, "小笼": 240, "大笼": 400 }
  },
  {
    name: "水饺/馄饨",
    aliases: ["水饺", "饺子", "蒸饺", "馄饨", "抄手", "云吞"],
    cal100g: 210, p100g: 8.5, c100g: 26.0, f100g: 7.5,
    defaultGrams: 200,
    unitGrams: { "个": 20, "只": 20, "大碗": 350, "小碗": 180, "碗": 250, "大份": 350, "小份": 180, "份": 250 }
  },
  {
    name: "煎饼/手抓饼/肉夹馍",
    aliases: ["煎饼果子", "手抓饼", "肉夹馍", "鸡蛋灌饼", "卷饼"],
    cal100g: 260, p100g: 8.0, c100g: 36.0, f100g: 9.5,
    defaultGrams: 200,
    unitGrams: { "大个": 260, "小个": 140, "个": 200, "份": 200, "张": 180 }
  },
  {
    name: "螺蛳粉/米线/麻辣烫",
    aliases: ["螺蛳粉", "酸辣粉", "米线", "过桥米线", "麻辣烫", "串串香", "冒菜"],
    cal100g: 130, p100g: 4.0, c100g: 20.0, f100g: 3.8,
    defaultGrams: 450,
    unitGrams: { "大碗": 600, "小碗": 300, "碗": 450, "大份": 600, "小份": 300, "份": 450, "盒": 450, "桶": 450 }
  },
  {
    name: "炒饭/盖浇饭",
    aliases: ["蛋炒饭", "炒饭", "扬州炒饭", "牛肉炒饭", "盖浇饭", "黄焖鸡米饭", "煲仔饭"],
    cal100g: 175, p100g: 6.0, c100g: 26.0, f100g: 5.5,
    defaultGrams: 350,
    unitGrams: { "大碗": 450, "小碗": 250, "碗": 350, "大份": 450, "小份": 250, "份": 350, "盒": 350 }
  },
  {
    name: "方便面/泡面",
    aliases: ["方便面", "泡面", "拉面说", "干脆面", "火鸡面", "拌面"],
    cal100g: 460, p100g: 9.5, c100g: 60.0, f100g: 20.0,
    defaultGrams: 110,
    unitGrams: { "大桶": 150, "大碗": 150, "桶": 120, "碗": 120, "包": 110, "袋": 110 }
  },

  // 饮品
  {
    name: "可口可乐/雪碧",
    aliases: ["可口可乐", "可乐", "雪碧", "芬达", "碳酸饮料", "汽水"],
    cal100g: 43, p100g: 0.0, c100g: 10.6, f100g: 0.0,
    defaultGrams: 330,
    unitGrams: { "大瓶": 1000, "小瓶": 300, "瓶": 500, "罐": 330, "听": 330, "大杯": 650, "中杯": 500, "小杯": 350, "杯": 400 }
  },
  {
    name: "无糖可乐/无糖茶",
    aliases: ["无糖可乐", "零度可乐", "可乐纤维", "东方树叶", "三得利乌龙茶", "气泡水", "无糖茶"],
    cal100g: 0, p100g: 0.0, c100g: 0.0, f100g: 0.0,
    defaultGrams: 330,
    unitGrams: { "大瓶": 1000, "瓶": 500, "罐": 330, "听": 330, "大杯": 650, "杯": 400 }
  },
  {
    name: "奶茶",
    aliases: ["珍珠奶茶", "波霸奶茶", "奶茶", "喜茶", "霸王茶姬", "一点点", "蜜雪冰城"],
    cal100g: 70, p100g: 1.5, c100g: 12.0, f100g: 1.8,
    defaultGrams: 500,
    unitGrams: { "超大杯": 750, "大杯": 650, "中杯": 500, "小杯": 350, "杯": 500, "瓶": 500 }
  },
  {
    name: "拿铁/咖啡",
    aliases: ["生椰拿铁", "拿铁", "美式", "卡布奇诺", "摩卡", "瑞幸", "星巴克"],
    cal100g: 45, p100g: 2.2, c100g: 4.8, f100g: 1.8,
    defaultGrams: 350,
    unitGrams: { "超大杯": 550, "大杯": 450, "中杯": 350, "小杯": 250, "杯": 350, "瓶": 300 }
  },
  {
    name: "纯牛奶",
    aliases: ["纯牛奶", "鲜牛奶", "牛奶", "脱脂奶", "全脂奶"],
    cal100g: 60, p100g: 3.2, c100g: 4.8, f100g: 3.2,
    defaultGrams: 250,
    unitGrams: { "大盒": 1000, "小盒": 200, "盒": 250, "大瓶": 1000, "瓶": 250, "杯": 250, "袋": 250 }
  },
  {
    name: "乳清蛋白粉",
    aliases: ["乳清蛋白粉", "蛋白粉", "乳清蛋白", "分离乳清"],
    cal100g: 380, p100g: 80.0, c100g: 8.0, f100g: 5.0,
    defaultGrams: 30,
    unitGrams: { "大勺": 40, "平勺": 30, "勺": 30, "半勺": 15, "包": 30, "袋": 30, "份": 30 }
  },
  {
    name: "啤酒/酒类",
    aliases: ["啤酒", "精酿", "白酒", "红酒"],
    cal100g: 38, p100g: 0.4, c100g: 3.5, f100g: 0.0,
    defaultGrams: 500,
    unitGrams: { "大瓶": 600, "瓶": 500, "大扎": 1000, "扎": 500, "罐": 330, "听": 330, "杯": 350 }
  },

  // 优质主食
  {
    name: "米饭",
    aliases: ["白米饭", "紫米饭", "糙米饭", "大米饭", "米饭", "米"],
    cal100g: 116, p100g: 2.6, c100g: 25.5, f100g: 0.3,
    defaultGrams: 200,
    unitGrams: { "大碗": 300, "小碗": 120, "平碗": 180, "满碗": 250, "半碗": 100, "碗": 200, "大份": 300, "小份": 120, "份": 200, "两": 50, "斤": 500 }
  },
  {
    name: "面条",
    aliases: ["拉面", "意面", "刀削面", "手擀面", "拌面", "打卤面", "面条"],
    cal100g: 140, p100g: 5.0, c100g: 28.0, f100g: 1.0,
    defaultGrams: 250,
    unitGrams: { "大碗": 400, "小碗": 180, "半碗": 120, "碗": 250, "大份": 400, "小份": 180, "份": 250, "大盘": 350, "盘": 300, "两": 50 }
  },
  {
    name: "全麦面包/吐司",
    aliases: ["全麦吐司", "全麦面包", "吐司片", "吐司", "贝果", "面包"],
    cal100g: 260, p100g: 10.0, c100g: 48.0, f100g: 3.0,
    defaultGrams: 70,
    unitGrams: { "厚片": 50, "薄片": 25, "片": 35, "大个": 100, "小个": 50, "个": 70, "包": 200 }
  },
  {
    name: "蒸红薯/紫薯/玉米",
    aliases: ["红薯", "紫薯", "地瓜", "玉米", "芋头", "山药", "土豆"],
    cal100g: 90, p100g: 2.0, c100g: 20.0, f100g: 0.3,
    defaultGrams: 150,
    unitGrams: { "大根": 220, "小根": 90, "根": 150, "半根": 75, "大个": 220, "小个": 90, "个": 150, "半个": 75, "块": 150 }
  },

  // 优质蛋白肉蛋
  {
    name: "鸡蛋",
    aliases: ["水煮蛋", "煎蛋", "荷包蛋", "卤蛋", "茶叶蛋", "鸡蛋", "蛋"],
    cal100g: 143, p100g: 12.6, c100g: 0.8, f100g: 9.5,
    defaultGrams: 100,
    unitGrams: { "大个": 60, "大只": 60, "小个": 40, "小只": 40, "个": 50, "只": 50, "颗": 50, "粒": 50, "份": 100 }
  },
  {
    name: "香煎鸡胸肉",
    aliases: ["香煎鸡胸肉", "香煎鸡胸", "水煮鸡胸", "鸡胸肉", "鸡胸", "鸡肉"],
    cal100g: 133, p100g: 23.0, c100g: 0.0, f100g: 3.6,
    defaultGrams: 200,
    unitGrams: { "大块": 250, "小块": 100, "块": 150, "半块": 75, "大片": 150, "小片": 60, "片": 100, "大份": 300, "小份": 120, "份": 200, "两": 50, "斤": 500 }
  },
  {
    name: "精瘦牛肉/牛排",
    aliases: ["酱牛肉", "卤牛肉", "瘦牛肉", "牛排", "牛肉", "牛腩", "战斧牛排"],
    cal100g: 180, p100g: 22.0, c100g: 0.0, f100g: 10.0,
    defaultGrams: 200,
    unitGrams: { "大块": 300, "小块": 100, "块": 150, "大片": 80, "小片": 30, "片": 50, "大份": 300, "小份": 120, "份": 200, "两": 50, "斤": 500 }
  },
  {
    name: "鱼虾海鲜",
    aliases: ["三文鱼", "基围虾", "清蒸鱼", "鱼排", "鱼肉", "虾仁", "虾", "大虾"],
    cal100g: 120, p100g: 20.0, c100g: 0.0, f100g: 4.5,
    defaultGrams: 150,
    unitGrams: { "大只": 25, "小只": 10, "只": 15, "大个": 25, "小个": 10, "个": 15, "整条": 350, "条": 250, "半条": 125, "块": 150, "大份": 250, "小份": 100, "份": 150 }
  },
  {
    name: "豆腐/豆制品",
    aliases: ["水豆腐", "老豆腐", "千张", "豆干", "豆皮", "豆腐"],
    cal100g: 84, p100g: 8.1, c100g: 3.8, f100g: 4.2,
    defaultGrams: 150,
    unitGrams: { "大块": 250, "小块": 80, "块": 150, "大盒": 400, "盒": 300, "大份": 250, "小份": 100, "份": 150 }
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
    aliases: ["时蔬", "沙拉", "生菜", "黄瓜", "番茄", "西红柿", "菠菜", "蔬菜", "青菜"],
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
    aliases: ["苹果", "梨", "橙子", "火龙果"],
    cal100g: 52, p100g: 0.3, c100g: 13.8, f100g: 0.2,
    defaultGrams: 150,
    unitGrams: { "大个": 230, "小个": 100, "个": 150, "大只": 230, "小只": 100, "只": 150, "半个": 75 }
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

    // 3. Scan for all matching food entities in the text
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

        const contextBefore = text.slice(prevEnd, curr.start);
        const contextAfter = text.slice(curr.end, nextStart);
        const contextSlice = (contextBefore + " " + curr.alias + " " + contextAfter).trim();

        let totalGrams = curr.profile.defaultGrams;
        let countUnitLabel = "";

        // Check for explicit grams/kg/ml (e.g. "200克", "两百克", "0.5kg", "2斤", "二两", "半斤", "半公斤")
        const explicitGramPattern = /([半零一二两俩三四五六七八九十百千0-9.]+)\s*(千克|公斤|kg|毫升|ml|克|g|斤|两)/i;
        const egMatch = contextSlice.match(explicitGramPattern);

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
            countUnitLabel = `${Math.round(totalGrams)}g`;
          }
        } else {
          // Check for fine-grained units with size prefixes (e.g. "一大碗", "一小份", "大杯", "两包", "半个", "小桶")
          const unitKeys = Object.keys(curr.profile.unitGrams || {});
          // Sort keys by length descending (so "大碗", "小碗", "超大杯" match before "碗", "杯")
          unitKeys.sort((a, b) => b.length - a.length);

          const unitPatternStr = `([零一二两俩三四五六七八九十百千0-9.]*)\\s*(${unitKeys.join("|")}|大份|小份|中份|份|大碗|小碗|平碗|满碗|半碗|碗|大杯|中杯|小杯|超大杯|杯|大盘|小盘|盘|大块|小块|半块|块|大片|厚片|薄片|片|大根|小根|半根|根|大个|小个|半个|个|大只|小只|只|大包|小包|包|大袋|小袋|袋|大桶|桶|大罐|罐|听|大瓶|小瓶|瓶|大盒|小盒|盒|大勺|平勺|半勺|勺|串|张|笼)`;
          const unitMatch = contextSlice.match(new RegExp(unitPatternStr));

          if (unitMatch && unitMatch[2]) {
            const rawNum = unitMatch[1].trim();
            const count = rawNum ? (parseChineseDietNum(rawNum) || 1) : 1;
            const unit = unitMatch[2];

            let perUnitGram = (curr.profile.unitGrams && curr.profile.unitGrams[unit]) ? curr.profile.unitGrams[unit] : null;

            // Fallback rule for size prefixes if not explicitly in unitGrams
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
            // Standalone number prefix
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
        ? `⚠️ 单餐热量极高 (${totalCal} kcal)！已严重超出建议，注意全天热量平衡！`
        : `AI 营养算法：根据精准分量规格计算热量 ${totalCal} kcal (蛋白 ${totalP}g)，已实时计入缺口！`
    };
  }
};

if (typeof window !== 'undefined') {
  window.NutritionEngine = NutritionEngine;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = NutritionEngine;
}
