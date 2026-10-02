import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// 大模型接口配置：优先读环境变量（CI 从 GitHub Secrets 注入），其次读 local.properties（本地编译用）。
// key 不写进源码仓库。
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun llmConfig(name: String, default: String): String {
    val raw = System.getenv(name)?.takeIf { it.isNotBlank() }
        ?: localProps.getProperty(name)?.takeIf { it.isNotBlank() }
        ?: default
    // 粘贴 Secret 时容易多带一行或空格：只取第一段非空内容，并去掉误带的 "Bearer "
    val v = raw.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() }.orEmpty()
        .removePrefix("Bearer ").trim()
    if (raw.trim().lines().size > 1) {
        logger.warn("$name 里有多行内容，只使用了第一行")
    }
    return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}

// 固定签名：CI 从 Secrets 解出钥匙文件（SIGNING_KEYSTORE_FILE），每个版本用同一把，新版能直接覆盖安装。
// 没配就照旧用临时的 debug 签名。钥匙和密码只在 Secrets 里，不进仓库。
val signingFile = System.getenv("SIGNING_KEYSTORE_FILE")?.takeIf { it.isNotBlank() && file(it).exists() }

android {
    namespace = "com.trainfit.app"
    compileSdk = 34

    signingConfigs {
        if (signingFile != null) {
            create("fixed") {
                storeFile = file(signingFile)
                storePassword = System.getenv("SIGNING_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("SIGNING_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "trainfit"
                keyPassword = System.getenv("SIGNING_KEY_PASSWORD")?.takeIf { it.isNotBlank() } ?: System.getenv("SIGNING_KEYSTORE_PASSWORD")
            }
        }
    }

    defaultConfig {
        applicationId = "com.trainfit.ai"
        minSdk = 24
        targetSdk = 34
        versionCode = 50
        versionName = "5.3"

        buildConfigField("String", "LLM_BASE_URL", llmConfig("LLM_BASE_URL", "https://api.atria-asi.ai/v1"))
        buildConfigField("String", "LLM_MODEL", llmConfig("LLM_MODEL", "Atria-Dawn-Preview"))
        buildConfigField("String", "LLM_API_KEY", llmConfig("LLM_API_KEY", ""))

        // 云端语音转文字（OpenAI 兼容 /audio/transcriptions），默认硅基流动上的 Qwen3-ASR 大模型：
        // 松手后联网就用它再认一遍（比手机本机的 SenseVoice 准）；本机识别用不了时也用它
        buildConfigField("String", "ASR_BASE_URL", llmConfig("ASR_BASE_URL", "https://api.siliconflow.cn/v1"))
        buildConfigField("String", "ASR_MODEL", llmConfig("ASR_MODEL", "Qwen/Qwen3-ASR-1.7B"))
        buildConfigField("String", "ASR_API_KEY", llmConfig("ASR_API_KEY", ""))
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            signingConfigs.findByName("fixed")?.let { signingConfig = it }
            isCrunchPngs = false
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
            signingConfigs.findByName("fixed")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // 本机语音识别的模型直接从安装包里读，不压缩加载更快
    androidResources {
        noCompress += listOf("onnx")
    }
}

// 网页源码在仓库根目录的 web/，编译前原样复制到 assets（assets 里的副本不进仓库）
val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    description = "Copies web/ into the Android assets directory"
    group = "build"

    from(rootProject.layout.projectDirectory.dir("web"))
    into(layout.projectDirectory.dir("src/main/assets"))
    // 本机语音识别模型由 scripts/fetch-asr.sh 下载到 assets/asr，同步网页时别删掉
    preserve {
        include("asr/**")
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.okhttp) // 千问实时语音识别的 WebSocket
}
