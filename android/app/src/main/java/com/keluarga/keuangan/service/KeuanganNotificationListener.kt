package com.keluarga.keuangan.service

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.keluarga.keuangan.AppConfig
import com.keluarga.keuangan.data.ProfileManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.keluarga.keuangan.MainActivity
import com.keluarga.keuangan.R
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

    companion object {
        private const val PREFS_QUEUE = "keuangan_offline_queue"
        private const val KEY_PENDING_ITEMS = "pending_payloads"
        private const val MAX_QUEUE_SIZE = 50
    }

    override fun onCreate() {
        super.onCreate()
        profileManager = ProfileManager(this)
        Log.i(tag, "KeuanganNotificationListener aktif untuk profil: ${profileManager.selectedProfile}")
        flushOfflineQueue()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName ?: return

        // 1. Filter: Hanya proses aplikasi perbankan & e-wallet yang terdaftar
        if (!AppConfig.isFinancialPackage(packageName)) {
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

        val payloadString = jsonPayload.toString()
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = payloadString.toRequestBody(mediaType)

        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-API-KEY", apiKey)
            .post(requestBody)
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(tag, "Koneksi gagal (${e.message}), menyimpan notifikasi ke buffer antrean offline...")
                enqueueOfflinePayload(payloadString)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (response.isSuccessful) {
                        Log.i(tag, "Notifikasi berhasil dicatat di server (HTTP ${response.code})")
                        val responseBody = try { response.body?.string() ?: "" } catch (_: Exception) { "" }
                        // Kosongkan antrean tertunda jika ada koneksi
                        flushOfflineQueue()
                        // Tangani peringatan dari server jika ada
                        handleServerAlerts(responseBody)
                    } else if (response.code >= 500) {
                        Log.w(tag, "Server error (${response.code}), menyimpan ke buffer antrean offline...")
                        enqueueOfflinePayload(payloadString)
                    } else {
                        Log.w(tag, "Server menolak payload (HTTP ${response.code}): ${response.message}")
                    }
                }
            }
        })
    }

    private fun handleServerAlerts(responseBody: String) {
        if (responseBody.isEmpty()) return
        try {
            val root = JsonParser.parseString(responseBody).asJsonObject

            // 1. Peringatan Validasi Transaksi (Review Alert)
            if (root.has("review_alert") && !root.get("review_alert").isJsonNull) {
                val review = root.getAsJsonObject("review_alert")
                val title = review.get("title")?.asString ?: "⚠️ Verifikasi Transaksi Baru"
                val message = review.get("message")?.asString ?: "Ada transaksi yang memerlukan pemeriksaan Anda."
                showLocalNotification(
                    notificationId = 1001,
                    title = title,
                    message = message,
                    targetPath = "/inbox"
                )
            }

            // 2. Peringatan Batas Anggaran (Budget Alert: 80% atau 100%)
            if (root.has("budget_alert") && !root.get("budget_alert").isJsonNull) {
                val budget = root.getAsJsonObject("budget_alert")
                val title = budget.get("title")?.asString ?: "⚠️ Peringatan Batas Anggaran"
                val message = budget.get("message")?.asString ?: "Pengeluaran kategori hampir melebihi batas anggaran."
                val level = budget.get("level")?.asString ?: "80"
                val notifId = if (level == "100") 2002 else 2001
                showLocalNotification(
                    notificationId = notifId,
                    title = title,
                    message = message,
                    targetPath = "/budget"
                )
            }
        } catch (e: Exception) {
            Log.w(tag, "Gagal memproses alert respon server: ${e.message}")
        }
    }

    private fun showLocalNotification(
        notificationId: Int,
        title: String,
        message: String,
        targetPath: String
    ) {
        try {
            val channelId = "keuangan_family_alerts"
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    channelId,
                    "Peringatan Anggaran & Transaksi",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifikasi peringatan batas belanja dan verifikasi mutasi bank"
                    enableVibration(true)
                }
                notificationManager.createNotificationChannel(channel)
            }

            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("target_path", targetPath)
            }

            val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            val pendingIntent = PendingIntent.getActivity(this, notificationId, intent, pendingIntentFlags)

            val builder = NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)

            notificationManager.notify(notificationId, builder.build())
            Log.i(tag, "Notifikasi lokal ditampilkan: $title")
        } catch (e: Exception) {
            Log.e(tag, "Gagal menampilkan notifikasi lokal: ${e.message}")
        }
    }

    @Synchronized
    private fun enqueueOfflinePayload(payloadString: String) {
        try {
            val prefs = getSharedPreferences(PREFS_QUEUE, Context.MODE_PRIVATE)
            val currentRaw = prefs.getString(KEY_PENDING_ITEMS, "[]") ?: "[]"
            val jsonArray = try {
                JsonParser.parseString(currentRaw).asJsonArray
            } catch (ignored: Exception) {
                JsonArray()
            }

            // Batasi kapasitas antrean maksimal agar tidak membebani memori
            if (jsonArray.size() >= MAX_QUEUE_SIZE) {
                jsonArray.remove(0)
            }

            jsonArray.add(payloadString)
            prefs.edit().putString(KEY_PENDING_ITEMS, jsonArray.toString()).apply()
            Log.i(tag, "Tersimpan di antrean offline. Total tertunda: ${jsonArray.size()}")
        } catch (e: Exception) {
            Log.e(tag, "Gagal menyimpan ke antrean offline: ${e.message}")
        }
    }

    @Synchronized
    private fun flushOfflineQueue() {
        try {
            val prefs = getSharedPreferences(PREFS_QUEUE, Context.MODE_PRIVATE)
            val currentRaw = prefs.getString(KEY_PENDING_ITEMS, "[]") ?: "[]"
            val jsonArray = try {
                JsonParser.parseString(currentRaw).asJsonArray
            } catch (ignored: Exception) {
                return
            }

            if (jsonArray.size() == 0) return

            val endpoint = profileManager.notificationEndpoint
            val apiKey = profileManager.getApiKey()
            val mediaType = "application/json; charset=utf-8".toMediaType()

            val remainingArray = JsonArray()
            var hasSentAny = false

            for (element in jsonArray) {
                val payloadStr = element.asString
                val requestBody = payloadStr.toRequestBody(mediaType)
                val request = Request.Builder()
                    .url(endpoint)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("X-API-KEY", apiKey)
                    .post(requestBody)
                    .build()

                try {
                    val response = httpClient.newCall(request).execute()
                    response.use { resp ->
                        if (resp.isSuccessful) {
                            hasSentAny = true
                            Log.i(tag, "Transaksi offline berhasil disinkronisasi ke server")
                        } else {
                            remainingArray.add(payloadStr)
                        }
                    }
                } catch (e: IOException) {
                    // Jaringan masih offline, simpan sisa item
                    remainingArray.add(payloadStr)
                }
            }

            if (hasSentAny) {
                prefs.edit().putString(KEY_PENDING_ITEMS, remainingArray.toString()).apply()
            }
        } catch (e: Exception) {
            Log.e(tag, "Gagal memproses antrean offline: ${e.message}")
        }
    }
}
