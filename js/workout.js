/**
 * 练食AI · 高精度训练动作/组数/次数/重量语音解析引擎
 */

// Comprehensive Chinese number normalization
function parseChineseNum(str) {
  if (!str) return null;
  str = str.trim();

  // If already standard number
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(str)) {
    return parseFloat(str);
  }

  // Handle "两点五", "2点5", "八十二点五"
  if (str.includes("点")) {
    const parts = str.split("点");
    const intPart = parseChineseNum(parts[0]) || 0;
    const decPart = parseChineseNum(parts[1]) || 0;
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
      // Mixed ascii numbers
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
    const parsed = parseChineseNum(match);
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

      // Match exercise name from knowledge base aliases (sorted by longest alias first)
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
          // Pure chatter segment like "今天练了胸" or "打卡记录", ignore
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

      // --- Precise Extraction of Weight, Sets, Reps, RPE ---
      let weightKg = null;
      let sets = null;
      let reps = null;
      let rpe = null;

      // 1. Extract Weight (kg / 公斤 / 千克 / 磅)
      // Patterns: "80公斤", "80 kg", "重量80", "单边24kg", "0公斤"
      const weightPatterns = [
        /(?:重量|重|负重|单边|每边|挂)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:公斤|kg|千克|KG|Kg)/i,
        /(?:重量|负重|重)\s*([0-9]+(?:\.[0-9]+)?)/i,
        /([0-9]+(?:\.[0-9]+)?)\s*(?:磅|lb|lbs)/i
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

      // 2. Extract Sets (组 / 组数)
      // Patterns: "4组", "做4组", "4 sets", "4*8", "4x8", "4乘8"
      const setPatterns = [
        /([0-9]+)\s*(?:组|组数|set|sets)/i,
        /(?:做了|完成|共)?\s*([0-9]+)\s*组/i,
        /([0-9]+)\s*(?:[*xX乘×])\s*([0-9]+)/i // 4*8 or 4乘8 -> sets=4, reps=8
      ];

      const multiMatch = segment.match(/([0-9]+)\s*(?:[*xX乘×])\s*([0-9]+)/i);
      if (multiMatch) {
        sets = parseInt(multiMatch[1], 10);
        reps = parseInt(multiMatch[2], 10);
      } else {
        const sm = segment.match(/([0-9]+)\s*(?:组|组数|set|sets)/i);
        if (sm && sm[1]) {
          sets = parseInt(sm[1], 10);
        }
      }

      // 3. Extract Reps (次 / 个 / 下 / reps)
      // Patterns: "8次", "每组8次", "8个", "8下", "每组8"
      if (reps === null) {
        const repPatterns = [
          /(?:每组|每组做|每组能做|均)?\s*([0-9]+)\s*(?:次|个|下|reps|rep)/i,
          /([0-9]+)\s*(?:次|个|下)/i,
          /(?:每组)\s*([0-9]+)/i
        ];

        for (const rp of repPatterns) {
          const m = segment.match(rp);
          if (m && m[1]) {
            reps = parseInt(m[1], 10);
            break;
          }
        }
      }

      // 4. Extract RPE
      const rpeMatch = segment.match(/rpe\s*([0-9]+(?:\.[0-9]+)?)/i) || segment.match(/自觉强度\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (rpeMatch && rpeMatch[1]) {
        rpe = parseFloat(rpeMatch[1]);
      }

      // 5. Smart Positional Fallback if missing labels (e.g. "卧推 80 4 8" or "深蹲 100 4 6")
      if (weightKg === null || sets === null || reps === null) {
        // Collect all standalone numbers in order
        const allNums = [...segment.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\b/g)].map(m => parseFloat(m[1]));
        if (allNums.length >= 3) {
          if (weightKg === null) weightKg = allNums[0];
          if (sets === null) sets = parseInt(allNums[1], 10);
          if (reps === null) reps = parseInt(allNums[2], 10);
        } else if (allNums.length === 2) {
          if (sets === null) sets = parseInt(allNums[0], 10);
          if (reps === null) reps = parseInt(allNums[1], 10);
        }
      }

      // Sensible Defaults if still missing
      if (weightKg === null) {
        weightKg = (exerciseName.includes("自重") || exerciseName.includes("引体") || exerciseName.includes("双杠")) ? 0.0 : 60.0;
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
        burnedCalories: 150,
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

    for (const [exercise, logs] of Object.entries(grouped)) {
      const latest = logs[logs.length - 1];
      const isCompound = exercise.includes("卧推") || exercise.includes("深蹲") || exercise.includes("硬拉") || exercise.includes("推举") || exercise.includes("划船");
      const targetRepsGoal = (exercise.includes("硬拉") || exercise.includes("深蹲")) ? 6 : 8;
      const increment = isCompound ? 2.5 : 1.25;
      const muscle = latest.muscleGroup || "力量动作";

      if (latest.reps >= targetRepsGoal && latest.sets >= 3 && (latest.rpe || 8.0) <= 8.5) {
        const nextWeight = latest.weightKg + increment;
        advices.push({
          exerciseName: exercise,
          muscleGroup: muscle,
          currentWeightKg: latest.weightKg,
          currentSets: latest.sets,
          currentReps: latest.reps,
          currentRpe: latest.rpe || 8.0,
          adviceType: "ADD_WEIGHT",
          reason: `已达成目标次数（${latest.reps}次）且 RPE 控制在 ${latest.rpe || 8.0}，力量储备充足，满足渐进超负荷标准！`,
          targetWeightKg: nextWeight,
          targetSets: latest.sets,
          targetReps: Math.max(targetRepsGoal - 2, 6),
          confidenceScore: 0.96
        });
      } else if ((latest.rpe || 8.0) >= 9.5) {
        advices.push({
          exerciseName: exercise,
          muscleGroup: muscle,
          currentWeightKg: latest.weightKg,
          currentSets: latest.sets,
          currentReps: latest.reps,
          currentRpe: latest.rpe || 9.5,
          adviceType: "BUILD_VOLUME",
          reason: `当前 RPE 较高 (${latest.rpe})，建议保持当前重量巩固动作轨迹与离心控制，提升耐受度。`,
          targetWeightKg: latest.weightKg,
          targetSets: latest.sets,
          targetReps: latest.reps + 1,
          confidenceScore: 0.90
        });
      } else {
        advices.push({
          exerciseName: exercise,
          muscleGroup: muscle,
          currentWeightKg: latest.weightKg,
          currentSets: latest.sets,
          currentReps: latest.reps,
          currentRpe: latest.rpe || 8.0,
          adviceType: "ADD_REPS",
          reason: `当前重量适应良好，下次训练目标每组增加 1 次（挑战 ${latest.reps + 1} 次），积累容量。`,
          targetWeightKg: latest.weightKg,
          targetSets: latest.sets,
          targetReps: latest.reps + 1,
          confidenceScore: 0.92
        });
      }
    }

    return advices;
  }
};

if (typeof window !== 'undefined') {
  window.WorkoutEngine = WorkoutEngine;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkoutEngine;
}
