/**
 * TA 的手机（v10.0，用户：「很多游戏是主线剧情加每天几条短信、电话、朋友圈……主线剧情用户自己点进去玩，然后每天几条短信、电话、朋友圈」）。
 * 只在剧情模式、这个角色写了 cast.phone 时有（江叙 phone_jx.js，夏柚 v11 起 phone_xy.js）。从点小人的气泡里「江叙的手机」进，小人头上冒未读数。
 *
 * 四栏：消息（每天几条：早安、看到你记的那顿、晚安、下一段剧情好了、看完那段第二天提一句；第三章那几天标准版的消息会混进来）
 *       通话（看完某段以后，在对的时间打来；没接是未接来电，能回拨、能重听）
 *       朋友圈（跟着剧情一条条发出来：江叙、老周、标准版；能点赞、能评论，他回你）
 *       故事（主线走到哪儿、下一段、点了就演——主线是你自己点进去玩的，不再自己淡入）
 * 都是写好的（phone_jx.js），本机挑，不花钱、口吻稳；你在手机里自己打字，跟按住说话走同一条路（记录照记、问题照答、聊天找大模型），回答放进对话里。
 * 存在 profile.buddy.phone（跟着备份）：{ msgs: [{ id, at, from: 'ta'|'me'|'twin'|'sys', t, opts, picked, play, kind }], read, sent: { day, kinds },
 *   after: [看完第二天提过的剧情], ready（提醒过的下一段）, last（上次打开 App 的日子）, moments: { id: { at, liked, re } }, momRead,
 *   calls: { id: { at, state: 'missed' | 'done', dur } }, ring（今天响过没有）, callRead }
 * 底线照旧：不拿「你不来我会难过」压人（那是标准版的台词）；好几天没来他会说一句，但不数落。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  /** 故事走到哪儿了：0 还没开始，1～5 看到第几章，6 看完了（mains：[{ id, ch }] 按顺序） */
  function stageOf(seen, mains) {
    const set = new Set(seen || []);
    if (!mains.length || !mains.some(m => set.has(m.id))) return 0;
    if (mains.every(m => set.has(m.id))) return 6;
    let ch = 1;
    mains.forEach(m => { if (set.has(m.id)) ch = m.ch; });
    return ch;
  }

  /** 挑一句：只挑这个阶段能说的，越往后的越优先（最近两档里挑），说过的先不说；seed 让同一天挑的稳定 */
  function pickLine(list, stage, used, seed) {
    const ok = (list || []).filter(x => x[0] <= stage);
    if (!ok.length) return null;
    const top = Math.max(...ok.map(x => x[0]));
    const fresh = (xs) => xs.filter(x => !(used || []).includes(x[1]));
    const pools = [fresh(ok.filter(x => x[0] >= top - 1)), fresh(ok), ok];
    const pool = pools.find(p => p.length);
    return pool[Math.abs(seed | 0) % pool.length];
  }

  function hash(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  /** 时间戳 → 「08:12」 */
  function hm(at) { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

  TF.Phone = { stageOf, pickLine, hash, hm };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Phone;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 有没有手机：剧情模式、选过人、这个角色写了 phone */
  phoneOn() {
    return !!(this.storyOn && this.storyOn() && this.buddyChosen && this.buddyChosen() && this.cast().phone && this.cast().main);
  },

  phoneData() {
    const p = (this.profile.buddy || {}).phone;
    return Object.assign({ msgs: [], read: 0, sent: { day: '', kinds: [] }, after: [], moments: {}, momRead: 0, calls: {}, callRead: 0, used: [] }, p && typeof p === 'object' ? p : {});
  },

  phoneSave(ph) {
    ph.msgs = (ph.msgs || []).slice(-80);
    ph.used = (ph.used || []).slice(-30);
    this.setBuddy({ phone: ph });
    this.phoneBadge();
    if (this.phoneIsOpen()) this.renderPhone();
  },

  phoneStage() {
    const mains = this.mainList().map(x => ({ id: x.sc.id, ch: x.ch }));
    return TF.Phone.stageOf(this.storyData().seen || [], mains);
  },

  /** 一条：TA 说的 / 你说的 / 标准版 / 系统的灰字 */
  phonePush(ph, msg) {
    const at = msg.at || Date.now();
    ph.msgs.push(Object.assign({ id: 'm' + at.toString(36) + Math.random().toString(36).slice(2, 5), at }, msg));
    return ph;
  },

  /** 今天这种话说过没有；没说过就挑一句发出来（kinds 一天一清） */
  phoneSay(ph, kind, vars, extra) {
    const today = getTodayDateString();
    if (ph.sent.day !== today) ph.sent = { day: today, kinds: [] };
    if (ph.sent.kinds.includes(kind)) return false;
    const P = this.cast().phone;
    const e = TF.Phone.pickLine(P.msgs[kind], this.phoneStage(), ph.used, TF.Phone.hash(today + kind));
    if (!e) return false;
    const t = TF.Theater.fill(e[1], Object.assign(this.storyVars ? this.storyVars() : {}, vars || {}));
    if (!t || /\{/.test(t)) return false;
    ph.sent.kinds.push(kind);
    ph.used.push(e[1]);
    this.phonePush(ph, Object.assign({ from: 'ta', t, kind }, e[2] ? { opts: e[2] } : {}, extra || {}));
    return true;
  },

  /**
   * 打开 App 时（greetOrGuide 前面，不占小人说话的次数）：早安 / 晚安、好几天没来、看完那段第二天提一句、下一段剧情好了、
   * 第三章那几天标准版混进来的消息、跟着剧情发的朋友圈、该打来的电话没碰上时间的算未接。返回有没有新东西。
   */
  phoneSync() {
    if (!this.phoneOn() || this.needsOnboarding) return false;
    const P = this.cast().phone;
    const ph = this.phoneData();
    const today = getTodayDateString();
    const hour = new Date().getHours();
    const before = ph.msgs.length;
    const stage = this.phoneStage();
    const st = this.storyData();
    // 好几天没来：回来先说一句（不数落）
    const gap = ph.last ? Math.round((new Date(today + 'T00:00:00') - new Date(ph.last + 'T00:00:00')) / 86400000) : 0;
    if (gap >= 3 && stage >= 1) this.phoneSay(ph, 'back');
    else if (hour >= 5 && hour < 11) this.phoneSay(ph, 'morning');
    if (hour >= 21 || hour < 2) this.phoneSay(ph, 'night');
    // 看完那段的第二天，他提一句（只提最近看的那段）
    const seenOn = st.seenOn || {};
    const due = (st.seen || []).filter(id => (P.after || {})[id] && seenOn[id] && seenOn[id] < today && !(ph.after || []).includes(id));
    if (due.length) {
      const id = due[due.length - 1];
      ph.after = [...new Set((ph.after || []).concat(due))];
      const t = TF.Theater.fill(P.after[id][0], this.storyVars ? this.storyVars() : {});
      if (t && !/\{/.test(t)) this.phonePush(ph, { from: 'ta', t, kind: 'after' });
    }
    // 第三章那几天（看过「另一个我」、还没看「第七天」）：标准版的消息混进来，一天最多一次，他马上来删
    if (P.twin && this.storySeen(`${this.castKey()}2c`) && !this.storySeen(`${this.castKey()}3c`) && !(ph.sent.kinds || []).includes('twin') && TF.Phone.hash(today + 'twin') % 2 === 0) {
      if (ph.sent.day !== today) ph.sent = { day: today, kinds: [] };
      ph.sent.kinds.push('twin');
      const k = TF.Phone.hash(today) % P.twin.length;
      this.phonePush(ph, { from: 'twin', t: P.twin[k], kind: 'twin' });
      this.phonePush(ph, { from: 'sys', t: `${this.buddyName()}删除了一条消息`, at: Date.now() + 1 });
      this.phonePush(ph, { from: 'ta', t: P.twinFix[k % P.twinFix.length], kind: 'twinfix', at: Date.now() + 2 });
    }
    // 下一段剧情好了
    const next = this.mainNext();
    if (next && ph.ready !== next.sc.id) {
      ph.ready = next.sc.id;
      const e = TF.Phone.pickLine(P.msgs.ready, stage, [], TF.Phone.hash(next.sc.id));
      if (e) this.phonePush(ph, { from: 'ta', t: e[1], kind: 'ready', play: next.sc.id });
    }
    // 朋友圈：剧情走到了就发出来
    (P.moments || []).forEach(m => { if (m.at <= stage && !(ph.moments[m.id] || {}).at) ph.moments[m.id] = Object.assign({}, ph.moments[m.id] || {}, { at: Date.now() }); });
    // 该打来的电话：看完那段两天了还没碰上合适的时间，就算未接，能回拨
    (P.calls || []).forEach(c => {
      if (ph.calls[c.id] || !seenOn[c.after]) return;
      const days = Math.round((new Date(today + 'T00:00:00') - new Date(seenOn[c.after] + 'T00:00:00')) / 86400000);
      if (days >= 2) { ph.calls[c.id] = { at: Date.now(), state: 'missed' }; this.phonePush(ph, { from: 'sys', t: `未接来电 · ${c.title}`, call: c.id }); }
    });
    ph.last = today;
    this.phoneSave(ph);
    return ph.msgs.length > before;
  },

  /** 记完一条：他看见了，发一句（一种一天一次）；你在手机里打字记的，这句就是回你的 */
  phoneAfterLog(result, batch, hour) {
    if (!this.phoneOn()) return false;
    const ph = this.phoneData();
    const today = getTodayDateString();
    if (hour == null) hour = new Date().getHours(); // 测试传进来，免得深夜跑测试时「晚饭」变成「深夜还吃」
    const meal = (result.meals || [])[0];
    const lift = (result.workouts || [])[0];
    const vars = { food: meal ? String(meal.foodSummary || '').split(/[、，,]/)[0].slice(0, 12) : '', lift: lift ? lift.exerciseName : '' };
    const s = this.getDaySummary(today);
    const kinds = [];
    if (meal && (hour >= 23 || hour < 4)) kinds.push('late');
    if (meal && s.budget && s.intake > s.budget + 100) kinds.push('over');
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0;
    if (meal && target && s.protein >= target && s.protein - (result.meals || []).reduce((t, m) => t + (m.proteinG || 0), 0) < target) kinds.push('protein');
    const recs = ((batch && batch.workoutIds) || []).map(id => this.workouts.find(w => w.id === id)).filter(Boolean);
    if (this.liftFeedback && recs.some(w => String(this.liftFeedback(w) || '').includes('新纪录'))) kinds.push('pr');
    if (lift) kinds.push('train');
    if (meal) { const g = String(meal.mealType || ''); kinds.push(/早/.test(g) ? 'breakfast' : /午/.test(g) ? 'lunch' : /晚/.test(g) ? 'dinner' : 'snack'); }
    if (result.bodyWeight) kinds.push('weight');
    let said = false;
    for (const k of kinds) { if (this.phoneSay(ph, k, vars)) { said = true; break; } }
    // 在手机里打字记的：就算今天这种话说过了，也回一句（不然像没看见）
    if (!said && this._phoneWait) this.phonePush(ph, { from: 'ta', t: this.cast().sex === 'f' ? '记上啦！' : '嗯。记上了。', kind: 'ack' });
    this._phoneWait = null;
    if (said || this.phoneIsOpen()) this.phoneSave(ph);
    return said;
  },

  /** 未读：TA 的消息 + 新的朋友圈 + 未接来电 */
  phoneUnread() {
    if (!this.phoneOn()) return 0;
    const ph = this.phoneData();
    const msgs = ph.msgs.filter(m => m.from !== 'me' && m.at > (ph.read || 0)).length;
    const moms = Object.values(ph.moments || {}).filter(m => m.at > (ph.momRead || 0)).length;
    const calls = Object.values(ph.calls || {}).filter(c => c.state === 'missed' && c.at > (ph.callRead || 0)).length;
    return msgs + moms + calls;
  },

  /** 小人头上的手机角标（数字） */
  phoneBadge() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('buddy');
    if (!btn) return;
    const n = this.phoneUnread();
    btn.classList.toggle('has-phone', n > 0);
    const b = btn.querySelector('.bd-phone b');
    if (b) b.textContent = n > 9 ? '9+' : String(n || '');
    if (n > 0) btn.classList.remove('has-story'); // 下一段剧情的提醒也在手机里，别冒两个
  },

  /** 点小人的气泡里那一行：「江叙的手机 · 2 条新消息」 */
  phoneEntryHtml() {
    if (!this.phoneOn()) return '';
    const n = this.phoneUnread();
    return `<button class="buddy-phone" type="button"><span class="bp-ico" aria-hidden="true"></span><b>${esc(this.buddyName())}的手机</b><small>${n ? `${n} 条新的` : '消息 · 通话 · 朋友圈'}</small><i aria-hidden="true">›</i></button>`;
  },

  // ---------------- 手机界面 ----------------

  phoneEl() {
    let el = document.getElementById('phone-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'phone-overlay';
    el.className = 'sheet-overlay phone-overlay hidden';
    el.innerHTML = '<div class="sheet phone-sheet" role="dialog" aria-label="TA 的手机">' +
      '<div class="ph-head"><span class="ph-ava"></span><span class="ph-who"><b class="ph-name"></b><small class="ph-state"></small></span><button type="button" class="icon-btn ph-close" aria-label="关上">×</button></div>' +
      '<div class="seg seg-sm ph-tabs" role="tablist"></div>' +
      '<div class="ph-body"></div>' +
      '<form class="ph-input"><input type="text" class="ph-text" maxlength="200" enterkeyhint="send" autocomplete="off"><button type="submit" class="ph-send" aria-label="发送">发送</button></form></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.ph-close')) { this.closePhone(); return; }
      const tab = e.target.closest('[data-ptab]');
      if (tab) { this.openPhone(tab.dataset.ptab); return; }
      const opt = e.target.closest('[data-popt]');
      if (opt) { this.phoneReply(opt.dataset.msg, +opt.dataset.popt); return; }
      const play = e.target.closest('[data-pplay]');
      if (play) { const id = play.dataset.pplay; this.closePhone(); setTimeout(() => this.playMain(id), 260); return; }
      const call = e.target.closest('[data-pcall]');
      if (call) { const id = call.dataset.pcall; this.closePhone(); setTimeout(() => this.playCall(id), 260); return; }
      const like = e.target.closest('[data-plike]');
      if (like) { this.momentLike(like.dataset.plike); return; }
      const cm = e.target.closest('[data-pcm]');
      if (cm) { this._momOpen = this._momOpen === cm.dataset.pcm ? '' : cm.dataset.pcm; this.renderPhone(); return; }
      const re = e.target.closest('[data-pre]');
      if (re) { this.momentReply(re.dataset.mom, +re.dataset.pre); return; }
      const nx = e.target.closest('[data-pnext]');
      if (nx) { this.phoneSend(nx.dataset.pnext); return; }
    });
    el.querySelector('.ph-input').addEventListener('submit', (e) => {
      e.preventDefault();
      const box = el.querySelector('.ph-text');
      const t = box.value.trim();
      if (!t) return;
      box.value = '';
      this.phoneSend(t);
    });
    return el;
  },

  phoneIsOpen() {
    if (typeof document === 'undefined') return false;
    const el = document.getElementById('phone-overlay');
    return !!(el && !el.classList.contains('hidden'));
  },

  openPhone(tab) {
    if (!this.phoneOn()) return false;
    const el = this.phoneEl();
    this._phoneTab = tab || this._phoneTab || 'msg';
    document.getElementById('buddy-pop').classList.add('hidden');
    this.phoneSync();
    el.classList.remove('hidden');
    document.body.classList.add('phone-open');
    this.renderPhone(true);
    window.Haptics && window.Haptics.fire('tap');
    if (window.Sound) window.Sound.play('blip');
    return true;
  },

  closePhone() {
    const el = document.getElementById('phone-overlay');
    if (el) el.classList.add('hidden');
    document.body.classList.remove('phone-open');
    this.phoneBadge();
    this.renderBuddy && this.renderBuddy();
  },

  /** TA 现在在干嘛（名字下面那行小字）：按角色写的 phone.status（[最早哪一章, 几点起, 几点前, 话]）挑第一个对上的 */
  phoneStatus(h) {
    if (h == null) h = new Date().getHours();
    if (this._phoneTyping) return '正在输入…';
    const stage = this.phoneStage();
    const hit = (this.cast().phone.status || []).find(([st, from, to]) => stage >= st && h >= from && h < to);
    return hit ? hit[3] : '在线';
  },

  renderPhone(opening) {
    const el = this.phoneEl();
    const ph = this.phoneData();
    const tab = this._phoneTab || 'msg';
    const name = this.buddyName();
    el.querySelector('.ph-name').textContent = name;
    el.querySelector('.ph-state').textContent = this.phoneStatus();
    el.querySelector('.ph-ava').innerHTML = TF.Buddy.svg(this.buddyArt({ pose: 'stand', mood: 'ok', scale: 2, gear: [] }));
    const newMsg = ph.msgs.filter(m => m.from !== 'me' && m.at > (ph.read || 0)).length;
    const newCall = Object.values(ph.calls || {}).filter(c => c.state === 'missed' && c.at > (ph.callRead || 0)).length;
    const newMom = Object.values(ph.moments || {}).filter(m => m.at > (ph.momRead || 0)).length;
    const ready = !!this.mainNext();
    const tabs = [['msg', '消息', newMsg], ['call', '通话', newCall], ['mom', '朋友圈', newMom], ['story', '故事', ready ? '•' : 0]];
    el.querySelector('.ph-tabs').innerHTML = tabs.map(([k, t, n]) => `<button type="button" class="seg-btn${k === tab ? ' active' : ''}" data-ptab="${k}" role="tab">${t}${n ? `<i>${n}</i>` : ''}</button>`).join('');
    const body = el.querySelector('.ph-body');
    const readBefore = ph.read || 0;
    body.innerHTML = tab === 'msg' ? this.phoneMsgsHtml(ph, readBefore) : tab === 'call' ? this.phoneCallsHtml(ph) : tab === 'mom' ? this.phoneMomentsHtml(ph) : this.phoneStoryHtml();
    el.querySelector('.ph-input').classList.toggle('hidden', tab !== 'msg');
    el.querySelector('.ph-text').setAttribute('placeholder', `跟${name}说…（记吃的、问问题也行）`);
    if (tab === 'msg') body.scrollTop = body.scrollHeight;
    else if (opening) body.scrollTop = 0;
    // 看过了：这一栏的未读清掉
    const now = Date.now();
    let changed = false;
    if (tab === 'msg' && newMsg) { ph.read = now; changed = true; }
    if (tab === 'call' && newCall) { ph.callRead = now; changed = true; }
    if (tab === 'mom' && newMom) { ph.momRead = now; changed = true; }
    if (changed) { this.setBuddy({ phone: ph }); this.phoneBadge(); }
  },

  /** 消息：按天分开，新的那几条淡进来；最后一条 TA 的话有现成的回答（点了他接着说） */
  phoneMsgsHtml(ph, readBefore) {
    const name = this.buddyName();
    const today = getTodayDateString();
    const dayOf = (at) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const label = (day) => (day === today ? '今天' : day === shiftDateString(today, -1) ? '昨天' : `${+day.slice(5, 7)}月${+day.slice(8)}日`);
    if (!ph.msgs.length) return `<p class="ph-empty">还没有消息。${esc(name)}会在早上、你记完一顿、晚上的时候找你。</p>`;
    let last = '', i = 0;
    const lastTa = [...ph.msgs].reverse().find(m => m.from === 'ta');
    const out = ph.msgs.map(m => {
      const day = dayOf(m.at);
      const sep = day !== last ? `<p class="ph-day">${label(day)}</p>` : '';
      last = day;
      const fresh = m.from !== 'me' && m.at > readBefore;
      const style = fresh ? ` style="--i:${i++}"` : '';
      if (m.from === 'sys') return sep + `<p class="ph-sys${fresh ? ' fresh' : ''}"${style}>${esc(m.t)}${m.call ? ` <button type="button" class="ph-link" data-pcall="${esc(m.call)}">回拨</button>` : ''}</p>`;
      const who = m.from === 'me' ? 'me' : m.from === 'twin' ? 'twin' : 'ta';
      const opts = m === lastTa && m.opts && m.picked == null ? `<div class="ph-opts">${m.opts.map((o, k) => `<button type="button" class="ph-opt" data-msg="${esc(m.id)}" data-popt="${k}">${esc(o[0])}</button>`).join('')}</div>` : '';
      const play = m.play && this.mainFind(m.play) && !this.storySeen(m.play) ? `<button type="button" class="ph-play" data-pplay="${esc(m.play)}">▶ 去看「${esc(this.mainFind(m.play).sc.title)}」</button>` : '';
      const next = m.next && m === ph.msgs[ph.msgs.length - 1] ? `<div class="ph-opts">${m.next.map(t => `<button type="button" class="ph-opt" data-pnext="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';
      return sep + `<div class="ph-row ${who}${fresh ? ' fresh' : ''}"${style}>` + (who === 'twin' ? `<small class="ph-twin">${esc(name)}（标准版）</small>` : '') +
        `<p class="ph-msg ${who}">${esc(m.t)}</p><time>${TF.Phone.hm(m.at)}</time></div>` + play + opts + next;
    }).join('');
    return out + (this._phoneTyping ? '<div class="ph-row ta"><p class="ph-msg ta ph-typing"><i></i><i></i><i></i></p></div>' : '');
  },

  /** 点了现成的回答：你说的放右边，他「正在输入…」一下再回 */
  phoneReply(msgId, k) {
    const ph = this.phoneData();
    const m = ph.msgs.find(x => x.id === msgId);
    if (!m || !m.opts || m.picked != null) return;
    const o = m.opts[k];
    m.picked = k;
    this.phonePush(ph, { from: 'me', t: o[0] });
    this._phoneTyping = true;
    this.phoneSave(ph);
    if (this.bondGain) this.bondGain('answer');
    setTimeout(() => {
      this._phoneTyping = false;
      const p2 = this.phoneData();
      this.phonePush(p2, { from: 'ta', t: o[1], at: Date.now() });
      p2.read = Date.now();
      this.phoneSave(p2);
      if (window.Sound) window.Sound.play('pop');
    }, this.reducedMotion() ? 0 : Math.min(1800, 600 + o[1].length * 40));
  },

  /**
   * 在手机里打字：跟按住说话走同一条路（QuickLog.submit）——记吃的照记、问的照答、聊天找大模型；回答放进这里的对话（phoneCatch）。
   */
  phoneSend(text) {
    const t = String(text || '').trim();
    if (!t) return;
    const ph = this.phoneData();
    this.phonePush(ph, { from: 'me', t });
    ph.read = Date.now();
    this._phoneWait = { q: t, at: Date.now() };
    this._phoneTyping = true;
    this.phoneSave(ph);
    clearTimeout(this._phoneWaitT);
    // 一分钟还没回来（失败了、或者落成了要你确认的卡片）：别一直「正在输入」
    this._phoneWaitT = setTimeout(() => { if (this._phoneWait && this._phoneWait.q === t) { this._phoneWait = null; this._phoneTyping = false; if (this.phoneIsOpen()) this.renderPhone(); } }, 60000);
    if (window.QuickLog) window.QuickLog.submit(t);
  },

  /** 回答来了（showBuddyAnswer 先问这里）：是手机里问的，就放进对话、不弹小人的气泡 */
  phoneCatch(question, answer, opts) {
    const w = this._phoneWait;
    if (!w || String(question || '').trim() !== w.q) return false;
    if (opts && opts.streaming) return true;
    this._phoneWait = null;
    this._phoneTyping = false;
    clearTimeout(this._phoneWaitT);
    const ph = this.phoneData();
    this.phonePush(ph, Object.assign({ from: 'ta', t: String(answer || '').slice(0, 400) }, opts && opts.next && opts.next.length ? { next: opts.next.slice(0, 2) } : {}));
    if (this.phoneIsOpen()) ph.read = Date.now();
    this.phoneSave(ph);
    if (window.Sound) window.Sound.play('pop');
    // 回答里有计划（「明天吃什么」）：计划的按钮在小人的气泡里，手机里只放文字——关上手机就能加
    return !(opts && opts.plan);
  },

  /** 没整理好（问的话大模型没回来）：手机里说一声 */
  phoneFailed(question) {
    const w = this._phoneWait;
    if (!w || String(question || '').trim() !== w.q) return false;
    this._phoneWait = null;
    this._phoneTyping = false;
    const ph = this.phoneData();
    this.phonePush(ph, { from: 'ta', t: this.cast().sex === 'f' ? '诶，信号不好，没收到……再发一次？' : '……没收到。再发一次。', next: [w.q] });
    this.phoneSave(ph);
    return true;
  },

  // ---------------- 通话 ----------------

  phoneCallsHtml(ph) {
    const P = this.cast().phone;
    const list = (P.calls || []).filter(c => ph.calls[c.id]);
    const ready = this.phoneCallReady();
    const head = ready ? `<button type="button" class="ph-call incoming" data-pcall="${esc(ready.id)}"><span class="pc-ico">☎</span><b>${esc(this.buddyName())}想给你打个电话</b><small>「${esc(ready.title)}」· 点了就接</small></button>` : '';
    if (!list.length && !head) return `<p class="ph-empty">还没有通话。剧情里的有些夜晚、有些早上，${esc(this.buddyName())}会打来。</p>`;
    return head + list.slice().sort((a, b) => ph.calls[b.id].at - ph.calls[a.id].at).map(c => {
      const r = ph.calls[c.id];
      const missed = r.state === 'missed';
      const d = new Date(r.at);
      const when = `${d.getMonth() + 1}月${d.getDate()}日 ${TF.Phone.hm(r.at)}`;
      return `<div class="ph-call${missed ? ' missed' : ''}"><span class="pc-ico">${missed ? '↙' : '☎'}</span><span class="pc-main"><b>${esc(c.title)}</b><small>${missed ? '未接来电' : `通话 ${r.dur || '1:00'}`} · ${when}</small></span>` +
        `<button type="button" class="ph-link" data-pcall="${esc(c.id)}">${missed ? '回拨' : '重听'}</button></div>`;
    }).join('');
  },

  /** 现在该打来的那通（看完那段、到了对的时间、还没打过） */
  phoneCallReady() {
    if (!this.phoneOn()) return null;
    const ph = this.phoneData();
    const seenOn = this.storyData().seenOn || {};
    return (this.cast().phone.calls || []).find(c => !ph.calls[c.id] && seenOn[c.after] && this.whenOk(c.when)) || null;
  },

  /**
   * 打开 App 时：有一通该打来的电话，就响（上面滑下来一张来电卡片，接 / 挂）；一天最多响一次，挂了是未接（能回拨）。
   * 排在 greetOrGuide 的最前面（是 TA 主动找你，你可以不接）。
   */
  phoneRing() {
    const c = this.phoneCallReady();
    if (!c || this._scene || this._touring) return false;
    const ph = this.phoneData();
    const today = getTodayDateString();
    if (ph.ring === today) return false;
    ph.ring = today;
    this.setBuddy({ phone: ph });
    let el = document.getElementById('phone-ring');
    if (!el) {
      el = document.createElement('div');
      el.id = 'phone-ring';
      el.className = 'phone-ring hidden';
      el.setAttribute('role', 'alertdialog');
      document.body.appendChild(el);
    }
    el.innerHTML = `<span class="pr-ava">${TF.Buddy.svg(this.buddyArt({ pose: 'stand', mood: 'ok', scale: 2, gear: [] }))}</span><span class="pr-who"><b>${esc(this.buddyName())}</b><small>来电 ·「${esc(c.title)}」</small></span>` +
      '<button type="button" class="pr-no" aria-label="挂断">挂断</button><button type="button" class="pr-yes" aria-label="接听">接听</button>';
    el.classList.remove('hidden');
    if (window.Sound) window.Sound.play('blip');
    window.Haptics && window.Haptics.fire('success');
    const done = (yes) => {
      clearTimeout(this._ringT);
      el.classList.add('hidden');
      if (yes) { this.playCall(c.id); return; }
      const p2 = this.phoneData();
      p2.calls[c.id] = { at: Date.now(), state: 'missed' };
      this.phonePush(p2, { from: 'sys', t: `未接来电 · ${c.title}`, call: c.id });
      this.phoneSave(p2);
    };
    el.querySelector('.pr-yes').onclick = () => done(true);
    el.querySelector('.pr-no').onclick = () => done(false);
    clearTimeout(this._ringT);
    this._ringT = setTimeout(() => { if (!el.classList.contains('hidden')) done(false); }, 30000);
    return true;
  },

  /** 接电话 / 回拨 / 重听：在剧场里演（通话的样子：上面一条「通话中 0:12」） */
  playCall(id) {
    const c = (this.cast().phone.calls || []).find(x => x.id === id);
    if (!c || this._scene) return false;
    const ph = this.phoneData();
    const replay = (ph.calls[id] || {}).state === 'done';
    const t0 = Date.now();
    const bg = c.bg || (c.when === 'morning' ? 'pool' : c.when === 'day' ? 'backstage' : 'roomnight');
    return this.playScene({
      label: `通话 · ${this.buddyName()}`, bg, call: true, script: c.lines.slice(), replay, from: this.buddyCenter ? this.buddyCenter() : null,
      onChoose: () => { if (this.bondGain && !replay) this.bondGain('answer'); return null; },
      onEnd: () => {
        const n = Math.max(20, Math.round((Date.now() - t0) / 1000));
        const dur = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
        const p2 = this.phoneData();
        p2.calls[id] = { at: Date.now(), state: 'done', dur };
        if (!replay) this.phonePush(p2, { from: 'sys', t: `通话 ${dur} ·「${c.title}」` });
        p2.callRead = Date.now();
        this.phoneSave(p2);
      },
      after: () => { this.renderBuddy && this.renderBuddy(); }
    });
  },

  // ---------------- 朋友圈 ----------------

  phoneMomentsHtml(ph) {
    const P = this.cast().phone;
    const vars = this.storyVars ? this.storyVars() : {};
    const list = (P.moments || []).filter(m => (ph.moments[m.id] || {}).at).sort((a, b) => ph.moments[b.id].at - ph.moments[a.id].at);
    if (!list.length) return `<p class="ph-empty">朋友圈还是空的。故事往下走，${esc(this.buddyName())}会发点东西。</p>`;
    const fill = (t) => TF.Theater.fill(t, vars) || '';
    return list.map(m => {
      const r = ph.moments[m.id];
      const who = m.by === '江叙' || m.by === this.buddyName() ? this.buddyName() : m.by;
      const img = m.img || {};
      const food = img.food && TF.Dex ? TF.Dex.byName(img.food) : null;
      const pic = food && TF.Dex.img(food) ? `<span class="mo-img photo"><img src="${TF.Dex.img(food)}" alt="" loading="lazy"></span>`
        : img.bg ? `<span class="mo-img cg-thumb" data-bg="${esc(img.bg)}">${img.pet === 'cat' && TF.Theater.PROPS ? `<span class="mo-pet">${TF.Theater.PROPS.cat}</span>` : ''}</span>` : '';
      const likes = (m.likes || []).map(x => (x === '江叙' ? this.buddyName() : x)).concat(r.liked ? ['你'] : []);
      const cms = (m.cm || []).map(c => [c[0] === '江叙' ? this.buddyName() : c[0], fill(c[1])]);
      if (r.re != null && m.re[r.re]) cms.push(['你', m.re[r.re][0]], [who === this.buddyName() ? who : this.buddyName(), m.re[r.re][1]]);
      const open = this._momOpen === m.id && r.re == null;
      const d = new Date(r.at);
      return `<article class="mo${who === '标准版' ? ' twin' : ''}"><div class="mo-head"><span class="mo-ava">${esc(who.slice(0, 1))}</span><b>${esc(who)}</b><small>${d.getMonth() + 1}月${d.getDate()}日</small></div>` +
        `<p class="mo-text">${esc(fill(m.t))}</p>${pic}` +
        `<div class="mo-acts"><button type="button" class="mo-act${r.liked ? ' on' : ''}" data-plike="${esc(m.id)}">${r.liked ? '♥' : '♡'} 赞</button>` +
        (m.re && m.re.length && r.re == null ? `<button type="button" class="mo-act" data-pcm="${esc(m.id)}">评论</button>` : '') + '</div>' +
        (likes.length || cms.length ? `<div class="mo-foot">${likes.length ? `<p class="mo-likes">♥ ${esc(likes.join('、'))}</p>` : ''}${cms.map(c => `<p class="mo-cm"><b>${esc(c[0])}</b>：${esc(c[1])}</p>`).join('')}</div>` : '') +
        (open ? `<div class="ph-opts">${m.re.map((x, k) => `<button type="button" class="ph-opt" data-mom="${esc(m.id)}" data-pre="${k}">${esc(x[0])}</button>`).join('')}</div>` : '') + '</article>';
    }).join('');
  },

  momentLike(id) {
    const ph = this.phoneData();
    const r = ph.moments[id];
    if (!r) return;
    r.liked = !r.liked;
    this.setBuddy({ phone: ph });
    if (r.liked && this.bondGain) this.bondGain('pat');
    if (r.liked) window.Haptics && window.Haptics.fire('tap');
    this.renderPhone();
  },

  momentReply(id, k) {
    const ph = this.phoneData();
    const r = ph.moments[id];
    if (!r || r.re != null) return;
    r.re = k;
    this._momOpen = '';
    this.setBuddy({ phone: ph });
    if (this.bondGain) this.bondGain('answer');
    if (window.Sound) window.Sound.play('pop');
    this.renderPhone();
  },

  // ---------------- 故事 ----------------

  /** 故事：走到哪儿了、下一段（点了就演）、这一章看过的能重看；全部剧情和相册在设置里 */
  phoneStoryHtml() {
    const list = this.mainList();
    const ch = this.storyChapter();
    const next = this.mainNext();
    const st = this.storyData();
    const left = next && (st.resume || {}).id === next.sc.id;
    const head = next ? `<button type="button" class="ph-next" data-pplay="${esc(next.sc.id)}"><small>${esc(this.chapterLabel(next.ch))}</small><b>「${esc(next.sc.title)}」</b><span>${left ? '接着上次 ▶' : '开始 ▶'}</span></button>`
      : `<p class="ph-empty">${esc(this.storyStatusLine())}</p>`;
    const rows = list.filter(x => x.ch === ch || (next && x.ch === next.ch)).map(x => {
      const s = this.mainStatus(x);
      return s === 'seen' ? `<button type="button" class="ph-ep seen" data-pplay="${esc(x.sc.id)}"><i>${x.k + 1}</i><b>${esc(x.sc.title)}</b><small>重看</small></button>`
        : s === 'ready' ? `<button type="button" class="ph-ep ready" data-pplay="${esc(x.sc.id)}"><i>${x.k + 1}</i><b>${esc(x.sc.title)}</b><small>新</small></button>`
        : `<span class="ph-ep locked"><i>${x.k + 1}</i><b>？？？</b><small>${esc(this.mainLockNote(x))}</small></span>`;
    }).join('');
    return head + `<p class="ph-sub">${esc(this.chapterLabel(ch))} · ${esc((this.cast().chapterLines || [])[ch - 1] || '')}</p><div class="ph-eps">${rows}</div>` +
      `<p class="ph-foot">${esc(this.storyStatusLine())}<br>全部五章、相册在「设置 → 外观 → 剧情」。</p>`;
  }
});
