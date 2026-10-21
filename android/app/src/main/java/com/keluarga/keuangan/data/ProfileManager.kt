package com.keluarga.keuangan.data

import android.content.Context
import android.content.SharedPreferences
import com.keluarga.keuangan.AppConfig

// ==============================================================================
// DATA: com.keluarga.keuangan.data.ProfileManager
// Pengelola Profil Perangkat (Suami vs Istri) dan Status Setup
// ==============================================================================

class ProfileManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("keuangan_keluarga_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_PROFILE = "selected_profile"
        private const val KEY_SETUP_COMPLETED = "is_setup_completed"
        private const val KEY_CUSTOM_URL = "custom_web_url"
        private const val KEY_CUSTOM_API_KEY_SUAMI = "custom_api_key_suami"
        private const val KEY_CUSTOM_API_KEY_ISTRI = "custom_api_key_istri"
    }

    var selectedProfile: String
        get() = prefs.getString(KEY_PROFILE, "suami") ?: "suami"
        set(value) = prefs.edit().putString(KEY_PROFILE, value).apply()

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

    var customApiKeyIstri: String
        get() = prefs.getString(KEY_CUSTOM_API_KEY_ISTRI, "") ?: ""
        set(value) = prefs.edit().putString(KEY_CUSTOM_API_KEY_ISTRI, value.trim()).apply()

    fun getApiKey(): String {
        val customKey = if (selectedProfile == "istri") customApiKeyIstri else customApiKeySuami
        if (customKey.isNotBlank()) {
            return customKey
        }
        return if (selectedProfile == "istri") {
            AppConfig.API_KEY_ISTRI
        } else {
            AppConfig.API_KEY_SUAMI
        }
    }

    fun getCurrentCustomApiKey(): String {
        return if (selectedProfile == "istri") customApiKeyIstri else customApiKeySuami
    }

    fun setCurrentCustomApiKey(key: String) {
        if (selectedProfile == "istri") {
            customApiKeyIstri = key
        } else {
            customApiKeySuami = key
        }
    }

    fun getDeviceId(): String {
        return if (selectedProfile == "istri") "hp_istri" else "hp_suami"
    }

    fun getProfileDisplayName(): String {
        return if (selectedProfile == "istri") {
            "Bendahara Keluarga (Istri)"
        } else {
            "Kepala Keluarga (Suami)"
        }
    }
}
