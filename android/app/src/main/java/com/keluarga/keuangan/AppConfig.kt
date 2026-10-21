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
    const val API_KEY_SUAMI = "kunci_rahasia_keluarga_123"
    const val API_KEY_ISTRI = "kunci_rahasia_keluarga_123"

    // Daftar Aplikasi Bank & E-Wallet Terdaftar (Mendukung aplikasi standalone & variasi Play Store)
    val BANK_PACKAGES = setOf(
        "com.jago.digitalBanking",        // Bank Jago & Jago Syariah
        "com.bankjago.digital",           // Alias Bank Jago
        "com.gojek.app",                  // Gojek SuperApp
        "com.gojek.gopay",                // Standalone GoPay App
        "com.gojek.gopaymerchant",        // GoPay Merchant
        "com.bca",                        // BCA Mobile
        "id.co.bankbca.mybca",            // myBCA
        "com.bca.mybca.omni.android",     // myBCA Omni Play Store
        "com.bca.blu",                    // blu by BCA Digital
        "id.bmri.livin",                  // Mandiri Livin'
        "com.bri.brimobile",              // BRI Mobile legacy
        "id.co.bri.brimo",                // BRImo (BRI)
        "com.bsm.activity",               // BSI Mobile
        "com.bankbsi.byond",              // BYOND by BSI
        "com.bankbke",                    // SeaBank legacy
        "id.co.bankbkemobile.digitalbank",// SeaBank Play Store
        "com.btpn.jenius",                // Jenius BTPN
        "co.id.banksaqu.app",             // Bank Saqu
        "id.banksaqu.android",            // Bank Saqu alias
        "id.co.bni.wondr",                // Wondr by BNI
        "src.com.bni",                    // BNI Mobile Banking
        "id.dana",                        // DANA
        "ovo.id",                         // OVO
        "com.shopee.id",                  // ShopeePay / Shopee
        "id.co.cpm.android"               // LinkAja
    )

    /**
     * Memeriksa apakah package name berasal dari aplikasi perbankan atau e-wallet yang sah
     */
    fun isFinancialPackage(packageName: String): Boolean {
        val pkg = packageName.lowercase()
        if (BANK_PACKAGES.contains(packageName) || BANK_PACKAGES.contains(pkg)) {
            return true
        }
        return pkg.contains("jago") ||
               pkg.contains("gopay") ||
               pkg.contains("gojek") ||
               (pkg.contains("bca") && !pkg.contains("broadcast")) ||
               pkg.contains("livin") ||
               (pkg.contains("mandiri") && !pkg.contains("game")) ||
               pkg.contains("brimo") ||
               pkg.contains("seabank") ||
               pkg.contains("jenius") ||
               pkg.contains("banksaqu") ||
               pkg.contains("bankbsi") ||
               pkg.contains("dana") ||
               pkg.contains("ovo.id") ||
               pkg.contains("shopee")
    }

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
