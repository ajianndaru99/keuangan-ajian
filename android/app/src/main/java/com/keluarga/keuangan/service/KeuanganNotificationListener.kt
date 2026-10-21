package com.keluarga.keuangan.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.google.gson.JsonObject
import com.keluarga.keuangan.AppConfig
import com.keluarga.keuangan.data.ProfileManager
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

// ==============================================================================
// SERVICE: com.keluarga.keuangan.service.KeuanganNotificationListener
// Layanan Latar Belakang Penangkap Notifikasi Mutasi Bank & E-Wallet
// ==============================================================================

class KeuanganNotificationListener : NotificationListenerService() {

    private val tag = "KeuanganNotifService"
    private lateinit var profileManager: ProfileManager

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        profileManager = ProfileManager(this)
        Log.i(tag, "KeuanganNotificationListener aktif untuk profil: ${profileManager.selectedProfile}")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName ?: return

        // 1. Filter: Hanya proses aplikasi perbankan & e-wallet yang terdaftar
        if (!AppConfig.BANK_PACKAGES.contains(packageName)) {
            return
        }

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: ""

        val content = if (bigText.isNotEmpty()) bigText else text

        // Jika tidak ada teks sama sekali, lewati
        if (title.isEmpty() && content.isEmpty()) return

        // 2. Sensor Otomatis Data Sensitif (OTP / PIN)
        val combined = "$title $content".lowercase()
        val isSensitive = AppConfig.SENSITIVE_KEYWORDS.any { kw -> combined.contains(kw) }
        val safeTitle = if (isSensitive) "[REDACTED]" else title
        val safeContent = if (isSensitive) "[REDACTED]" else content

        val postTime = sbn.postTime

        Log.d(tag, "Notifikasi bank tertangkap dari: $packageName ($safeTitle)")

        // 3. Kirim ke Webhook API Dasbor
        sendToWebhook(packageName, safeTitle, safeContent, postTime)
    }

    private fun sendToWebhook(packageName: String, title: String, content: String, postTime: Long) {
        val endpoint = profileManager.notificationEndpoint
        val apiKey = profileManager.getApiKey()
        val deviceId = profileManager.getDeviceId()

        val jsonPayload = JsonObject().apply {
            addProperty("device_id", deviceId)
            addProperty("app_name", packageName)
            addProperty("packageName", packageName)
            addProperty("title", title)
            addProperty("text", content)
            addProperty("content", content)
            addProperty("received_at", postTime)
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = jsonPayload.toString().toRequestBody(mediaType)

        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-API-KEY", apiKey)
            .post(requestBody)
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Gagal mengirim notifikasi ke server: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (response.isSuccessful) {
                        Log.i(tag, "Notifikasi berhasil dicatat di server (HTTP ${response.code})")
                    } else {
                        Log.w(tag, "Server mengembalikan status: ${response.code} - ${response.message}")
                    }
                }
            }
        })
    }
}
