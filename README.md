# 练食AI (TrainFit)

<p align="center">
  <b>说一句话，帮你记下今天吃了啥。</b><br>
  按住说「中午一碗牛肉面加个蛋」，热量自动算好 —— 想瘦一点、随便记记都能用；在健身的话，训练、蛋白质、热量缺口也一起管。
</p>

### 📥 [下载最新安卓安装包（TrainFit-Latest.apk）](https://github.com/hu-zhixuan/TrainFit/releases/latest/download/TrainFit-Latest.apk)

所有版本和更新说明见 [Releases](https://github.com/hu-zhixuan/TrainFit/releases) 和 [CHANGELOG.md](CHANGELOG.md)。覆盖安装，数据保留。

---

## 能做什么

- **老样子点一下就记**：底部按早 / 中 / 晚推荐你常吃的，点一下整餐记好；打字时输入一两个字就弹出吃过的东西。在外面不方便说话也不用打完整句。
- **按住说话，松手就记**：一口气说完吃了什么（练了什么、体重多少），松手后后台整理成记录，不用等；记错了点一下改，或者再说一句「改成……」「删掉……」。
- **热量算得准**：糯米鸡、饭团、一碗面这种整份的东西由大模型按常见大小估，米饭、鸡蛋这类单一食材按《中国食物成分表（第6版）》算。点开一餐能看到每一样怎么算的，哪样不对直接改，改过的会记住，下次就用你的数；也可以照着包装念营养数。
- **本机语音识别**：不联网，边说边出字，松手立刻出结果。
- **两种用法**：
  - *只记吃的*（想瘦一点 / 随便记记）：首页只有「今天还能吃多少」和体重。
  - *吃和练都记*（健身）：再加上训练记录、蛋白质、热量缺口和每个动作「下次加重量还是加次数」的建议。
- **体重**：说「体重 62.5」「称了 124 斤」就记，首页看一周变化，趋势页看曲线。
- **提醒与震动**：午饭 / 晚饭没记提醒、晚间小结、后台整理完成通知；按键震动反馈。都可以在设置里关。
- 数据只存在手机上（WebView 的 localStorage）。

## 怎么算的

- **每天消耗**：Mifflin-St Jeor 公式算基础代谢，乘 1.45 作为日常消耗（不含训练）：
  - 男：`10 × 体重kg + 6.25 × 身高cm − 5 × 年龄 + 5`
  - 女：`10 × 体重kg + 6.25 × 身高cm − 5 × 年龄 − 161`
- **今天还能吃** = 日常消耗 + 训练消耗 − 目标缺口 − 已吃。想瘦默认每天少吃 450 千卡（约每月 1.8kg）。
- **一餐的热量**，每一样按可信程度依次取：
  1. 你记住的（自己改过的、照包装念过的），按份数或克数换算；
  2. 你念的包装营养数；
  3. 单一食材（米饭、鸡蛋、牛奶…）按成分表 `每100g数值 × 克数 / 100`，和模型估算相差超过 2.5 倍时（多半匹配错了）不用；
  4. 整份的东西（糯米鸡、饭团、一碗面、一份炒菜）用大模型按常见大小的估算，库里的成品菜数值只给它参考。
- **动作建议**：双重累进——次数练到上限（复合动作 8 次、孤立动作 12 次）且至少 3 组，下次加重量；否则下次加 1 次。

## 局限

- 整份食物的热量是大模型按"常见大小"估的，份量和做法差别大时误差会比较大；需要准的话，改一次它就会记住你的数。
- 每天消耗用公式 × 固定系数估算，不考虑个人代谢差异，只适合看趋势。
- 数据只存在手机的 WebView 里，目前没有导出和备份，卸载或清除应用数据会丢失。
- 只有安卓版。

---

## 开发

### 目录结构

```text
TrainFit/
├── web/                         # 网页（App 的全部界面，WebView 加载）
│   ├── index.html
│   ├── css/style.css            # 深色 / 浅色两套配色
│   └── js/
│       ├── app/                 # 主界面：FitnessApp
│       │   ├── util.js          #   常量、日期、格式化等小工具
│       │   ├── app.js           #   类定义：数据、事件、页面切换、主题
│       │   ├── today.js         #   今天页：大数字、记录列表、常吃常练
│       │   ├── weight.js        #   体重
│       │   ├── trend.js         #   趋势页图表
│       │   ├── settings.js      #   设置、提醒
│       │   ├── onboarding.js    #   第一次打开的引导
│       │   ├── editor.js        #   修改一条记录
│       │   ├── foods.js         #   记住的食物
│       │   └── quick.js         #   常吃一键记、打字联想
│       ├── log/                 # 一键记录（按顺序加载）
│       │   ├── helpers.js       #   小工具、体重识别
│       │   ├── native.js        #   安卓接口包装、震动、接口设置
│       │   ├── food.js          #   食物库查找、按库算热量
│       │   ├── parser.js        #   提示词、解析大模型输出、离线兜底
│       │   ├── quick_log.js     #   按住说话按钮、录音、识别
│       │   ├── pipeline.js      #   后台整理、保存、撤销
│       │   └── api_settings.js  #   设置里的 AI 接口 / 语音识别卡片
│       ├── lib/                 # 离线兜底引擎（大模型连不上时用）：workout.js、nutrition.js
│       └── data/food_db.js      # 食物营养库（脚本生成，不要手改）
├── app/                         # 安卓壳（Kotlin）
│   └── src/main/java/com/trainfit/app/
│       ├── MainActivity.kt      #   WebView 容器、权限、系统栏
│       ├── NativeBridge.kt      #   给网页用的原生接口（window.TrainFitNative）
│       ├── Haptics.kt           #   震动
│       ├── Reminders.kt         #   通知、定时提醒、开机后重排
│       ├── asr/                 #   本机识别（sherpa-onnx）、录音、系统语音识别
│       └── net/OpenAiApi.kt     #   调大模型、云端语音转文字（OpenAI 兼容接口）
├── scripts/
│   ├── fetch-asr.sh             # 下载本机识别用的库和模型（编译前运行，CI 自动运行）
│   └── build-food-db.js         # 生成 web/js/data/food_db.js
├── tests/                       # 单元测试：npm test
└── CHANGELOG.md                 # 更新记录，也是 Release 说明的来源
```

`app/src/main/assets/` 是编译时从 `web/` 复制过去的（`app/build.gradle.kts` 里的 `syncWebAssets`），不进仓库；改界面只改 `web/`。

### 在电脑上看界面

```bash
npm run serve        # 打开 http://localhost:3000
```

浏览器里没有安卓的原生能力：语音识别和提醒用不了，可以打字；大模型需要在设置的「AI 接口」里填地址和 key（部分服务商不允许浏览器跨域调用）。

### 测试

```bash
npm test             # 体重识别、按库算热量、解析大模型输出、离线引擎
```

### 编译安卓 App

```bash
bash scripts/fetch-asr.sh      # 第一次需要：下载本机识别模型（约 80MB）
./gradlew assembleDebug        # 生成 app/build/outputs/apk/debug/*.apk
```

接口 key 在编译时注入，写在 `local.properties`（不进仓库）或环境变量里，见 [.env.example](.env.example)：

| 名称 | 用途 |
| --- | --- |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 整理记录用的大模型（OpenAI 兼容 `/chat/completions`） |
| `ASR_API_KEY` / `ASR_BASE_URL` / `ASR_MODEL` | 云端语音转文字，本机识别用不了时才用 |

### 发布

- 提 PR：GitHub Actions 跑单元测试并编译检查，产出测试用 APK。
- 合并到 `main`：按 `app/build.gradle.kts` 里的 `versionName` 编译并发布 Release，说明取自 `CHANGELOG.md` 里对应版本的一节。key 放在仓库的 Actions Secrets 里。

### 食物数据

`web/js/data/food_db.js` 由 `npm run build:food-db -- <数据目录>` 生成：`web/js/lib/nutrition.js` 里整理的常见成品菜 + 《中国食物成分表标准版（第6版）》（[Sanotsu/china-food-composition-data](https://github.com/Sanotsu/china-food-composition-data)）。该数据集注明仅供个人学习研究使用，商用前需要换成授权明确的数据。

## 开源协议

[MIT License](LICENSE)
