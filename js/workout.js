/**
 * 练食AI · 高精度训练动作/组数/次数/重量精准语音解析引擎
 * 支持全场景中文字词、复合乘除、缺省单位智能消歧与超负荷双重累进加片建议
 */

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

  // Handle "点" (e.g. "两点五", "八十二点五", "2点5", "0点5")
  if (str.includes("点")) {
    const parts = str.split("点");
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
  if (str.length === 1 && digits[str] !== undefined) {
    return digits[str];
  }

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
    // Colloquial check: "两百五" -> 250, "一百二" -> 120
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
  return total > 0 ? total : null;
}

// Convert all Chinese numerals in a string into standardized Arabic digits
function normalizeTextWithNumbers(text) {
  if (!text) return "";
  let s = text.trim();

  // Normalize punctuation and spoken fillers
  s = s.replace(/[，、；;。！!\n\r]+/g, "，");
  s = s.replace(/(?:然后|接着|之后|再做了|再来|最后|还有|另外|顺便|换成|继续)+/g, "，");

  // Normalize self-bodyweight and empty bar
  s = s.replace(/(?:自重|徒手|不加重量|不加重|净体重)/g, " 0公斤 ");
  s = s.replace(/空杆/g, " 20公斤 ");

  // Pattern to find Chinese number phrases (e.g. "一百二十五点五", "八十", "四", "12点5")
  const chNumRegex = /([零一二两俩三四五六七八九十百千0-9]+(?:点[零一二三四五六七八九0-9]+)?)/g;

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
  { name: "二头肌弯举", aliases: ["二头弯举", "哑铃弯举", "杠铃弯举", "锤式弯举", "牧师凳弯举", "弯举"], muscle: "手臂", compound: false, minIncrement: 1.0, targetReps: 12 },
  { name: "三头肌绳索下压", aliases: ["三头下压", "绳索下压", "三头肌下压", "仰卧臂屈伸", "碎颅者"], muscle: "手臂", compound: false, minIncrement: 1.25, targetReps: 12 },
  { name: "跑步机有氧", aliases: ["跑步机", "慢跑", "跑步", "划船机", "爬楼机", "椭圆机", "单车"], muscle: "有氧", compound: false, minIncrement: 0, targetReps: 1 }
];

const WorkoutEngine = {
  parseWorkoutVoice(rawVoiceText) {
    if (!rawVoiceText || !rawVoiceText.trim()) return [];

    // 1. Normalize numbers and split segments
    const normalized = normalizeTextWithNumbers(rawVoiceText);
    const segments = normalized.split(/[,，+＋]/).map(s => s.trim()).filter(s => s.length > 0);
    const results = [];

    for (const segment of segments) {
      let exerciseName = "杠铃卧推";
      let muscle = "胸部";

      // Match exercise name from knowledge base aliases (longest alias first)
      let foundExercise = false;
      const allAliases = [];
      EXERCISE_KNOWLEDGE_BASE.forEach(item => {
        item.aliases.forEach(alias => {
          allAliases.push({ alias, item });
        });
      });
      allAliases.sort((a, b) => b.alias.length - a.alias.length);

      for (const entry of allAliases) {
        if (segment.includes(entry.alias)) {
          exerciseName = entry.item.name;
          muscle = entry.item.muscle;
          foundExercise = true;
          break;
        }
      }

      const hasNumbers = /[0-9]/.test(segment);
      if (!foundExercise) {
        if (!hasNumbers) {
          // Pure chatter segment like "今天练了胸", ignore
          continue;
        }

        if (segment.includes("上斜") || segment.includes("哑铃推胸")) { exerciseName = "哑铃上斜卧推"; muscle = "胸部"; }
        else if (segment.includes("卧推") || segment.includes("推胸")) { exerciseName = "杠铃卧推"; muscle = "胸部"; }
        else if (segment.includes("深蹲") || segment.includes("后蹲")) { exerciseName = "杠铃深蹲"; muscle = "腿部"; }
        else if (segment.includes("硬拉")) { exerciseName = "传统硬拉"; muscle = "背部/臀腿"; }
        else if (segment.includes("推举") || segment.includes("肩推")) { exerciseName = "杠铃推举"; muscle = "肩部"; }
        else if (segment.includes("划船")) { exerciseName = "杠铃划船"; muscle = "背部"; }
        else if (segment.includes("侧平举")) { exerciseName = "哑铃侧平举"; muscle = "肩部"; }
        else if (segment.includes("下拉")) { exerciseName = "高位下拉"; muscle = "背部"; }
        else if (segment.includes("弯举")) { exerciseName = "二头肌弯举"; muscle = "手臂"; }
        else if (segment.includes("臂屈伸")) { exerciseName = "双杠臂屈伸"; muscle = "胸部"; }
        else if (segment.includes("跑步") || segment.includes("有氧")) { exerciseName = "跑步机有氧"; muscle = "有氧"; }
        else {
          const cleanNameMatch = segment.match(/^([^\d\s]{2,8})/);
          exerciseName = cleanNameMatch ? cleanNameMatch[1] : "综合力量训练";
          muscle = "复合训练";
        }
      }

      // --- High-Precision Extraction of Weight, Sets, Reps, RPE ---
      let weightKg = null;
      let sets = null;
      let reps = null;
      let rpe = null;

      // 1. Sets x Reps Compound Pattern (e.g. "4*8", "4x10", "4乘10", "4个10")
      const multiMatch = segment.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:[*xX乘××]|个)\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (multiMatch) {
        const v1 = parseFloat(multiMatch[1]);
        const v2 = parseFloat(multiMatch[2]);
        if (v1 <= 15 && v2 <= 50) {
          sets = Math.round(v1);
          reps = Math.round(v2);
        }
      }

      // 2. Explicit Sets Pattern (e.g. "4组", "做4组", "4 sets")
      if (sets === null) {
        const sm = segment.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:组|组数|set|sets)/i);
        if (sm && sm[1]) {
          sets = Math.round(parseFloat(sm[1]));
        }
      }

      // 3. Explicit Reps Pattern (e.g. "8次", "每组8个", "10下", "8 reps")
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

      // 4. Explicit Weight Pattern (e.g. "80公斤", "80kg", "单边24kg", "0公斤", "120千克", "80磅")
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

      // 5. Explicit RPE Pattern
      const rpeMatch = segment.match(/(?:rpe|RPE|自觉强度|强度|疲劳度)\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (rpeMatch && rpeMatch[1]) {
        rpe = parseFloat(rpeMatch[1]);
      }

      // 6. Context-Aware Intelligent Disambiguation for unassigned numbers
      // Extract all numbers in the segment that haven't been used yet
      const allFoundNums = [...segment.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\b/g)].map(m => parseFloat(m[1]));

      // Filter out numbers that already exactly match parsed sets or reps
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

      // If weightKg is still null and we have unassigned numbers
      if (weightKg === null && unassignedNums.length > 0) {
        // Look for number >= 20 (heavy weight) or large number
        const heavyIdx = unassignedNums.findIndex(n => n >= 20);
        if (heavyIdx !== -1) {
          weightKg = unassignedNums[heavyIdx];
          unassignedNums.splice(heavyIdx, 1);
        } else if (unassignedNums.length > 0) {
          weightKg = unassignedNums[0];
          unassignedNums.splice(0, 1);
        }
      }

      // If sets is still null and unassigned numbers remain
      if (sets === null && unassignedNums.length > 0) {
        const setIdx = unassignedNums.findIndex(n => n <= 10);
        if (setIdx !== -1) {
          sets = Math.round(unassignedNums[setIdx]);
          unassignedNums.splice(setIdx, 1);
        } else {
          sets = Math.round(unassignedNums[0]);
          unassignedNums.splice(0, 1);
        }
      }

      // If reps is still null and unassigned numbers remain
      if (reps === null && unassignedNums.length > 0) {
        reps = Math.round(unassignedNums[0]);
        unassignedNums.splice(0, 1);
      }

      // Sensible Defaults if still missing
      if (weightKg === null) {
        const isBodyweight = exerciseName.includes("自重") || exerciseName.includes("引体") || exerciseName.includes("双杠");
        weightKg = isBodyweight ? 0.0 : (exerciseName.includes("哑铃") ? 14.0 : 60.0);
      }
      if (sets === null || sets <= 0) sets = 4;
      if (reps === null || reps <= 0) reps = 8;
      if (rpe === null) rpe = 8.0;

      // Energy burn calculation
      const isCompound = exerciseName.includes("卧推") || exerciseName.includes("深蹲") || exerciseName.includes("硬拉") || exerciseName.includes("划船") || exerciseName.includes("倒蹬");
      const estBurn = isCompound ? Math.round(sets * 28 + (weightKg * 0.45)) : Math.round(sets * 18 + (weightKg * 0.2));

      results.push({
        exerciseName,
        muscleGroup: muscle,
        sets,
        reps,
        weightKg,
        rpe,
        burnedCalories: estBurn,
        notes: `AI 识别自语音: ${segment}`
      });
    }

    if (results.length === 0) {
      results.push({
        exerciseName: "杠铃卧推",
        muscleGroup: "胸部",
        sets: 4,
        reps: 8,
        weightKg: 80.0,
        rpe: 8.0,
        burnedCalories: 148,
        notes: rawVoiceText
      });
    }

    return results;
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
  }
};

if (typeof window !== 'undefined') {
  window.WorkoutEngine = WorkoutEngine;
  window.parseChineseUniversalNum = parseChineseUniversalNum;
  window.normalizeTextWithNumbers = normalizeTextWithNumbers;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkoutEngine, parseChineseUniversalNum, normalizeTextWithNumbers };
}
