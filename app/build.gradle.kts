plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.trainfit.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.trainfit.ai"
        minSdk = 24
        targetSdk = 34
        versionCode = 7
        versionName = "1.5"
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
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
}
