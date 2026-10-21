package com.keluarga.keuangan

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import com.google.gson.JsonObject
import com.keluarga.keuangan.data.ProfileManager
import com.keluarga.keuangan.databinding.ActivityOnboardingBinding
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

// ==============================================================================
// ACTIVITY: com.keluarga.keuangan.OnboardingActivity
// Panduan Terpandu: Pemilihan Profil, Handshake Koneksi DB, dan Izin Sistem
// ==============================================================================

class OnboardingActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOnboardingBinding
    private lateinit var profileManager: ProfileManager
    private val httpClient = OkHttpClient()

    private var isHandshakeOk = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOnboardingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        profileManager = ProfileManager(this)

        setupProfileSelection()
        setupButtons()
        runDatabaseHandshake()
    }

    override fun onResume() {
        super.onResume()
        checkSystemPermissions()
    }

    private fun setupProfileSelection() {
        if (profileManager.selectedProfile == "istri") {
            binding.rbIstri.isChecked = true
        } else {
            binding.rbSuami.isChecked = true
        }

        binding.etApiKey.setText(profileManager.getCurrentCustomApiKey())

        binding.etApiKey.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                profileManager.setCurrentCustomApiKey(s?.toString() ?: "")
            }
        })

        binding.rgProfile.setOnCheckedChangeListener { _, checkedId ->
            if (checkedId == binding.rbIstri.id) {
                profileManager.selectedProfile = "istri"
            } else {
                profileManager.selectedProfile = "suami"
            }
            binding.etApiKey.setText(profileManager.getCurrentCustomApiKey())
            runDatabaseHandshake()
        }
    }

    private fun setupButtons() {
        // Tombol Handshake
        binding.btnRetryHandshake.setOnClickListener {
            runDatabaseHandshake()
        }

        // Tombol Izin Akses Notifikasi
        binding.btnOpenNotifSettings.setOnClickListener {
            try {
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "Gagal membuka pengaturan: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

        // Tombol Izin Baterai (Samsung Never Sleep / Infinix Unrestricted)
        binding.btnOpenBatterySettings.setOnClickListener {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } else {
                    Toast.makeText(this, "Izin baterai tidak diperlukan untuk versi Android ini", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this, "Buka Setelan Baterai secara manual", Toast.LENGTH_SHORT).show()
            }
        }

        // Tombol Auto-Start (Infinix XOS Phone Master & Custom ROM)
        binding.btnOpenAutoStart.setOnClickListener {
            openAutoStartSettings()
        }

        // Tombol Selesai
        binding.btnFinishOnboarding.setOnClickListener {
            if (!isHandshakeOk) {
                Toast.makeText(
                    this,
                    "Koneksi ke database belum berhasil diverifikasi. Silakan klik 'Uji Ulang Koneksi' terlebih dahulu.",
                    Toast.LENGTH_LONG
                ).show()
                return@setOnClickListener
            }
            profileManager.isSetupCompleted = true
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            finish()
        }
    }

    private fun checkSystemPermissions() {
        // 1. Cek Akses Notifikasi
        val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(this)
        val hasNotifAccess = enabledPackages.contains(packageName)

        if (hasNotifAccess) {
            binding.tvNotifPermissionStatus.text = "Aktif 🟢"
            binding.tvNotifPermissionStatus.setTextColor(getColor(R.color.income_green))
            binding.btnOpenNotifSettings.isEnabled = false
            binding.btnOpenNotifSettings.text = "Izin Notifikasi Sudah Diberikan"
        } else {
            binding.tvNotifPermissionStatus.text = "Belum Aktif 🔴"
            binding.tvNotifPermissionStatus.setTextColor(getColor(R.color.expense_red))
            binding.btnOpenNotifSettings.isEnabled = true
            binding.btnOpenNotifSettings.text = "Buka Pengaturan Notifikasi"
        }

        // 2. Cek Baterai Unrestricted
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val isIgnoringBattery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isIgnoringBatteryOptimizations(packageName)
        } else {
            true
        }

        if (isIgnoringBattery) {
            binding.tvBatteryStatus.text = "Aktif 🟢"
            binding.tvBatteryStatus.setTextColor(getColor(R.color.income_green))
            binding.btnOpenBatterySettings.isEnabled = false
            binding.btnOpenBatterySettings.text = "Baterai Bebas Pembatasan"
        } else {
            binding.tvBatteryStatus.text = "Belum Aktif 🔴"
            binding.tvBatteryStatus.setTextColor(getColor(R.color.expense_red))
            binding.btnOpenBatterySettings.isEnabled = true
            binding.btnOpenBatterySettings.text = "Izinkan Tanpa Batas Baterai"
        }
    }

    private fun runDatabaseHandshake() {
        binding.tvHandshakeStatus.text = "Menguji..."
        binding.tvHandshakeStatus.setTextColor(getColor(R.color.accent))
        binding.tvHandshakeDesc.text = "Menghubungkan ke ${profileManager.webUrl}..."
        binding.btnRetryHandshake.isEnabled = false

        val testPayload = JsonObject().apply {
            addProperty("device_id", profileManager.getDeviceId())
            addProperty("app_name", "HandshakeSetup")
            addProperty("title", "Uji Koneksi ${profileManager.getProfileDisplayName()}")
            addProperty("text", "Tes sinkronisasi perangkat ke database Supabase")
            addProperty("received_at", System.currentTimeMillis())
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = testPayload.toString().toRequestBody(mediaType)

        val request = Request.Builder()
            .url(profileManager.notificationEndpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-API-KEY", profileManager.getApiKey())
            .post(requestBody)
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    isHandshakeOk = false
                    binding.tvHandshakeStatus.text = "Koneksi Gagal 🔴"
                    binding.tvHandshakeStatus.setTextColor(getColor(R.color.expense_red))
                    binding.tvHandshakeDesc.text = "Gagal terhubung: ${e.message}. Pastikan ponsel tersambung internet."
                    binding.btnRetryHandshake.isEnabled = true
                }
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { resp ->
                    val isSuccess = resp.isSuccessful
                    val code = resp.code
                    val message = resp.message
                    runOnUiThread {
                        binding.btnRetryHandshake.isEnabled = true
                        if (isSuccess) {
                            isHandshakeOk = true
                            binding.tvHandshakeStatus.text = "Terhubung 🟢"
                            binding.tvHandshakeStatus.setTextColor(getColor(R.color.income_green))
                            binding.tvHandshakeDesc.text = "Database berhasil memverifikasi kunci profil ${profileManager.getProfileDisplayName()}."
                        } else {
                            isHandshakeOk = false
                            binding.tvHandshakeStatus.text = "HTTP $code 🔴"
                            binding.tvHandshakeStatus.setTextColor(getColor(R.color.expense_red))
                            binding.tvHandshakeDesc.text = "Respon server: $message. Periksa konfigurasi API Key."
                        }
                    }
                }
            }
        })
    }

    private fun openAutoStartSettings() {
        val intents = listOf(
            // Transsion XOS (Infinix Note 30 Pro / TECNO / itel) Phone Master
            Intent().setComponent(ComponentName("com.transsion.phonemaster", "com.transsion.phonemaster.autostart.AutoStartManagementActivity")),
            Intent().setComponent(ComponentName("com.transsion.phonemaster", "com.transsion.phonemaster.MainActivity")),
            // Xiaomi / MIUI / HyperOS
            Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            // Samsung Device Care
            Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")),
            // Oppo / Realme
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            // Fallback Pengaturan Aplikasi Umum
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
        )

        for (intent in intents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                return
            } catch (ignored: Exception) {
                // Lanjut ke intent berikutnya jika komponen tidak tersedia
            }
        }

        Toast.makeText(this, "Silakan buka pengaturan aplikasi secara manual", Toast.LENGTH_SHORT).show()
    }
}
