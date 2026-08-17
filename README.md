# 练食AI (TrainFit) 🏋️‍♂️🍎

<div align="center">

<p align="center">
  <b>用最简单、最快的方式，掌控你的增肌减脂闭环。</b><br>
  专为硬核力量训练者与科学减脂人群打造 —— <b>口喷记录</b> · <b>自动超负荷加片建议</b> · <b>热量缺口动态闭环</b>。
</p>

### 📥 [ 👉 点击这里直接下载最新 Android APK 安装包 (TrainFit-v1.1.2.apk) 👈 ](https://github.com/QD8-png/TrainFit/releases/download/v1.1.2/TrainFit-v1.1.2.apk)

> 💡 **多通道下载指引**：
> - 🚀 **官方 Release 直链（推荐，极速）**：[TrainFit-v1.1.2.apk (GitHub Releases v1.1.2)](https://github.com/QD8-png/TrainFit/releases/download/v1.1.2/TrainFit-v1.1.2.apk)
> - 📦 **GitHub Releases 发行页**：[查看全部版本与更新日志](https://github.com/QD8-png/TrainFit/releases)
> - 🔗 **仓库备用直链**：[TrainFit-v1.1.2.apk (Raw 源码库直链)](https://github.com/QD8-png/TrainFit/raw/main/downloads/TrainFit-v1.1.2.apk)
> - ⚡ **永久最新指向**：[TrainFit-Latest.apk (永远指向最新版)](https://github.com/QD8-png/TrainFit/raw/main/downloads/TrainFit-Latest.apk)

[✨ 功能特性](#-核心功能亮点) • [📐 科学模型](#-底层数理与算法模型) • [🚀 快速开始](#-快速上手与运行) • [📱 手机安装](#-导出-apk--手机安装) • [📂 项目架构](#-项目工程结构)

</div>

---

## 💡 为什么做「练食AI」？

传统健身与饮食打卡软件存在两大痛点：
1. **记饮食繁琐**：吃一顿饭要搜索 10 种食材、一个个选克数，折腾 5 分钟，难以坚持；
2. **练与吃脱节**：练归练、吃归吃，不知道今天到底消耗了多少、产生了多少净热量缺口，深蹲卧推下次该加多少重量全凭感觉。

**练食AI (TrainFit)** 将**力量训练进阶**与**热量缺口管理**深度合二为一，支持一句话语音“口喷”瞬间提取，并提供瑞士工精般的极简冷冽质感。

---

## 🌟 核心功能亮点

### 1. 🎙️ 全能中式口喷与多轮智能要素补全助手 (Voice Dictation & Factor Completion)
- **多轮智能补全**：严格校验动作名、重量、组数、次数四大核心要素。口喷要素不全（如仅说*“深蹲100kg”*或*“卧推”*）时，自动弹出交互式智能追问气泡，支持持续说话、点击预设快捷胶囊或键盘快速补全，缺失时严格阻断保存。
- **上下文自适应偏置与同音纠偏**：引入高星开源语音规范化与编辑距离纠偏算法，自动纠偏*“卧腿$\rightarrow$卧推”*、*“四组八哥$\rightarrow$4组8个”*、*“划川$\rightarrow$划船”*；当激活 To-Do 清单时，口喷识别自适应偏置优先命中当前计划动作。
- **口喷记饮食**：自动识别菜品、零食、外卖与饮料，支持精细生活量词与修饰换算（*“一大碗米饭”* $\rightarrow$ 300g，*“半斤酱牛肉”* $\rightarrow$ 250g，*“两听可乐”* $\rightarrow$ 660ml）。

### 2. 📋 循环训练 To-Do 待办清单与自定义卡片 (Cyclical Routine To-Do List)
- **自定义动作组卡片**：用户可自由创建、命名、编辑与删除专属训练计划卡片（如“胸背轰炸日”、“推力进阶日”），并结合用户高频历史自动智能推荐。
- **循环执行与一键重置**：点击顶部卡片一键导入今日待办清单；完成单项点击打钩自动划线置灰（0.5透明度）；再次点击顶部卡片或重置按钮即可重置全选状态，开启下一轮训练循环。

### 3. ⚡ 科学超负荷加片建议 (Progressive Overload)
- 基于**双重累进加载法（Double Progression Model）**；
- 每次记录训练动作后，系统自动根据完成组数、次数及 RPE 疲劳度判断是否满足超负荷门槛；
- 达标时自动在动作卡片上生成加片徽章（如：*“⚡ 满足超负荷标准！下次目标加片至 82.5kg (8次)”*），指引每次训练稳步突破。

### 4. 🏋️ 杠铃配重算片器 (Barbell Plate Calculator)
- 自动扣除 **20kg 标准奥林匹克杠**；
- 采用 **贪心匹配算法**，支持红25kg、蓝20kg、黄15kg、绿10kg、白5kg、黑2.5kg、灰1.25kg 彩色杠铃片；
- 拟物化绘制杠铃片图解与每边挂片清单，告别大重量训练时的大脑缺氧算片。

### 5. ⚡ Epley 1RM 极限力量预估
- 在动作卡片上实时计算并展示 **1RM 力量极限**：$1\text{RM} = W \times (1 + R / 30)$；
- 重量 $\ge 20\text{kg}$ 的复合杠铃动作自动点亮 **`[⚡ 算片]`** 快捷按钮。

### 6. 🎯 每日热量缺口与四大宏量预设 (Macros Closed-Loop)
- 顶部环形仪表盘实时动态联动：
  $$\text{今日净缺口} = (\text{TDEE} + \text{训练运动消耗}) - \text{全天饮食总摄入}$$
- 提供 **四大经典健身预设**（高蛋白刷脂 4:4:2、均衡减脂 4:4:2、增肌充碳 5:3:2、低碳生酮 2:1:7）与三色能量比例实时演算。

### 7. 🥢 800+ 中餐高精库与烹饪吸油档位
- 覆盖八大菜系、外卖快餐、家常炒菜与复合菜品（如盖浇饭、便当、麻辣烫）；
- 支持 **中餐生熟转化系数** 与 **9 大烹饪吸油率档位微调**。

### 8. 🎨 德系/瑞士极简工精风 UI (Swiss Minimalist Dark)
- 告别臃肿的圆泡泡，采用 4px~6px 结构感硬朗微倒角与深邃黑曜石材质；
- 发丝级精密分割线，无视觉噪点，专注数据本身。

---

## 📐 底层数理与算法模型

### 1. 基础代谢 (BMR) 与日常总消耗 (TDEE)
采用国际权威 **Mifflin-St Jeor** 公式计算：
- **男性**：$\text{BMR} = 10 \times \text{体重(kg)} + 6.25 \times \text{身高(cm)} - 5 \times \text{年龄} + 5$
- **女性**：$\text{BMR} = 10 \times \text{体重(kg)} + 6.25 \times \text{身高(cm)} - 5 \times \text{年龄} - 161$
- **基础 TDEE**：$\text{TDEE} = \text{BMR} \times 1.45$

### 2. 训练力量容积与热量消耗估算
- **训练总吨位 (Volume)**：$\text{Volume} = \sum (\text{重量} \times \text{组数} \times \text{每组次数})$
- **复合动作热量**：$\text{Burn}_{\text{compound}} = \text{组数} \times 28.0 + \text{重量} \times 0.45$
- **孤立动作热量**：$\text{Burn}_{\text{isolation}} = \text{组数} \times 18.0 + \text{重量} \times 0.20$

---

## 🚀 快速上手与运行

本项目为**双端同构工程**（包含极速 Web 预览端与 Android 原生 Jetpack Compose 端）。

### 方式 A：Web 端 / 本地服务启动（即开即用）

克隆仓库并直接启动轻量服务：

```bash
# 1. 克隆本仓库
git clone https://github.com/QD8-png/TrainFit.git
cd TrainFit

# 2. 启动服务 (无需复杂构建工具，原生轻量服务)
node server.js
```

打开浏览器访问：
- **电脑端**：[http://localhost:3000](http://localhost:3000)
- **手机同 WiFi 局域网**：`http://你的电脑局域网IP:3000`

---

## 📱 导出 APK / 手机安装

### 1. Android Studio 编译原生 APK
1. 在 **Android Studio** 中打开项目根目录 `TrainFit/`；
2. 等待 Gradle 同步完成；
3. 点击顶部菜单栏：
   > **Build $\rightarrow$ Build Bundle(s) / APK(s) $\rightarrow$ Build APK(s)**
4. 编译完成后，生成的 APK 文件位于：
   `app/build/outputs/apk/debug/app-debug.apk`
5. 传输至手机即可一键安装使用！

### 2. 免编译一键添加到手机主屏幕 (PWA)
1. 手机连接与电脑相同的 WiFi；
2. 手机浏览器打开 `http://电脑IP:3000`；
3. 点击浏览器菜单 $\rightarrow$ 选择 **「添加到主屏幕」** 或 **「安装应用」**；
4. 手机桌面即可生成独立 App 图标，享受全屏无边框与本地离线存储体验。

---

## 📂 项目工程结构

```text
TrainFit/
├── app/                             # Android 原生工程 (Kotlin + Jetpack Compose)
│   ├── src/main/java/com/example/
│   │   ├── MainActivity.kt          # 3-Tab 导航路由与主入口
│   │   ├── data/ai/                 # AI 营养与训练解析服务 (Gemini & 本地规则)
│   │   ├── data/dao/ & database/    # Room 数据库与本地持久化
│   │   ├── ui/screens/              # DietScreen / WorkoutScreen / HistoryScreen
│   │   └── viewmodel/               # MVVM 架构 ViewModel
│   └── build.gradle.kts
├── css/
│   └── style.css                    # 德系/瑞士极简工精风 UI 主题样式
├── js/
│   ├── app.js                       # SPA 主控制器、数据闭环与引导流程
│   ├── nutrition.js                 # 全能中式餐饮/零食/高颗粒度规格解析引擎
│   ├── workout.js                   # 力量训练动作解析与超负荷加片建议算法
│   ├── charts.js                    # Canvas 发丝级缺口环形仪表盘与历史折线图
│   └── speech.js                    # Web Speech API 浏览器语音听写驱动
├── index.html                       # 极简 Web 交互端骨架
├── server.js                        # 局域网多设备同步 Web 服务
├── settings.gradle.kts              # Gradle 多模块配置
└── README.md                        # 项目说明文档
```

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！如果你有更丰富的常吃美食热量数据或更前沿的超负荷进阶算法，欢迎交流探讨。

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。
