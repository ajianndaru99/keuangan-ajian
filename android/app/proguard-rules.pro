# Aturan ProGuard / R8 untuk Keuangan Keluarga Native

# 1. Pertahankan Interface JavaScript Bridge WebView (Biometric & Native Callbacks)
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.keluarga.keuangan.MainActivity$WebAppInterface { *; }

# 2. Pertahankan Model Data & Serialisasi JSON Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class com.keluarga.keuangan.data.** { *; }

# 3. OkHttp & Okio (HTTP Client Forwarder)
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# 4. Biometric & AndroidX Security Crypto
-keep class androidx.biometric.** { *; }
-keep class androidx.security.crypto.** { *; }
