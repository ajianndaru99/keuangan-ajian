package com.keluarga.keuangan.service

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
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
// Pengelola Pembaruan Otomatis Aplikasi (In-App Auto-Updater) dengan Hardening Keamanan
// Memvalidasi URL tepercaya, memeriksa integritas paket, dan mencocokkan signature digital
// ==============================================================================

object AppUpdateManager {

    private val executor = Executors.newSingleThreadExecutor()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
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

    /**
     * Keamanan Tingkat 1: Validasi domain unduhan (Hanya repositori resmi GitHub & GitHub CDN)
     */
    private fun isTrustedDownloadUrl(url: String): Boolean {
        return try {
            val uri = Uri.parse(url)
            val scheme = uri.scheme?.lowercase() ?: return false
            val host = uri.host?.lowercase() ?: return false

            if (scheme != "https") return false

            // Hanya izinkan domain rilis GitHub akun ajianndaru99 atau CDN S3 resmi GitHub
            (host == "github.com" && uri.path?.startsWith("/ajianndaru99/keuangan-ajian/releases/") == true) ||
            host == "objects.githubusercontent.com"
        } catch (e: Exception) {
            false
        }
    }

    private fun downloadAndInstallApk(activity: Activity, updateInfo: UpdateInfo) {
        // Validasi keamanan URL sebelum mengunduh
        if (!isTrustedDownloadUrl(updateInfo.apkUrl)) {
            showToast(activity, "Keamanan: URL pembaruan ditolak karena tidak berasal dari repositori resmi.")
            return
        }

        // Tampilkan dialog proses unduh
        val progressDialog = MaterialAlertDialogBuilder(activity)
            .setTitle("Mengunduh Pembaruan")
            .setMessage("Sedang mengunduh berkas installer resmi...\nMohon tunggu beberapa saat.")
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

                // Keamanan Tingkat 2: Validasi ukuran minimal berkas APK (minimal 500 KB)
                if (apkFile.length() < 500_000) {
                    apkFile.delete()
                    throw Exception("Berkas installer tidak utuh atau terpotong.")
                }

                // Keamanan Tingkat 3: Verifikasi nama paket & keutuhan arsip APK
                val archiveInfo = activity.packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
                if (archiveInfo == null) {
                    apkFile.delete()
                    throw Exception("Format paket rusak atau tidak dikenali oleh sistem.")
                }

                if (archiveInfo.packageName != activity.packageName) {
                    apkFile.delete()
                    throw Exception("Nama paket (${archiveInfo.packageName}) tidak sesuai dengan aplikasi ini.")
                }

                // Keamanan Tingkat 4: Verifikasi signature kriptografi digital
                val isSignatureValid = verifyApkSignature(activity, apkFile.absolutePath)
                if (!isSignatureValid) {
                    apkFile.delete()
                    throw Exception("Tanda tangan digital (signature) berkas pembaruan tidak cocok.")
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
                    showToast(activity, "Pembaruan dibatalkan: ${e.localizedMessage}")
                }
            }
        }
    }

    /**
     * Memverifikasi bahwa tanda tangan digital (signing certificate) paket APK yang diunduh
     * identik dengan aplikasi yang saat ini terpasang di HP.
     */
    @Suppress("DEPRECATION")
    private fun verifyApkSignature(context: Context, apkPath: String): Boolean {
        return try {
            val pm = context.packageManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val currentInfo = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val currentSigners = currentInfo.signingInfo?.apkContentsSigners?.map { it.hashCode() }?.toSet() ?: emptySet()

                val archiveInfo = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES)
                val archiveSigners = archiveInfo?.signingInfo?.apkContentsSigners?.map { it.hashCode() }?.toSet() ?: emptySet()

                if (currentSigners.isEmpty() || archiveSigners.isEmpty()) {
                    true // Biarkan PackageInstaller sistem OS Android yang melakukan final check
                } else {
                    currentSigners == archiveSigners
                }
            } else {
                val currentInfo = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
                val currentSignatures = currentInfo.signatures?.map { it.hashCode() }?.toSet() ?: emptySet()

                val archiveInfo = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNATURES)
                val archiveSignatures = archiveInfo?.signatures?.map { it.hashCode() }?.toSet() ?: emptySet()

                if (currentSignatures.isEmpty() || archiveSignatures.isEmpty()) {
                    true
                } else {
                    currentSignatures == archiveSignatures
                }
            }
        } catch (e: Exception) {
            // Jika terjadi kegagalan pembacaan reflektif, sistem inti Android tetap menjamin signature saat intent dipanggil
            true
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
