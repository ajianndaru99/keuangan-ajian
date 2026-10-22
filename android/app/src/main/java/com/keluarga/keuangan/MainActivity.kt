package com.keluarga.keuangan

import android.Manifest
import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.view.View
import android.webkit.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.keluarga.keuangan.data.ProfileManager
import com.keluarga.keuangan.databinding.ActivityMainBinding
import com.keluarga.keuangan.service.AppUpdateManager
import com.keluarga.keuangan.service.KeuanganNotificationListener
import java.util.concurrent.Executor

// ==============================================================================
// ACTIVITY: com.keluarga.keuangan.MainActivity
// Layar Utama Dasbor Keuangan Keluarga (WebView Layar Penuh & Biometric Bridge)
// ==============================================================================

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var profileManager: ProfileManager

    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        profileManager = ProfileManager(this)

        // Jika setup awal belum selesai, arahkan ke Onboarding
        if (!profileManager.isSetupCompleted) {
            val intent = Intent(this, OnboardingActivity::class.java)
            startActivity(intent)
            finish()
            return
        }

        setupBiometrics()
        setupWebView()
        setupBackNavigation()
        checkForUpdatesSilently()
        requestNotificationPermissionIfNeeded()
    }

    private fun checkForUpdatesSilently() {
        AppUpdateManager.checkAndPromptUpdate(this, profileManager.webUrl, isManual = false)
    }

    override fun onResume() {
        super.onResume()
        ensureNotificationServiceRunning()
    }

    private fun ensureNotificationServiceRunning() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                val componentName = ComponentName(this, KeuanganNotificationListener::class.java)
                NotificationListenerService.requestRebind(componentName)
            } catch (ignored: Exception) {
                // Ignore jika belum diizinkan atau sudah aktif
            }
        }
    }

    private fun setupBiometrics() {
        executor = ContextCompat.getMainExecutor(this)
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    // Panggil callback JavaScript di Web Dasbor
                    binding.webView.post {
                        binding.webView.evaluateJavascript(
                            "if (window.AndroidBridge && window.AndroidBridge.onBiometricSuccess) { window.AndroidBridge.onBiometricSuccess(); }",
                            null
                        )
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    binding.webView.post {
                        binding.webView.evaluateJavascript(
                            "if (window.AndroidBridge && window.AndroidBridge.onBiometricFailed) { window.AndroidBridge.onBiometricFailed('$errString'); }",
                            null
                        )
                    }
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    binding.webView.post {
                        binding.webView.evaluateJavascript(
                            "if (window.AndroidBridge && window.AndroidBridge.onBiometricFailed) { window.AndroidBridge.onBiometricFailed('Sensor tidak cocok'); }",
                            null
                        )
                    }
                }
            })
    }

    fun triggerNativeBiometric(title: String, subtitle: String) {
        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Gunakan PIN Angka")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webView = binding.webView
        val settings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // User agent modern
        settings.userAgentString = settings.userAgentString + " KeuanganKeluargaApp/1.0"

        // Injeksi Bridge JavaScript dua arah
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        // Nonaktifkan pull-to-refresh agar gulir ke bawah di WebView tidak memicu reload halaman
        binding.swipeRefreshLayout.isEnabled = false

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                binding.progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                binding.progressBar.visibility = View.GONE
                binding.swipeRefreshLayout.isRefreshing = false
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false

                // Biarkan URL dasbor dibuka di dalam WebView
                if (url.startsWith(profileManager.webUrl) || url.startsWith("https://keuangan-ajian.vercel.app")) {
                    return false
                }

                // Tautan eksternal (misal unduhan/bantuan luar) dibuka di peramban sistem
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    return true
                } catch (e: Exception) {
                    return false
                }
            }
        }

        // WebChromeClient untuk menangani dialog JavaScript (alert & confirm)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("Pemberitahuan")
                    .setMessage(message ?: "")
                    .setPositiveButton("OK") { _, _ -> result?.confirm() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("Konfirmasi")
                    .setMessage(message ?: "")
                    .setPositiveButton("Ya") { _, _ -> result?.confirm() }
                    .setNegativeButton("Batal") { _, _ -> result?.cancel() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }
        }

        // Muat Alamat Dasbor (Dukung target_path deep link dari notifikasi)
        val targetPath = intent.getStringExtra("target_path") ?: ""
        val initialUrl = if (targetPath.isNotEmpty()) {
            val base = profileManager.webUrl.trimEnd('/')
            val cleanPath = if (targetPath.startsWith("/")) targetPath else "/$targetPath"
            "$base$cleanPath"
        } else {
            profileManager.webUrl
        }
        webView.loadUrl(initialUrl)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        val targetPath = intent?.getStringExtra("target_path") ?: return
        if (targetPath.isNotEmpty()) {
            val base = profileManager.webUrl.trimEnd('/')
            val cleanPath = if (targetPath.startsWith("/")) targetPath else "/$targetPath"
            binding.webView.loadUrl("$base$cleanPath")
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    // ==========================================================================
    // JAVASCRIPT INTERFACE (BRIDGE DUA ARAH WEB <-> ANDROID)
    // ==========================================================================
    class WebAppInterface(private val activity: MainActivity) {

        @JavascriptInterface
        fun isBiometricsAvailable(): Boolean {
            val biometricManager = BiometricManager.from(activity)
            val canAuthenticate = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            return canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS
        }

        @JavascriptInterface
        fun authenticateBiometric(title: String, subtitle: String) {
            activity.runOnUiThread {
                activity.triggerNativeBiometric(title, subtitle)
            }
        }

        @JavascriptInterface
        fun getDeviceId(): String {
            return activity.profileManager.getDeviceId()
        }

        @JavascriptInterface
        fun openSetup() {
            val intent = Intent(activity, OnboardingActivity::class.java)
            activity.startActivity(intent)
        }

        @JavascriptInterface
        fun checkForUpdate() {
            activity.runOnUiThread {
                AppUpdateManager.checkAndPromptUpdate(activity, activity.profileManager.webUrl, isManual = true)
            }
        }
    }
}
