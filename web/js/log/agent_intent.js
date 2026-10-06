/**
 * 小人能动手（v6.5，用户：「让 AI 像 Agent 一样去动我们的软件：我跟小人说明天要练之前的计划 A，帮我把计划 A 放成明天的计划，
 * 它能做到；很多决策是重复的，可以写成 Skill，省 token、省时间」）。
 *
 * 这里是本机就能认的常用说法（技能），认出来直接做，不调大模型、不等：
 *   usePlan   「明天练计划A」「把练腿日排到周五」「今天练序列A」（存的是「序列A 上肢日」）→ 把存好的计划放到那天
 *   movePlan  「把明天的计划挪到后天」「把明天的饮食搬到今天」→ 挪计划（只挪吃的 / 练的）
 *   donePlan  「上肢日都练完了」「今天的计划都完成了」        → 照计划全记上（v9.2）
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

  /**
   * 一份计划的几种叫法（v9.2，用户：「序列A 上肢日」说成「今天练序列A」也要认得）：全名，加上名字里像编号的那一段
   * （「序列A」「计划B」「A日」「Day1」——带字母、数字，或者「序列 / 计划 / 方案 / 课表」开头的）。「上肢」「练腿」这种部位词不单独认，
   * 不然「今天练了上肢」会被当成放计划。
   */
  function nameKeys(n) {
    const raw = String(n || '');
    const keys = [norm(raw)];
    raw.split(/[\s·\-_/、，,]+/).forEach(p => { if (/[a-z0-9]/i.test(p) || /^(序列|计划|方案|课表)/.test(p)) keys.push(norm(p)); });
    (raw.match(/(?:序列|计划|方案|课表)\s*[A-Za-z0-9一二三四五六七八九十]+/g) || []).forEach(p => keys.push(norm(p)));
    return [...new Set(keys)].filter(k => k.length >= 2 || k === keys[0]);
  }

  /** 句子里说到了哪个存好的计划：{ name, key（句子里对上的那几个字） }；全名优先、长的优先，编号那一段只认只有一份计划用它的 */
  function findNameKey(text, names) {
    const t = norm(text);
    const list = (names || []).filter(Boolean);
    const full = list.filter(n => norm(n) && t.includes(norm(n))).sort((a, b) => norm(b).length - norm(a).length)[0];
    if (full) return { name: full, key: norm(full) };
    const owners = {};
    list.forEach(n => nameKeys(n).slice(1).forEach(k => { (owners[k] = owners[k] || new Set()).add(n); }));
    const hit = Object.keys(owners).filter(k => owners[k].size === 1 && t.includes(k)).sort((a, b) => b.length - a.length)[0];
    return hit ? { name: [...owners[hit]][0], key: hit } : { name: '', key: '' };
  }

  /** 说起来最顺口的叫法：「序列A 上肢日」→「序列A」（名字里有编号的那一段，没有就是全名） */
  function shortName(n) {
    const raw = String(n || '').trim();
    const m = raw.match(/(?:序列|计划|方案|课表)\s*[A-Za-z0-9一二三四五六七八九十]+/) || raw.split(/\s+/).filter(p => /[a-z0-9]/i.test(p) && p.length >= 2).map(p => [p])[0];
    return m && m[0] !== raw ? m[0] : raw;
  }

  /** 句子里说到了哪个存好的计划（最长的那个；「计划a」也认「计划A」，「序列a」也认「序列A 上肢日」） */
  function findName(text, names) {
    return findNameKey(text, names).name;
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
    // 挪计划：「把明天的计划挪到后天」「把明天的饮食搬到今天」「明天那几顿吃的，改成今天吃吧」（v9.2：只挪吃的 / 练的）；从以前的日子搬是照搬记录，下面 copyDay 管
    if ((m = t.match(new RegExp(`${DAY}(?:的|那几顿|那顿|那些|的那些)?(计划|训练|安排|待办|饮食|食谱|菜单|吃的|练的|饭|三顿)[，,]?都?(?:挪|移|换|改|放|推|调|搬)(?:到|去|成)${DAY}`)))) {
      const from = off(m[1]), to = off(m[3]);
      const what = /饮食|食谱|菜单|吃|饭|顿/.test(m[2]) ? 'meals' : /训练|练/.test(m[2]) ? 'workouts' : '';
      if (from != null && to != null && from !== to && from >= 0) return Object.assign({ do: 'movePlan', from, to }, what ? { what } : {});
    }
    // 计划都做完了：「上肢日都练完了」「今天的计划都完成了」「待办全做完了」→ 照计划全记上（v9.2，不用一行行点 ✓）
    // 说了是哪一顿的（「早饭午饭都吃完了」）交给大模型挑那几行，别把晚饭也记上
    if (/(都|全|全部|全都)(练完|做完|吃完|完成|搞定|打卡)(了|啦)?$/.test(t.replace(/[。.!！~～]+$/, '')) && /计划|待办|清单|训练|动作|练|吃|日/.test(t) && !/早|午|晚|加餐|夜宵/.test(t.replace(/今早|今晚/g, ''))) {
      const dm = t.match(new RegExp(DAY));
      const d = dm ? off(dm[1]) : 0;
      const what = /吃/.test(t) && !/练|训练|动作/.test(t) ? 'meals' : /练|训练|动作/.test(t) && !/吃/.test(t) ? 'workouts' : 'all';
      if (d != null && d <= 0 && d >= -1) return { do: 'donePlan', dayOffset: d, what };
    }
    // 清掉计划：「明天不练了」「取消周五的计划」
    if ((m = t.match(new RegExp(`(?:取消|删掉|删了|清掉|清空|不要)${DAY}的?(?:计划|训练|安排)`))) ||
        (m = t.match(new RegExp(`${DAY}的?(?:计划|训练|安排)(?:不要了|取消|删掉|清掉|清空|算了)`))) ||
        (m = t.match(new RegExp(`^(?:我)?${DAY}不(?:练|去练|健身)了`)))) {
      const d = off(m[1]);
      if (d != null && d >= 0) return { do: 'clearPlan', dayOffset: d };
    }
    // 照搬：「把上周一练的放到明天」「明天照着上周一练」「把明天的食谱复制到今天」（计划照搬，原来那天的留着）
    if ((m = t.match(new RegExp(`${DAY}的?(饮食|食谱|计划|训练)(?:复制|抄|照搬)(?:到|给)${DAY}`)))) {
      const from = off(m[1]), to = off(m[3]);
      if (from != null && to != null && from !== to) return { do: 'copyDay', from, to, what: /饮食|食谱/.test(m[2]) ? 'meals' : 'workouts' };
    }
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
    const { name, key } = findNameKey(t, names);
    if (name && (m = t.match(new RegExp(DAY))) && /放|排|安排|练|用|照|按|换|改|设|当|做|上/.test(norm(t).replace(key, ''))) {
      const d = off(m[1]);
      if (d != null && d >= 0) return { do: 'usePlan', name, dayOffset: d };
    }
    return null;
  }

  TF.AgentIntent = { DAY, dayOffset, findName, findNameKey, nameKeys, shortName, matchSkill, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.AgentIntent;
})(typeof window !== 'undefined' ? window : globalThis);
