package com.keluarga.keuangan.service

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// ==============================================================================
// SERVICE: com.keluarga.keuangan.service.AppUpdateManager
// Pengelola Pembaruan Otomatis Aplikasi (In-App Auto-Updater)
// Mengunduh & memicu instalasi APK resmi tanpa menghapus data aplikasi
// ==============================================================================

object AppUpdateManager {

    private val executor = Executors.newSingleThreadExecutor()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    data class UpdateInfo(
        val versionCode: Int,
        val versionName: String,
        val releaseNotes: String,
        val apkUrl: String
    )

    /**
     * Memeriksa pembaruan versi ke server dasbor secara asinkron
     */
    fun checkAndPromptUpdate(activity: Activity, webUrl: String, isManual: Boolean = false) {
        executor.execute {
            try {
                val cleanUrl = webUrl.trimEnd('/')
                val requestUrl = "$cleanUrl/api/app-version"
                val request = Request.Builder()
                    .url(requestUrl)
                    .header("User-Agent", "KeuanganKeluarga-Android-Updater")
                    .get()
                    .build()

                val response = httpClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    if (isManual) {
                        showToast(activity, "Gagal memeriksa versi (HTTP ${response.code})")
                    }
                    return@execute
                }

                val bodyString = response.body?.string() ?: return@execute
                val json = JSONObject(bodyString)

                val serverVersionCode = json.optInt("versionCode", 0)
                val versionName = json.optString("versionName", "1.0.0")
                val releaseNotes = json.optString("releaseNotes", "Pembaruan sistem.")
                val apkUrl = json.optString("apkUrl", "")

                val currentVersionCode = getInstalledVersionCode(activity)

                if (serverVersionCode > currentVersionCode && apkUrl.isNotBlank()) {
                    val updateInfo = UpdateInfo(
                        versionCode = serverVersionCode,
                        versionName = versionName,
                        releaseNotes = releaseNotes,
                        apkUrl = apkUrl
                    )
                    activity.runOnUiThread {
                        if (!activity.isFinishing && !activity.isDestroyed) {
                            showUpdatePromptDialog(activity, updateInfo)
                        }
                    }
                } else if (isManual) {
                    showToast(activity, "Aplikasi sudah menggunakan versi terbaru (v$versionName).")
                }
            } catch (e: Exception) {
                if (isManual) {
                    showToast(activity, "Gagal terhubung ke server pembaruan: ${e.localizedMessage}")
                }
            }
        }
    }

    private fun getInstalledVersionCode(context: Context): Int {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
        } catch (e: Exception) {
            1
        }
    }

    private fun showUpdatePromptDialog(activity: Activity, updateInfo: UpdateInfo) {
        MaterialAlertDialogBuilder(activity)
            .setTitle("Pembaruan Aplikasi Tersedia")
            .setMessage("Versi ${updateInfo.versionName} siap dipasang.\n\nCatatan Pembaruan:\n${updateInfo.releaseNotes}")
            .setCancelable(true)
            .setPositiveButton("Perbarui Sekarang") { _, _ ->
                downloadAndInstallApk(activity, updateInfo)
            }
            .setNegativeButton("Nanti", null)
            .show()
    }

    private fun downloadAndInstallApk(activity: Activity, updateInfo: UpdateInfo) {
        // Tampilkan dialog proses unduh
        val progressDialog = MaterialAlertDialogBuilder(activity)
            .setTitle("Mengunduh Pembaruan")
            .setMessage("Sedang mengunduh berkas installer...\nMohon tunggu beberapa saat.")
            .setCancelable(false)
            .create()

        progressDialog.show()

        executor.execute {
            try {
                val request = Request.Builder()
                    .url(updateInfo.apkUrl)
                    .header("User-Agent", "KeuanganKeluarga-Android-Downloader")
                    .get()
                    .build()

                val response = httpClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    throw Exception("Unduhan gagal dengan status HTTP ${response.code}")
                }

                val body = response.body ?: throw Exception("Konten berkas kosong")
                val apkFile = File(activity.cacheDir, "KeuanganKeluarga-Update.apk")
                if (apkFile.exists()) {
                    apkFile.delete()
                }

                body.byteStream().use { input ->
                    FileOutputStream(apkFile).use { output ->
                        input.copyTo(output)
                    }
                }

                activity.runOnUiThread {
                    progressDialog.dismiss()
                    if (!activity.isFinishing && !activity.isDestroyed) {
                        promptSystemInstall(activity, apkFile)
                    }
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    progressDialog.dismiss()
                    showToast(activity, "Gagal mengunduh berkas pembaruan: ${e.localizedMessage}")
                }
            }
        }
    }

    private fun promptSystemInstall(activity: Activity, apkFile: File) {
        try {
            // Khusus Android 8.0+ (Oreo) ke atas: periksa izin instalasi dari sumber tidak dikenal
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    MaterialAlertDialogBuilder(activity)
                        .setTitle("Izin Diperlukan")
                        .setMessage("Untuk melanjutkan pembaruan aplikasi secara otomatis, mohon aktifkan izin 'Izinkan dari sumber ini'.")
                        .setPositiveButton("Buka Pengaturan") { _, _ ->
                            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                                data = Uri.parse("package:${activity.packageName}")
                            }
                            activity.startActivity(intent)
                        }
                        .setNegativeButton("Batal", null)
                        .show()
                    return
                }
            }

            val apkUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            activity.startActivity(installIntent)
        } catch (e: Exception) {
            showToast(activity, "Tidak dapat membuka installer: ${e.localizedMessage}")
        }
    }

    private fun showToast(activity: Activity, message: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, message, Toast.LENGTH_LONG).show()
        }
    }
}
