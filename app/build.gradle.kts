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

android {
    namespace = "com.trainfit.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.trainfit.ai"
        minSdk = 24
        targetSdk = 34
        versionCode = 15
        versionName = "2.2"

        buildConfigField("String", "LLM_BASE_URL", llmConfig("LLM_BASE_URL", "https://api.atria-asi.ai/v1"))
        buildConfigField("String", "LLM_MODEL", llmConfig("LLM_MODEL", "Atria-Dawn-Preview"))
        buildConfigField("String", "LLM_API_KEY", llmConfig("LLM_API_KEY", ""))

        // 语音转文字（OpenAI 兼容 /audio/transcriptions），默认硅基流动 SenseVoice
        buildConfigField("String", "ASR_BASE_URL", llmConfig("ASR_BASE_URL", "https://api.siliconflow.cn/v1"))
        buildConfigField("String", "ASR_MODEL", llmConfig("ASR_MODEL", "FunAudioLLM/SenseVoiceSmall"))
        buildConfigField("String", "ASR_API_KEY", llmConfig("ASR_API_KEY", ""))
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isCrunchPngs = false
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
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

val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    description = "Syncs root Web frontend assets into Android assets directory"
    group = "build"

    from(rootProject.projectDir) {
        include("index.html")
        include("manifest.json")
        include("metadata.json")
        include("css/**")
        include("js/**")
    }
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
}
