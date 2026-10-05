/**
 * 小人能动手（v6.5，用户：「让 AI 像 Agent 一样去动我们的软件：我跟小人说明天要练之前的计划 A，帮我把计划 A 放成明天的计划，
 * 它能做到；很多决策是重复的，可以写成 Skill，省 token、省时间」）。
 *
 * 这里是本机就能认的常用说法（技能），认出来直接做，不调大模型、不等：
 *   usePlan   「明天练计划A」「把练腿日排到周五」          → 把存好的计划放到那天
 *   movePlan  「把明天的计划挪到后天」                       → 挪计划
 *   clearPlan 「明天不练了」「取消周五的计划」               → 清掉那天没做的计划
 *   copyDay   「把上周一练的放到明天」「明天照着上周一练」  → 那天的记录照搬成计划
 *   savePlan  「把这个计划存起来叫练腿日」「把今天练的存成计划A」 → 存进计划本
 * 认不出的交给大模型，它也能输出同样的动作（parser 的 act，规则 12），手机照着做（app/agent.js 的 runActs）。
 * 纯函数，node 里能测。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  const WK = '日一二三四五六天';
  // 说到哪一天：今天 / 明天 / 后天 / 昨天 / 周三 / 下周三 / 上周一 / 下个星期五
  const DAY = '(今天|今晚|今早|明天|明早|明晚|后天|大后天|昨天|昨晚|前天|(?:上|下)*个?(?:周|星期|礼拜)[一二三四五六日天])';

  /** 「明天」「下周三」「上周一」→ 相对 now 那天差几天（按自然周，周一开头） */
  function dayOffset(word, now) {
    now = now || new Date();
    const w = String(word || '');
    const fixed = { 今天: 0, 今晚: 0, 今早: 0, 明天: 1, 明早: 1, 明晚: 1, 后天: 2, 大后天: 3, 昨天: -1, 昨晚: -1, 前天: -2 };
    if (w in fixed) return fixed[w];
    const m = w.match(/^((?:上|下)*)个?(?:周|星期|礼拜)([一二三四五六日天])$/);
    if (!m) return null;
    const mon = (x) => (x + 6) % 7;
    const target = mon(WK.indexOf(m[2]) % 7), today = mon(now.getDay());
    const up = (m[1].match(/下/g) || []).length, back = (m[1].match(/上/g) || []).length;
    if (up) return 7 * up - today + target;
    if (back) return -7 * back - today + target;
    return target >= today ? target - today : target - today + 7; // 没说上下周：今天以后最近的那天
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[\s「」『』“”"'‘’《》·,，。.!！?？]/g, '').replace(/[ａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  /** 句子里说到了哪个存好的计划（最长的那个；「计划a」也认「计划A」） */
  function findName(text, names) {
    const t = norm(text);
    return (names || []).filter(n => n && t.includes(norm(n))).sort((a, b) => norm(b).length - norm(a).length)[0] || '';
  }

  const cleanName = (s) => String(s || '').replace(/^[：:是为成叫]+/, '').replace(/[吧呀啊了哈嘛呢。.!！,，～~]+$/, '').replace(/[「」『』“”"']/g, '').trim().slice(0, 12);

  /**
   * 本机认得出的动手说法 → 一个动作（和大模型的 act 一样的格式，dayOffset 相对今天）；认不出返回 null。
   * names：计划本里存好的计划名字。在问（「明天练计划A行吗？」）的不认，交给大模型。
   */
  function matchSkill(text, names, now) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 60 || /[？?]\s*$|吗[。！!]?\s*$|怎么|为什么|行不行|好不好/.test(raw)) return null;
    const t = raw.replace(/\s+/g, '');
    const off = (w) => dayOffset(w, now);
    let m;
    // 挪计划：「把明天的计划挪到后天」
    if ((m = t.match(new RegExp(`${DAY}的?(?:计划|训练|安排)都?(?:挪|移|换|改|放|推|调|搬)(?:到|去|成)${DAY}`)))) {
      const from = off(m[1]), to = off(m[2]);
      if (from != null && to != null && from !== to) return { do: 'movePlan', from, to };
    }
    // 清掉计划：「明天不练了」「取消周五的计划」
    if ((m = t.match(new RegExp(`(?:取消|删掉|删了|清掉|清空|不要)${DAY}的?(?:计划|训练|安排)`))) ||
        (m = t.match(new RegExp(`${DAY}的?(?:计划|训练|安排)(?:不要了|取消|删掉|清掉|清空|算了)`))) ||
        (m = t.match(new RegExp(`^(?:我)?${DAY}不(?:练|去练|健身)了`)))) {
      const d = off(m[1]);
      if (d != null && d >= 0) return { do: 'clearPlan', dayOffset: d };
    }
    // 照搬：「把上周一练的放到明天」「明天照着上周一练」
    if ((m = t.match(new RegExp(`${DAY}(练的|吃的|的训练|的饮食|的动作)(?:那些|那套)?(?:也)?(?:放到|排到|复制到|照搬到|搬到|安排到|挪到|放在|排在)${DAY}`)))) {
      const from = off(m[1]), to = off(m[3]);
      if (from != null && to != null && from !== to) return { do: 'copyDay', from, to, what: /吃|饮食/.test(m[2]) ? 'meals' : 'workouts' };
    }
    if ((m = t.match(new RegExp(`${DAY}(?:就)?(?:照着|照|按照|按|跟)${DAY}(?:的|那样|那套)?(练|吃)`)))) {
      const to = off(m[1]), from = off(m[2]);
      if (from != null && to != null && from !== to && from < 0) return { do: 'copyDay', from, to, what: m[3] === '吃' ? 'meals' : 'workouts' };
    }
    // 存进计划本：「把这个计划存起来叫练腿日」「把今天练的存成计划A」
    if ((m = t.match(new RegExp(`${DAY}(练的|吃的|的训练|的饮食|的计划)(?:存|保存|收藏)(?:起来|下来|一下)?(?:(?:叫|成|为|名字叫|命名为)(.{1,14}))?$`)))) {
      const d = off(m[1]);
      if (d != null) return { do: 'savePlan', from: /计划/.test(m[2]) ? 'dayplan' : 'day', what: /吃|饮食/.test(m[2]) ? 'meals' : 'workouts', dayOffset: d, name: cleanName(m[3]) };
    }
    if ((m = t.match(/(?:刚才的?|这个|这份|这套|那个)?(?:计划|食谱|训练计划|训练)(?:存|保存|收藏)(?:起来|下来|一下)?(?:(?:叫|成|为|名字叫|命名为)(.{1,14}))?$/)) && !new RegExp(DAY).test(t.slice(0, m.index + 1))) {
      return { do: 'savePlan', from: 'plan', name: cleanName(m[1]) };
    }
    // 用存好的计划：「明天练计划A」「把练腿日排到周五」
    const name = findName(t, names);
    if (name && (m = t.match(new RegExp(DAY))) && /放|排|安排|练|用|照|按|换|改|设|当|做|上/.test(t.replace(norm(name), ''))) {
      const d = off(m[1]);
      if (d != null && d >= 0) return { do: 'usePlan', name, dayOffset: d };
    }
    return null;
  }

  TF.AgentIntent = { DAY, dayOffset, findName, matchSkill, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.AgentIntent;
})(typeof window !== 'undefined' ? window : globalThis);
