package io.github.ccch1mneyyy.dsh_app.mobot

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import io.github.ccch1mneyyy.dsh_app.MainActivity
import io.github.ccch1mneyyy.dsh_app.R
import io.github.ccch1mneyyy.dsh_app.i18n.AppStrings

/**
 * Mobot 手机的常驻通知（方案 5.3 的后台保活）。
 *
 * 它不跑逻辑，也不碰网络：配对、心跳、执行都在 Dart 侧，这里只让系统在 App 退到后台后
 * 别把进程回收——Dart 还活着，心跳才能继续领平台派发的指令。没有推送，进程被杀后无法
 * 保证立刻被唤起；平台侧的命令会留着重领，界面如实显示“重连中”。
 */
class MobotLinkService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel(this)
        val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty { AppStrings.APP_NAME }
        val text = intent?.getStringExtra(EXTRA_TEXT).orEmpty()
        foreground(buildNotification(this, title, text))
        running = true
        // A sticky restart has no extras: the app's own heartbeat state fills them in again.
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    private fun foreground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_TEXT = "text"
        private const val CHANNEL_ID = "mobot-link"
        private const val NOTIFICATION_ID = 3090

        @Volatile var running = false
            private set

        /** The channel's name is the brand, so it needs no translation. */
        private fun ensureChannel(context: Context) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, AppStrings.APP_NAME, NotificationManager.IMPORTANCE_LOW))
        }

        /** 已连接 / 正在执行… (text from Dart, already in the app's language). */
        fun show(context: Context, title: String, text: String) {
            val intent = Intent(context, MobotLinkService::class.java)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_TEXT, text)
            runCatching { context.startForegroundService(intent) }
        }

        /** The link stopped or was paused: the notification goes, the process may be reclaimed. */
        fun hide(context: Context) {
            runCatching { context.stopService(Intent(context, MobotLinkService::class.java)) }
        }

        private fun buildNotification(context: Context, title: String, text: String): Notification =
            Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_dsh)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setContentIntent(
                    PendingIntent.getActivity(
                        context,
                        NOTIFICATION_ID,
                        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    ),
                )
                .build()
    }
}