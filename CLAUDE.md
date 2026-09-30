# 给 Claude 的交接说明

练食AI（TrainFit）：安卓 App，**按住说一句话，自动记下吃了啥、练了啥、体重**，热量由大模型估 + 《中国食物成分表》校准。
项目结构、怎么编译、怎么测试见 [README.md](README.md)；每个版本改了什么见 [CHANGELOG.md](CHANGELOG.md)。先读这两个。

## 用户是谁、怎么沟通

- 仓库主人 hu-zhixuan，说中文，口语化、直接，常用语音输入（会有错字，按意思理解）。回复用中文，少术语，先说结论。
- 他要的是**能用的结果**：改完就提 PR → 等 CI 过 → 合并 → 等 Release 发出来 → 告诉他装哪个版本。不用每步都问。
- 发推广、写文案他会给方向（比如「口喷」「吹牛逼」「痛点放开头」），照他的调性来。

## 产品原则（都是踩过坑换来的）

1. **懒**：记录的步骤越少越好。一个按钮：按住说、松手记；说错了再说一句「改成…」「删掉…」。
2. **今天页要简洁，别随便加栏目**。v2.5 加的「常吃」按钮排、v2.3 加的体重行都被要求删掉了；v2.6 的热量赤字是放在大数字旁边、v2.7 的健康度温度计是卡片右边一根竖管，都没新开一行。要加界面元素，先想能不能塞进已有的地方，拿不准就先问。
3. **大模型挑大梁**：糯米鸡、饭团、一碗面这种整份的东西让大模型按常见大小整体估（`whole=true`），不要拆成原料；只有米饭、鸡蛋这类单一食材才按成分表重算。成分表里的生重 / 干重条目（`(生)`、`(干)`）只认全名，别让「糯米鸡」匹配到「糯米(生)」。
4. **蛋白质要准**：用户最在意蛋白质。食物库里名字对上但其实不是一回事的条目要处理（成分表的「蛋白粉」是 50% 的品牌货、「虾仁」是 10.4g 的红虾仁，都在 `scripts/build-food-db.js` 的 `CFCT_SKIP` 里跳过）；单独吃的肉按生重算。改食物库只改 `scripts/build-food-db.js` 再重新生成（数据：`git clone --depth 1 https://github.com/Sanotsu/china-food-composition-data`）。
5. **失败不要乱记**：大模型调用失败时不能用规则猜着写数据（v2.6.1 之前把「蛋白粉 700 毫升」记成 2838 千卡）。失败就留「没整理好」卡片，让用户重试或改字。
6. **能用现成方案就用**：本机语音识别照搬 sherpa-onnx 官方 Android demo；成分表数据来自 Sanotsu/china-food-composition-data。先查 GitHub 上有没有成熟做法。
7. 用户的叫法：「口喷」（按住说一大段）、「热量赤字」（不要写「缺口」）。

## 工作流

- 从 `main` 拉分支 `claude/<版本或主题>`，改完提 PR。PR 检查（`.github/workflows/pr-build.yml`）会先跑 `npm test` 再编译 APK。
- **沙箱里没有 Android SDK**，Kotlin 改动只能靠 PR 的 CI 编译检查；编译失败时错误会写在 check run 的 annotation 里。
- squash 合并后，`build-apk.yml` 按 `app/build.gradle.kts` 里的 `versionName` 打包并发布 Release，说明取自 `CHANGELOG.md` 里 `## v版本号 · 标题` 那一节。**每次发版都要同时改 `versionCode`、`versionName`，并在 CHANGELOG 顶部加一节**。只改文档（`*.md`）不会触发发版。
- 改界面只改 `web/`；`app/src/main/assets/` 是编译时从 `web/` 复制过去的，不进仓库。
- `web/js/data/food_db.js` 是 `scripts/build-food-db.js` 生成的，不要手改。
- 像素小人在 `web/js/app/buddy.js`（照着用户本人的照片画的：黑色乱发、刘海压眼、黑色棒球服白袖子；用户要「少年感、酷一点」，别画腮红、大嘴这种萌系）。它趴在底部输入栏上沿，弹出提示条 / 录音面板时跳上去（`placeBuddy`）；别往顶栏、今天卡片里放。样子存在 `profile.buddy`，跟着备份走。
- App 图标（碗 + 声波热气）由 `python3 scripts/build-icon.py` 生成 `res/drawable/ic_launcher_*.xml` 和 `mipmap-*/*.webp`，不要手改；网页里的同款标志是 `util.js` 的 `BRAND_PATHS`（`build-icon.py --web` 输出）。图标和小人分开，用户明确说过图标单独设计。
- 备份（`web/js/app/backup.js`）只放 `fit_profile / fit_workouts / fit_diet / fit_weights / fit_my_foods`，**不放 AI 接口和语音识别的 key**（`tf_llm_override`、`tf_asr_override`）。新加要持久保存的数据，记得加进备份和 `mergeBackupData`。
- 安卓原生的文件能力在 `FileShare.kt`（MediaStore 存下载 / 相册只支持 Android 10+；分享走 FileProvider，路径在 `res/xml/file_paths.xml`）。
- 前端是普通 `<script>`（没有打包工具）：`web/js/app/*.js` 用 `Object.assign(FitnessApp.prototype, …)` 往类上加方法；`web/js/log/*.js` 通过 `window.TF` 共享，**`index.html` 里的加载顺序有依赖**。

## 测试

- `npm test`：解析、按库算热量、体重识别、失败重试等纯逻辑。
- 界面用 Playwright 在浏览器里测：`python3 -m http.server` 跑 `web/`，用 `add_init_script` 伪造 `window.TrainFitNative`（`llmChat` 里直接回调 `__tfLlm` 返回假的大模型结果），再点页面、截图（深色 / 浅色都看）。改界面一定截图看一眼。
- 真实大模型测试：沙箱连不到大模型接口。做法是把测试脚本推到 `claude/api-check` 分支，那里有个临时 workflow 用仓库 Secrets 调真实接口，结果写在 check run 的 annotation 里。**接口有每分钟请求数限制（429），用例之间要隔 15～30 秒**。
  - 大模型每次结果不一样，跑一次通过不算数：关键用例同一句跑 4 次以上；上下文要像真实用户（有最近成绩、记住的食物、体重），空白上下文会比手机上好看。v2.6.2 那次，旧提示词空白上下文 1/1 通过、健身用户上下文 3/4。
  - workflow 里设 `TZ: Asia/Shanghai`，否则 `getHours()` 是 UTC，「现在时间」会错。要对比新旧提示词，可以把 `main` 的 `web/js/log` 和 `food_db.js` 复制到 `.github/old/web/js/…`，分两个进程跑（`TF` 是全局的，同一进程里不能加载两份）。

## 密钥和钱

- 仓库是公开的。大模型和云端语音识别的 key 在 Actions Secrets（`LLM_API_KEY`、`ASR_API_KEY`），编译时注入 APK。**任何 key 都不要写进代码或提交记录**。
- 这意味着公开发布的 APK 里带着用户的 key，别人用的都是他的额度；提醒过他在接口后台设消费上限。
- 大模型：OpenAI 兼容接口（默认 Atria，`Atria-Dawn-Preview`），请求里带 `thinking: {type: 'disabled'}` 提速；一次整理实测 5～25 秒，在后台做，不阻塞界面。

## 其他要知道的

- 2026-09-29 用户重写过一次 `main` 的历史（内容不变、哈希全变）。如果本地和远端分叉，先比较两边的 tree，一致就直接 `git reset --hard origin/main`。
- 成分表数据集注明「仅供个人学习研究」，要商用得换数据。

## 聊过但还没做的

- **降低使用门槛**：出一个网页版链接（`web/` 本来就是网页，放到免费托管上），用一个小中转服务（比如 Cloudflare Worker）藏 key 并按人限流；iPhone 也能用。用户还没决定。
- **安装包瘦身**：现在 112MB，大头是本机语音模型；可以改成首次打开时后台下载。
- **拍照记录**：讨论过，用户觉得难，先不做。
- **验证是不是自嗨**：除了用户自己，还没有人持续在用。建议先看他姐姐和推特来的人一周后还在不在记，再决定加什么功能，别一直堆功能。
