package com.keluarga.keuangan

// ==============================================================================
// CONFIG: com.keluarga.keuangan.AppConfig
// Konfigurasi Terpusat Aplikasi Keuangan Keluarga Android
// ==============================================================================

object AppConfig {
    // Alamat Server Dasbor Vercel (Dapat disesuaikan lewat ProfileManager/UI)
    const val DEFAULT_WEB_URL = "https://keuangan-ajian.vercel.app"
    const val NOTIFICATION_ENDPOINT = "$DEFAULT_WEB_URL/api/notification"

    // Kunci API Default (dapat ditimpa dinamis di layar Onboarding via ProfileManager tanpa recompile APK)
    const val API_KEY_SUAMI = "mock_dev_key_suami"
    const val API_KEY_ISTRI = "mock_dev_key_istri"

    // Daftar Aplikasi Bank & E-Wallet Terdaftar
    val BANK_PACKAGES = setOf(
        "com.bankjago.digital",      // Bank Jago
        "id.bmri.livin",             // Mandiri Livin'
        "com.bca",                   // BCA Mobile
        "id.co.bankbca.mybca",       // myBCA
        "com.bri.brimobile",         // BRImo (BRI)
        "com.bsm.activity",          // BSI Mobile / BYOND
        "com.bankbke",               // SeaBank
        "com.btpn.jenius",           // Jenius BTPN
        "com.gojek.app",             // GoPay
        "id.dana",                   // DANA
        "ovo.id",                    // OVO
        "com.shopee.id"              // ShopeePay
    )

    // Kata kunci sensitif (OTP / PIN) yang disensor otomatis sebelum dikirim
    val SENSITIVE_KEYWORDS = listOf(
        "otp",
        "kode verifikasi",
        "verification code",
        "kode rahasia",
        "jangan berikan",
        "pin anda",
        "security code"
    )
}
