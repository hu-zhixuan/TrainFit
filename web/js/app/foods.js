/**
 * 记住的食物（fit_my_foods）：用户改过热量、或照包装念过的东西，按一份存下来。
 * 以后再说到同样的东西，一键记录直接用这里的数（见 log/food.js 的 groundItem）。
 */
const MY_FOODS_KEY = 'fit_my_foods';
const MY_FOODS_MAX = 200;

Object.assign(FitnessApp.prototype, {
  normFoodName(s) {
    return String(s || '').replace(/[\s·・]/g, '').toLowerCase();
  },

  findMyFood(name) {
    const k = this.normFoodName(name);
    return this.myFoods.find(f => this.normFoodName(f.name) === k) || null;
  },

  /** 记住一样东西（同名覆盖），返回原来那条，撤销用 */
  rememberFood(food) {
    if (!food || !food.name || !(food.calories > 0 || (food.supp && food.nutrients))) return null;
    const prev = this.findMyFood(food.name);
    const entry = {
      name: food.name,
      amount: food.amount || '1份',
      grams: food.grams || null,
      calories: Math.round(food.calories),
      proteinG: round1(food.proteinG || 0),
      carbsG: round1(food.carbsG || 0),
      fatG: round1(food.fatG || 0),
      ts: Date.now()
    };
    if (food.nutrients) entry.nutrients = food.nutrients;
    if (food.supp) entry.supp = true;
    this.myFoods = [entry].concat(this.myFoods.filter(f => f !== prev)).slice(0, MY_FOODS_MAX);
    store(MY_FOODS_KEY, this.myFoods);
    this._backupDirty = true;
    return prev ? Object.assign({}, prev) : null;
  },

  /** 撤销「记住」：恢复成原来那条，原来没有就删掉 */
  restoreFood(name, prev) {
    const k = this.normFoodName(name);
    this.myFoods = this.myFoods.filter(f => this.normFoodName(f.name) !== k);
    if (prev) this.myFoods.unshift(prev);
    store(MY_FOODS_KEY, this.myFoods);
    this._backupDirty = true;
  },

  forgetFood(name) {
    const k = this.normFoodName(name);
    this.myFoods = this.myFoods.filter(f => this.normFoodName(f.name) !== k);
    store(MY_FOODS_KEY, this.myFoods);
    this._backupDirty = true;
  },

  // ===== 小本本：用户说过的关于自己的事（「叫阿程」「不吃辣」「膝盖有旧伤」），每次整理都带给大模型，最多 12 条 =====
  memoList() { return Array.isArray(this.profile.memo) ? this.profile.memo : []; },

  /** 加几条、去掉几条，返回原来的（撤销用） */
  updateMemo(add, forget) {
    const prev = this.memoList().slice();
    const drop = new Set(forget || []);
    const next = prev.filter(x => !drop.has(x));
    (add || []).forEach(x => { if (x && !next.includes(x)) next.push(x); });
    this.profile.memo = next.slice(-12);
    return prev;
  },

  /** 小本本里的名字：「叫阿程」→ 阿程 */
  userName() {
    const m = this.memoList().map(x => /^我?(?:叫|名字是?|昵称是?)\s*([^\s，,。；;、]{1,8})$/.exec(x)).find(Boolean);
    return m ? m[1] : '';
  },

  renderMemo() {
    const el = document.getElementById('memo-list');
    if (!el) return;
    const list = this.memoList();
    const pic = this.portrait ? this.portrait() : [];
    el.innerHTML = (list.length
      ? list.map((x, i) => `<div class="myfood-row"><div class="myfood-main"><b>${esc(x)}</b></div><button type="button" class="chip" data-memo-del="${i}">删除</button></div>`).join('')
      : '<p class="field-note">跟小人说说你自己，比如「我叫阿程，健身新手，不吃辣」，会记在这里，以后回答、估热量、排计划都照顾到。</p>') +
      // 画像：按记录看出来的，不用删，记录变了它跟着变
      (pic.length ? `<div class="portrait"><b>按你的记录看出来的</b><p>${pic.map(esc).join('；')}</p><small>问小人问题时会带上这几句，记录变了它跟着变。</small></div>` : '');
  },

  /** 「最近的事」：聊天时小人记下的（面试、考试…），到日子它会问；能删 */
  renderLife() {
    const el = document.getElementById('life-list');
    if (!el) return;
    const list = ((this.profile.buddy || {}).life || []).slice().reverse();
    el.innerHTML = list.length ? list.map(x => `<div class="myfood-row"><div class="myfood-main"><b>${esc(x.t)}</b><small>${+x.at.slice(5, 7)}月${+x.at.slice(8)}日说的${x.due ? (x.asked ? ' · 问过了' : ` · ${+x.due.slice(5, 7)}月${+x.due.slice(8)}日问你`) : ''}</small></div><button type="button" class="chip" data-life-del="${esc(x.t)}">删除</button></div>`).join('')
      : '<p class="field-note">跟小人聊聊最近的事（「周五要面试」「下周考试」），它会记在这里，到了日子主动问你怎么样了。</p>';
  },

  /** 「存好的计划」（v6.5）：说「明天练练腿日」就放到那天；能删。自动存的（加计划时悄悄存的）写着「最近用过」 */
  renderPlanBook() {
    const el = document.getElementById('plan-book');
    if (!el) return;
    const book = (this.planBook ? this.planBook() : []).slice().reverse();
    el.innerHTML = book.length ? book.map(e => {
      const lifts = (e.workouts || []).concat(...(e.days || []).map(d => d.workouts || []));
      const what = lifts.length ? lifts.slice(0, 3).map(w => w.exerciseName).join('、') + (lifts.length > 3 ? ` 等 ${lifts.length} 个动作` : '') : (e.meals || []).map(m => m.mealType.replace('/补剂', '')).join('、');
      return `<div class="myfood-row"><div class="myfood-main"><b>${esc(e.name)}</b><small>${e.auto ? '最近用过 · ' : ''}${esc(what)}</small></div><button type="button" class="chip" data-plan-del="${esc(e.name)}">删除</button></div>`;
    }).join('') : '<p class="field-note">小人给的计划点「存起来」，或者说「把这个计划存起来叫练腿日」，就会存在这里。以后说「明天练练腿日」「把练腿日排到周五」，它直接帮你放好。</p>';
  },

  renderMyFoods() {
    const el = document.getElementById('my-foods');
    if (!el) return;
    if (!this.myFoods.length) {
      el.innerHTML = '<p class="field-note">吃了什么热量不对，点开那一餐直接改那一样；或者说「记住，糯米鸡一个 350 大卡」「包装上写每 100 克 210 大卡」。改过的会记在这里，下次说到就用你的数。</p>';
      return;
    }
    el.innerHTML = this.myFoods.map(f => `
      <div class="myfood-row">
        <div class="myfood-main"><b>${esc(f.name)}</b><small>${esc(f.amount || '1份')}${f.grams ? ` · 约${f.grams}g` : ''}${f.nutrients ? ' · ' + esc(TF.nutrientsText(f.nutrients, 2)) : ''}</small></div>
        <span class="myfood-kcal">${fmt(f.calories)}<small>kcal</small></span>
        <button type="button" class="chip" data-forget="${esc(f.name)}">删除</button>
      </div>`).join('');
  }
});
