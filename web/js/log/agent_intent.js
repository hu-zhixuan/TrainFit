/**
 * 小人能动手（v6.5，用户：「让 AI 像 Agent 一样去动我们的软件：我跟小人说明天要练之前的计划 A，帮我把计划 A 放成明天的计划，
 * 它能做到；很多决策是重复的，可以写成 Skill，省 token、省时间」）。
 *
 * 这里是本机就能认的常用说法（技能），认出来直接做，不调大模型、不等：
 *   usePlan   「明天练计划A」「把练腿日排到周五」「今天练序列A」（存的是「序列A 上肢日」）→ 把存好的计划放到那天
 *             「今天练了序列A」「序列A练完了」（已经练了，done: true）→ 照这份计划记上（v12.9.1）
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
    if (!name) return null;
    const rest = norm(t).replace(key, '');
    // 已经练完了（「今天练了序列A」「序列A练完了」「今天按序列B练的」，v12.9.1）：是记录，不是排计划——照这份计划记上。
    // 以前这几句也认成「今天练序列A」，每天练完说一句，就把整份计划又排进今天一遍。说了数、问了几次的交给大模型照实际的记
    if (/练了|练完|练过|做完|做了|练的|做的|用的|打卡|搞定|完成|结束/.test(rest)) {
      if (/几|多少|哪|\d|[一两二三四五六七八九十半]+(组|个|次|下|公斤|kg|斤|分钟|小时)/.test(rest)) return null;
      m = t.match(new RegExp(DAY));
      const d = m ? off(m[1]) : 0;
      return d != null && d <= 0 && d >= -1 ? { do: 'usePlan', name, dayOffset: d, done: true } : null;
    }
    if ((m = t.match(new RegExp(DAY))) && /放|排|安排|练|用|照|按|换|改|设|当|做|上/.test(rest)) {
      const d = off(m[1]);
      if (d != null && d >= 0) return { do: 'usePlan', name, dayOffset: d };
    }
    return null;
  }

  // ---------- 改这天的计划（v12.9，用户：「计划不能很方便地改，语音也不行；口喷就能做渐进超负荷，或者系统自动推荐」） ----------
  const NUM = '\\d+(?:\\.\\d+)?|[零〇一幺两二三四五六七八九十百]+(?:点[零〇一二三四五六七八九]+)?';
  const toNum = (s) => (s == null ? null : /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : TF.cnNum ? TF.cnNum(s) : null);
  const EQUIP = /^(杠铃|哑铃|器械|史密斯|绳索|壶铃|龙门架|悍马)$/;
  const PRE = /^(杠铃|哑铃|器械|史密斯|坐姿|站姿|绳索|俯身|上斜|下斜|平板|龙门架|悍马|固定器械|单臂|双臂)/;
  /** 动作去掉器械 / 姿势前缀：「坐姿哑铃推举」→「推举」（说「推举改成 20 公斤」也认得） */
  function liftCore(n) {
    let s = norm(n);
    for (let i = 0; i < 3; i++) { const t = s.replace(PRE, ''); if (t === s || t.length < 2) break; s = t; }
    return s;
  }

  /**
   * 句子里说的是计划里哪一行：全名 > 去掉前缀的 > 末两个字 / 头两个字（只有一行对得上时）；先说到的那个是主语（「推举放到卧推前面」）。
   * 同一个说法两行都对得上（「卧推」：杠铃卧推、上斜卧推）返回 null，交给大模型
   */
  function findRow(t, rows, skip) {
    const pickers = [(r) => norm(r.name), (r) => liftCore(r.name), (r) => liftCore(r.name).slice(-2), (r) => (liftCore(r.name).length >= 4 ? liftCore(r.name).slice(0, 2) : '')];
    const hits = [];
    rows.filter(r => r.name && r !== skip).forEach(r => {
      for (let lv = 0; lv < pickers.length; lv++) {
        const k = pickers[lv](r);
        if (k && k.length >= 2 && t.includes(k)) { hits.push({ r, k, lv, i: t.indexOf(k) }); break; }
      }
    });
    if (!hits.length) return null;
    hits.sort((a, b) => a.i - b.i || a.lv - b.lv || b.k.length - a.k.length);
    const top = hits[0];
    if (hits.some(h => h !== top && h.k === top.k && h.lv === top.lv)) return null;
    return { row: top.r, key: top.k };
  }

  /**
   * 说的是在改这天的训练计划：返回一个 editPlan 动作（runActs 照着做），认不出返回 null。
   * rows：这天计划的每一行（按顺序）{ id, kind, name, done, weightKg, sets, reps, durationMin }。
   *  「卧推改成 60 公斤」「深蹲加一组」「引体每组 8 个」「硬拉 5×5」「跑步改 30 分钟」→ set（算好的绝对值）
   *  「不做硬拉了」「去掉飞鸟」→ drop；「先做深蹲」「卧推放最后」「推举放到卧推前面」「卧推和深蹲换一下」→ move
   *  「卧推练完了」→ done；「卧推还没做」「撤回卧推」（打过勾的）→ undone；「引体向上换成高位下拉」「卧推换成哑铃的」→ 换动作
   *  「卧推加点重量」→ overload: 'up'；「卧推按成绩来」→ overload: true；「卧推轻一点」→ lighter
   *  没说哪个动作：「按成绩调一下计划」「渐进超负荷」「都加一点」→ { all, overload }；「今天都轻一点」→ { all, lighter }
   */
  function matchPlanEdit(text, rows) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 50 || /[？?]\s*$|吗[。！!]?\s*$|怎么|为什么|多少合适|要不要|该不该|行不行|好不好|可以吗|能不能/.test(raw)) return null;
    const lifts = (rows || []).filter(r => r && r.kind !== 'meal' && r.name);
    if (!lifts.length) return null;
    const clean = (x) => norm(String(x).replace(/(\d)\.(\d)/g, '$1\u2024$2')).replace(/\u2024/g, '.').replace(new RegExp(DAY + '的?', 'g'), '').replace(/^(我想|我要|帮我|给我|麻烦|请)?(把|将)?/, '').replace(/(吧|啊|呀|哈|嘛|呢|了吧)+$/, '');
    let t = clean(raw);
    if (/(吃|喝)了|[练做推蹲拉举跑]了\d|[练做推蹲拉举跑]了[一两二三四五六七八九十]+(组|个|次|下|分钟|公斤|kg)/.test(t)) return null; // 报练了 / 吃了什么：是记录
    // 好几句的（「深蹲换成腿举，重量你看着来」）：只看说到动作的那一句；别的句子里也在改东西（「深蹲去掉，加一个跑步」）交给大模型
    const parts = raw.split(/[，,。；;！!\n]+/).map(clean).filter(Boolean);
    if (parts.length > 1) {
      const own = parts.filter(x => findRow(x, lifts));
      const rest = parts.filter(x => !own.includes(x));
      if (own.length === 1 && !rest.some(x => new RegExp(`加|减|改|换|去掉|删|不做|不练|放|挪|排|\\d|(${NUM})(组|个|次|下|公斤|kg|斤|分钟)`).test(x))) t = own[0];
      else if (own.length) return null;
    }
    const todo = lifts.filter(r => !r.done);
    const found = findRow(t, lifts);
    if (!found) {
      if (!todo.length) return null;
      if (/(按|照)(渐进超负荷|成绩|我的成绩|最近的成绩|上次的成绩|进度)|渐进超负荷|超负荷|自动加重|(都|全部|全都|计划|训练)(都)?(加点|加一点|加重|重一点|往上加)|(^|帮我|都)加(点|一点)?重量/.test(t)) return { do: 'editPlan', all: true, overload: true };
      if (/(都|全部|全都|计划|训练)(都)?(轻一点|轻点|减一点|减点|降一点|练轻点|轻些)|练轻(一)?点/.test(t)) return { do: 'editPlan', all: true, lighter: true };
      return null;
    }
    const r = found.row;
    let s = t.replace(found.key, '◆');
    const other = findRow(s.replace('◆', ''), lifts, r);
    const O = other ? other.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\u0000';
    // 打过勾的：撤回（「卧推还没做」「撤回卧推」「卧推点错了」）
    if (r.done) {
      if (/^(撤销|撤回|取消)◆|◆(还)?没(做|练)|◆(撤销|撤回|不算|取消打勾|点错了|勾错了|打错了)/.test(s)) return { do: 'editPlan', id: r.id, undone: true };
      return null;
    }
    if (/^(撤销|撤回)◆|◆(撤销|撤回|取消打勾)/.test(s)) return null; // 还没打勾的「撤回」：不知道要干嘛
    if (/(不做|不练|去掉|删掉|删了|删除|拿掉|跳过|不要|划掉)(了)?◆|◆(我)?(就|先|今天|也)?(不做|不练|去掉|删掉|删了|不要了|算了|取消|跳过|划掉)/.test(s)) return { do: 'editPlan', id: r.id, drop: true };
    if (/^◆(也|都)?(做完|练完|完成|搞定|打卡)(了|啦)?$/.test(s)) return { do: 'editPlan', id: r.id, done: true };
    // 顺序
    const PUT = '(?:放到|挪到|排到|调到|移到|换到|放在|排在|放|挪|排|调|换)?';
    if (other && new RegExp(`◆${PUT}${O}(?:的)?(前面|之前|前头|前)`).test(s)) return { do: 'editPlan', id: r.id, move: 'before', target: other.row.id };
    if (other && new RegExp(`◆${PUT}${O}(?:的)?(后面|之后|后头|后)`).test(s)) return { do: 'editPlan', id: r.id, move: 'after', target: other.row.id };
    if (other && new RegExp(`(◆(和|跟|与)${O}|${O}(和|跟|与)◆).*(换|对调|调换)`).test(s)) return { do: 'editPlan', id: r.id, move: 'swap', target: other.row.id };
    if (new RegExp(`^先(做|练)◆|◆先(做|练)|◆${PUT}(最前面|最前|第一个|第一|开头|最开始)`).test(s)) return { do: 'editPlan', id: r.id, move: 'first' };
    if (new RegExp(`最后(再)?(做|练)◆|◆${PUT}(最后面|最后一个|最后|末尾)`).test(s)) return { do: 'editPlan', id: r.id, move: 'last' };
    if (other) return null; // 一句里说到两个动作、又不是排顺序（「弯举加一组下压改 30 公斤」）：交给大模型
    if (/◆(换|改)(一)?(个|种|下)(动作|别的|练法|其他)?/.test(s)) return null; // 「换一个动作」：没说换成什么，交给大模型挑
    // 换动作：「引体向上换成高位下拉」「卧推换成哑铃的」
    let m = s.match(/◆(?:换成|改成|替换成|换为|改为)(.{2,14})$/);
    if (m && !new RegExp(`(${NUM})\\s*(公斤|kg|千克|斤|组|个|次|下|分钟|小时)|^\\d|每组|重一?点|轻一?点|一点|点儿|一下|半(个)?小时|小时|分钟`, 'i').test(m[1])) {
      const name = cleanName(m[1]).replace(/的$/, '');
      if (name.length >= 2) return { do: 'editPlan', id: r.id, set: { exerciseName: EQUIP.test(name) ? name + liftCore(r.name) : name } };
    }
    // 数：「改成 60 公斤」「加 5 公斤」「加一组」「每组 8 个」「4×8」「4 组 10 个」「10 个一组」「30 分钟」（没有「改 / 加 / 换…」这种字的多半是报练了，不认）
    if (/改|换|调|变|设|加|减|降|多|少|成|到|只|就行|就好|就够|计划/.test(s) || /^◆每组/.test(s)) {
      s = s.replace(new RegExp(`第(${NUM})(个|组)`, 'g'), '');
      const set = {};
      const sign = (w) => (/加|多|重/.test(w) ? 1 : -1);
      if ((m = s.match(new RegExp(`(${NUM})\\s*[x×*乘]\\s*(${NUM})`, 'i'))) || (m = s.match(new RegExp(`(${NUM})组[，,]?(?:每组)?(${NUM})(?:个|次|下)`)))) {
        set.sets = toNum(m[1]); set.reps = toNum(m[2]); s = s.replace(m[0], '');
      }
      if ((m = s.match(new RegExp(`(${NUM})(?:个|次|下)一组`)))) { set.reps = toNum(m[1]); s = s.replace(m[0], ''); }
      if ((m = s.match(new RegExp(`(加|多|减|降|少|轻)?(${NUM})(kg|公斤|千克|斤)`, 'i')))) {
        let w = toNum(m[2]);
        if (w != null && m[3] === '斤') w /= 2;
        if (w != null) set.weightKg = m[1] ? (r.weightKg || 0) + sign(m[1]) * w : w;
        s = s.replace(m[0], '');
      } else if ((m = s.match(new RegExp(`重量(?:改成|改到|调到|换成|改为|改|调|用)?(${NUM})`)))) {
        set.weightKg = toNum(m[1]);
        s = s.replace(m[0], '');
      }
      if (set.sets == null && (m = s.match(new RegExp(`(加|多|减|少)(?:做)?(${NUM})组`)))) set.sets = (r.sets || 3) + sign(m[1]) * toNum(m[2]);
      else if (set.sets == null && (m = s.match(new RegExp(`(${NUM})组`)))) set.sets = toNum(m[1]);
      if (set.reps == null && (m = s.match(new RegExp(`(?:每组)?(加|多|减|少)(?:做)?(${NUM})(?:个|次|下)`)))) set.reps = (r.reps || 8) + sign(m[1]) * toNum(m[2]);
      else if (set.reps == null && (m = s.match(new RegExp(`(${NUM})(?:个|次|下)`)))) set.reps = toNum(m[1]);
      if ((m = s.match(new RegExp(`(加|多|减|少)?(${NUM}|半)(?:个)?(分钟|分|小时)`)))) {
        const v = m[2] === '半' ? 0.5 : toNum(m[2]);
        const min = v == null ? null : m[3] === '小时' ? v * 60 : v;
        if (min != null) set.durationMin = m[1] ? (r.durationMin || 0) + sign(m[1]) * min : min;
      }
      const ok = (k, lo, hi) => set[k] == null || (Number.isFinite(set[k]) && set[k] >= lo && set[k] <= hi);
      if (!ok('weightKg', 0, 500) || !ok('sets', 1, 20) || !ok('reps', 1, 100) || !ok('durationMin', 1, 300)) return null;
      if (Object.keys(set).length) {
        Object.keys(set).forEach(k => { set[k] = k === 'weightKg' ? Math.round(set[k] * 100) / 100 : Math.round(set[k]); });
        return { do: 'editPlan', id: r.id, set };
      }
    }
    if (/(加重|加点重|加一点重|重一点|重点|往上加|加一点|加点)/.test(s)) return { do: 'editPlan', id: r.id, overload: 'up' };
    if (/(按|照)(成绩|进度|渐进超负荷)|渐进超负荷|超负荷/.test(s)) return { do: 'editPlan', id: r.id, overload: true };
    if (/(轻一点|轻点|轻些|减点重量|减一点|减点|降一点|降点|少一点重量)/.test(s)) return { do: 'editPlan', id: r.id, lighter: true };
    return null;
  }

  TF.AgentIntent = { DAY, dayOffset, findName, findNameKey, nameKeys, shortName, matchSkill, cleanName, matchPlanEdit, liftCore };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.AgentIntent;
})(typeof window !== 'undefined' ? window : globalThis);
