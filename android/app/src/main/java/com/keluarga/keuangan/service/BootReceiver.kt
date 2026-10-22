package com.keluarga.keuangan.service

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.util.Log

// ==============================================================================
// RECEIVER: com.keluarga.keuangan.service.BootReceiver
// Penerima Sinyal Auto-Start Sistem Android (BOOT_COMPLETED & PACKAGE_REPLACED)
// Memastikan KeuanganNotificationListener segera terhubung kembali setelah HP restart
// ==============================================================================

class BootReceiver : BroadcastReceiver() {

    private val tag = "BootReceiver"

    override fun onReceive(context: Context?, intent: Intent?) {
        val action = intent?.action ?: return

        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Log.i(tag, "Sinyal sistem diterima ($action). Memeriksa status rebind NotificationListener...")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && context != null) {
                try {
                    val componentName = ComponentName(context, KeuanganNotificationListener::class.java)
                    NotificationListenerService.requestRebind(componentName)
                    Log.i(tag, "requestRebind berhasil dikirimkan ke system_server")
                } catch (e: Exception) {
                    Log.w(tag, "Kendala saat requestRebind pada boot: ${e.message}")
                }
            }
        }
    }
}
