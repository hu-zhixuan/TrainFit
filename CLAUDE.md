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
3. **大模型挑大梁**：糯米鸡、饭团、一碗面这种整份的东西让大模型按常见大小整体估（`whole=true`），不要拆成原料；只有米饭、鸡蛋这类单一食材才按成分表重算。成分表里的生重 / 干重条目（`(生)`、`(干)`）只认全名，别让「糯米鸡」匹配到「糯米(生)」。一顿说不清具体吃了啥的（火锅、烧烤、自助、麻辣烫、聚餐）按用户的描述拆成锅底、肉、菜、主食、蘸料估，「吃得多 / 少」乘 1.5 / 0.6，reply 说按什么估的，接着补充（「锅底是牛油的」）用 update 改那条；连锁店的东西 name 带品牌、按官方一份估（Atria 不能联网搜索，靠它自己的知识），`food.js` 的 `BRAND` 正则让这类名字不被通用的「汉堡」「拿铁」重算（v3.7）。
4. **蛋白质要准**：用户最在意蛋白质。食物库里名字对上但其实不是一回事的条目要处理（成分表的「蛋白粉」是 50% 的品牌货、「虾仁」是 10.4g 的红虾仁，都在 `scripts/build-food-db.js` 的 `CFCT_SKIP` 里跳过）；单独吃的肉按生重算。`groundItem` 查到库里同名条目时：热量差 2.5 倍以上、或蛋白质差很多且热量也对不上（不在 0.8～1.25 倍），才保留大模型的估算；热量对得上就按库算蛋白质（v3.7，大模型把三个鸡蛋写成 39g 蛋白）。改食物库只改 `scripts/build-food-db.js` 再重新生成（数据：`git clone --depth 1 https://github.com/Sanotsu/china-food-composition-data`）。
5. **失败不要乱记**：大模型调用失败时不能用规则猜着写数据（v2.6.1 之前把「蛋白粉 700 毫升」记成 2838 千卡）。失败就留「没整理好」卡片，让用户重试或改字。
6. **能用现成方案就用**：本机语音识别照搬 sherpa-onnx 官方 Android demo（模型也用它默认的 SenseVoice int8 2024-07-17；2025-09-09 那版是粤语微调的，别换；FunASR-Nano、Qwen3-ASR、FireRedASR 更准但 500～840MB，手机上装不下也不够快）；成分表数据来自 Sanotsu/china-food-composition-data。先查 GitHub 上有没有成熟做法。
7. 用户的叫法：「口喷」（按住说一大段）、「热量赤字」（不要写「缺口」）。

## 工作流

- 从 `main` 拉分支 `claude/<版本或主题>`，改完提 PR。PR 检查（`.github/workflows/pr-build.yml`）会先跑 `npm test` 再编译 APK。
- **沙箱里没有 Android SDK**，Kotlin 改动只能靠 PR 的 CI 编译检查；编译失败时错误会写在 check run 的 annotation 里。
- squash 合并后，`build-apk.yml` 按 `app/build.gradle.kts` 里的 `versionName` 打包并发布 Release，说明取自 `CHANGELOG.md` 里 `## v版本号 · 标题` 那一节。**每次发版都要同时改 `versionCode`、`versionName`，并在 CHANGELOG 顶部加一节**。只改文档（`*.md`）不会触发发版。
- 改界面只改 `web/`；`app/src/main/assets/` 是编译时从 `web/` 复制过去的，不进仓库。
- `web/js/data/food_db.js` 是 `scripts/build-food-db.js` 生成的，不要手改。
- 像素小人在 `web/js/app/buddy.js`：男生照着用户本人的照片画（黑色乱发、刘海压眼、黑色棒球服白袖子），另有女生角色；用户要「少年感、酷一点」，别画腮红、大嘴这种萌系。它是 `position:fixed` 的，`placeBuddy` 让它趴在最上面那一层（修改 / 分享面板 > 提示条 / 录音面板 > 输入栏）的上沿；别往顶栏、今天卡片里放，其他界面保持原样。小动作都在 CSS 里，`prefers-reduced-motion` 时不动。样子存在 `profile.buddy`，跟着备份走。
- App 图标（深绿底 + 发光叶子 + AI 星光）由 `python3 scripts/build-icon.py` 用 Chromium 渲染成 `mipmap-*/ic_launcher*.webp`（自适应图标的前景、背景是位图，因为有光晕）和单色版 `drawable/ic_launcher_monochrome.xml`，不要手改；网页里的同款小图标是 `util.js` 的 `BRAND` / `brandIcon` / `drawBrandIcon`，改形状要两边一起改。图标和小人分开，用户明确说过图标单独设计，要像海外独立 App 那样简洁、有质感。
- 备份（`web/js/app/backup.js`）只放 `fit_profile / fit_workouts / fit_diet / fit_weights / fit_my_foods`，**不放 AI 接口和语音识别的 key**（`tf_llm_override`、`tf_asr_override`）。新加要持久保存的数据，记得加进备份和 `mergeBackupData`。
- 安卓原生的文件能力在 `FileShare.kt`（MediaStore 存下载 / 相册只支持 Android 10+；分享走 FileProvider，路径在 `res/xml/file_paths.xml`）。恢复备份不能让用户自己翻文件夹找文件（被骂过）：「从备份恢复」先走 `restoreFromFolder`（文件夹授权页直接停在「下载/练食AI」，授权后 `FileShare.readBestBackup` 挑**记录最多**的那份——不能挑最新的：重装后新装的 App 会另存「练食AI备份 (1).json」，只有几条，v3.7 用户恢复了个寂寞），找不到、或者那份的记录都已经有了才让选文件；微信里「用其他应用打开」也能直接恢复（MainActivity 的 intent-filter + `takeOpenedFile`）。
- 语音识别：说话时本机 SenseVoice 边说边出字。本机模型（model.int8.onnx + tokens.txt，共 240MB）从 v3.7 起不打进安装包（APK 约 30MB）：`asr/ModelDownloader.kt` 第一次打开时下到 `filesDir/asr/sensevoice`，只在不按流量计费的网络自动下（设置里能点「用流量下载」），Range 断点续传，下完核对 sha256；镜像 hf-mirror → huggingface（2026-10 实测 hf-mirror 能下且一致，ModelScope 上没有）。没下好时 `LocalAsr.missing=true`：录音照常、只靠千问实时识别，边说边出的字也用云端的（`QianwenStream` 的 `onText`）。云端用千问 AI 平台（原阿里云百炼），key 在 Secret `QWEN_API`（`sk-ws-` 开头，CI 里 `ASR_API_KEY: ${{ secrets.QWEN_API || secrets.ASR_API_KEY }}`）。**用户定了核心用 Qwen-Audio-3.1-ASR-Message（`qwen-audio-3.1-asr-flash-message`），别再换、也别再花时间测对比**：按住时 `NativeBridge.openCloudStream` 开 `net/QianwenStream.kt`（DashScope inference WebSocket：run-task → 16k PCM 二进制帧 → finish-task → result-generated / task-finished，参数照 BryceWG/BiBi-Keyboard 的 `buildDashRecognitionParam`），`LocalAsr` 的录音线程通过 `onAudio` 把声音同时喂给它；松手时 `localAsr.stop { cs.finish() }`，最多等到松手后 5 秒，拿到就用云端的，否则用本机的。**只准调用这一个模型**（平台上标着免费试用；用户充了钱，明确说过别调别的模型扣他的钱，测试也一样）：录好的一整段（本机用不了的 32 位手机）也由 `Qianwen.streamWhole` 推给它；只有用户在设置里自己填了别的整段模型才走 multimodal-generation。2026-10 账户欠费过一次（对比测试调了收费的 qwen3-asr-flash 等，余额扣成负数），欠费时连免费模型也拒（`Arrearage` / 403），用户充值后恢复；实测 WebSocket 流程正确，松手后约 0.5 秒出最终结果；不是千问的 key 走 OpenAI 兼容 `/audio/transcriptions`。401/402/403、`Arrearage`、`FreeTierOnly`、`InvalidApiKey`、`AccessDenied` 之后半小时不再试（换了 key 马上再试）。2026-10 用 60 句录音实测整段版 Qwen-Audio-3.1 错字 1.8% / 2.3%（干净 / 嘈杂），本机 SenseVoice 5.8% / 11.1%；qwen3-asr-flash 5.5% / 8.3% 还出过一次 `Arrearage`（可能不在免费额度里），别用。整理记录的大模型继续用 Atria（用户定的），千问的 key 只给语音识别。
- 小人的动作（`buddy.js` 的 `buddyDo` / `buddyIdle` / `buddyListen`）：站起来的姿势（stand / walk / wave / stretch）和趴着共用头部、眼睛、装备的坐标；新手教程（`startTour`，`tf_tour`）也由小人带，三步、每步一句话，别加长。
- 本机识别（`asr/LocalAsr.kt`）：录音线程只收声音、识别线程切句和边说边出字（以前在录音线程里识别，说长了会丢声音）；松手后 25 秒以内整段再认一遍。换模型前在沙箱里用 `pip install sherpa-onnx` + kokoro TTS 合成的句子对比错字率（做法见 v3.3 的 PR）。
- 音效在 `web/js/log/sound.js`（Web Audio 现场合成，不放音频文件），挂在和震动一样的时机；手机静音时不响（原生 `soundAllowed`），设置里能关（`tf_sound`）。开始说话的音要短，松手的音延后 0.15 秒，别被麦克风录进去。
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
- 大模型：OpenAI 兼容接口（默认 Atria，`Atria-Dawn-Preview`；2026-10 实测不支持联网搜索：`tools:[{type:"web_search"}]` 被拒 422，`web_search_options` / `enable_search` 不报错但没真搜），请求里带 `thinking: {type: 'disabled'}` 提速（不带要 47～90 秒；`reasoning_effort` 会被拒 422）；2026-10 实测一次整理 10～18 秒、偶尔 40 秒，是接口本身慢（输出才 113 token）。在后台做，不阻塞界面；`Parser.sendHedged` 20 秒没回来就再发一份，谁先回来用谁；「正在整理…」超过 15 秒标「有点慢，稍等」。

## 其他要知道的

- **每个版本的安装包签名都不一样**（2026-10 实测 v2.9～v3.7 的签名证书各不相同：CI 每次临时生成 debug 签名），所以新版装不上旧版，用户每次更新都得卸载重装、再从备份恢复。要固定签名得用一把固定的签名钥匙，放在 Actions Secrets 里，编译时用；这一步要用户自己决定、自己放（自动权限检查不让我替他生成、配置）。

- 2026-09-29 用户重写过一次 `main` 的历史（内容不变、哈希全变）。如果本地和远端分叉，先比较两边的 tree，一致就直接 `git reset --hard origin/main`。
- 成分表数据集注明「仅供个人学习研究」，要商用得换数据。

## 聊过但还没做的

- **降低使用门槛**：出一个网页版链接（`web/` 本来就是网页，放到免费托管上），用一个小中转服务（比如 Cloudflare Worker）藏 key 并按人限流；iPhone 也能用。用户还没决定。
- **拍照记录**：讨论过，用户觉得难，先不做。
- **验证是不是自嗨**：除了用户自己，还没有人持续在用。建议先看他姐姐和推特来的人一周后还在不在记，再决定加什么功能，别一直堆功能。
