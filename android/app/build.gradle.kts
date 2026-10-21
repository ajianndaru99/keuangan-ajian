plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.keluarga.keuangan"
    compileSdk = 34

    val buildNum = System.getenv("BUILD_NUMBER")?.toIntOrNull() ?: 2
    defaultConfig {
        applicationId = "com.keluarga.keuangan"
        minSdk = 24
        targetSdk = 34
        versionCode = buildNum
        versionName = "1.0.$buildNum"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        val keystoreFile = rootProject.file("keystore.jks")
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = keystoreFile
                storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "keluargaKeuangan2024"
                keyAlias = System.getenv("KEY_ALIAS") ?: "keuangan"
                keyPassword = System.getenv("KEY_PASSWORD") ?: "keluargaKeuangan2024"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    
    // Sensor Biometrik (Sidik Jari Infinix Note 30 Pro & Samsung A52)
    implementation("androidx.biometric:biometric:1.1.0")

    // HTTP Client & JSON Parser untuk Webhook Forwarder
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")

    // Local Storage Terenkripsi
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
