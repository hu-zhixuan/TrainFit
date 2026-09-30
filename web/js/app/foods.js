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
