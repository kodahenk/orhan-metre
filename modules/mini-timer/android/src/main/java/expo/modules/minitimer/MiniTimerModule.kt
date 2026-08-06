package expo.modules.minitimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.Chronometer
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Arka plan mini sayacı.
 *
 * - Overlay: "Diğer uygulamaların üzerinde göster" izniyle sol üstte yarı
 *   saydam, kendi kendine tikleyen (Chronometer) geri sayım. Uygulama arka
 *   plana geçince JS zamanlayıcıları durduğu için tikleme tamamen native
 *   taraftadır; JS yalnızca bitiş zaman damgasını (endsAt) verir.
 * - Bildirim: SystemUI sürecinde tikleyen kronometreli kalıcı bildirim —
 *   overlay izni yoksa ya da sistem uygulama sürecini dondurursa yedek olur.
 */
class MiniTimerModule : Module() {
  private var overlayView: LinearLayout? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("MiniTimer")

    Function("hasOverlayPermission") {
      Settings.canDrawOverlays(context)
    }

    Function("requestOverlayPermission") {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("showOverlay") { endsAt: Double, label: String ->
      mainHandler.post { showOverlayInternal(endsAt.toLong(), label) }
    }

    Function("hideOverlay") {
      mainHandler.post { hideOverlayInternal() }
    }

    Function("showCountdownNotification") { endsAt: Double, title: String ->
      showNotificationInternal(endsAt.toLong(), title)
    }

    Function("hideCountdownNotification") {
      runCatching { notificationManager.cancel(NOTIFICATION_ID) }
    }

    OnDestroy {
      mainHandler.post { runCatching { hideOverlayInternal() } }
      runCatching { notificationManager.cancel(NOTIFICATION_ID) }
    }
  }

  private val notificationManager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun dp(value: Float): Int =
    TypedValue
      .applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics)
      .toInt()

  private fun showOverlayInternal(endsAtMs: Long, label: String) {
    if (!Settings.canDrawOverlays(context)) return
    hideOverlayInternal()
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12f), dp(6f), dp(12f), dp(7f))
      background = GradientDrawable().apply {
        setColor(Color.argb(140, 0, 0, 0)) // yarı saydam siyah zemin
        cornerRadius = dp(10f).toFloat()
      }
    }
    if (label.isNotBlank()) {
      container.addView(
        TextView(context).apply {
          text = label
          setTextColor(Color.argb(210, 255, 255, 255))
          textSize = 11f
        },
      )
    }
    container.addView(
      Chronometer(context).apply {
        isCountDown = true
        base = SystemClock.elapsedRealtime() + (endsAtMs - System.currentTimeMillis())
        setTextColor(Color.WHITE)
        textSize = 18f
        start()
      },
    )

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      // Dokunmaya ve odağa kapalı: alttaki uygulamanın kullanımını bozmaz.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(16f)
      y = dp(96f) // sol üstte, durum çubuğunun biraz altında
    }
    runCatching { wm.addView(container, params) }.onSuccess { overlayView = container }
  }

  private fun hideOverlayInternal() {
    val view = overlayView ?: return
    overlayView = null
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    runCatching { wm.removeView(view) }
  }

  private fun showNotificationInternal(endsAtMs: Long, title: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notificationManager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Mini sayaç", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val contentIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(
        context,
        0,
        it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(true)
      // Kronometre SystemUI'da tikler: setWhen(endsAt) + countdown → canlı geri sayım.
      .setWhen(endsAtMs)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .apply { contentIntent?.let { setContentIntent(it) } }
      .build()
    runCatching { notificationManager.notify(NOTIFICATION_ID, notification) }
  }

  companion object {
    private const val CHANNEL_ID = "mini-sayac"
    private const val NOTIFICATION_ID = 4242
  }
}
