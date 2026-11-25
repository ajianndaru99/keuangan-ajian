package com.keluarga.keuangan.data

import android.content.Context
import android.content.SharedPreferences
import com.keluarga.keuangan.AppConfig

// ==============================================================================
// DATA: com.keluarga.keuangan.data.ProfileManager
// Pengelola Profil Tunggal (Akun Suami) dan Status Setup Perangkat
// ==============================================================================

class ProfileManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("keuangan_keluarga_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_SETUP_COMPLETED = "is_setup_completed"
        private const val KEY_CUSTOM_URL = "custom_web_url"
        private const val KEY_CUSTOM_API_KEY_SUAMI = "custom_api_key_suami"
    }

    var selectedProfile: String
        get() = "suami"
        set(_) {}

    var isSetupCompleted: Boolean
        get() = prefs.getBoolean(KEY_SETUP_COMPLETED, false)
        set(value) = prefs.edit().putBoolean(KEY_SETUP_COMPLETED, value).apply()

    var webUrl: String
        get() = prefs.getString(KEY_CUSTOM_URL, AppConfig.DEFAULT_WEB_URL) ?: AppConfig.DEFAULT_WEB_URL
        set(value) = prefs.edit().putString(KEY_CUSTOM_URL, value.trim()).apply()

    val notificationEndpoint: String
        get() = "$webUrl/api/notification"

    var customApiKeySuami: String
        get() = prefs.getString(KEY_CUSTOM_API_KEY_SUAMI, "") ?: ""
        set(value) = prefs.edit().putString(KEY_CUSTOM_API_KEY_SUAMI, value.trim()).apply()

    fun getApiKey(): String {
        if (customApiKeySuami.isNotBlank()) {
            return customApiKeySuami
        }
        return AppConfig.API_KEY_SUAMI
    }

    fun getCurrentCustomApiKey(): String = customApiKeySuami

    fun setCurrentCustomApiKey(key: String) {
        customApiKeySuami = key
    }

    fun getDeviceId(): String = "hp_suami"

    fun getProfileDisplayName(): String = "Kepala Keluarga (Suami)"
}
