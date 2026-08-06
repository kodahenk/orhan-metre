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
 *   taraftadır; JS yalnızca bitiş zaman damgasını (endsAt) verir. 0'a
 *   ulaşınca kendiliğinden kaldırılır — Chronometer aksi halde negatife
 *   sayarak devam ederdi.
 * - Bildirim: SystemUI sürecinde tikleyen kronometreli kalıcı bildirim;
 *   setTimeoutAfter sayesinde süreç ölse bile 0 anında sistem tarafından
 *   düşürülür (yetim kalmaz).
 *
 * Tüm giriş noktaları runCatching + nullable context ile korunur: React
 * context'in yıkıldığı reload/teardown yarışlarında ana thread'de
 * yakalanmamış istisna (çökme) oluşmaz.
 */
class MiniTimerModule : Module() {
  private var overlayView: LinearLayout? = null

  // Kaldırma, reactContext öldükten sonra da çalışabilsin diye WindowManager
  // eklenirken saklanır (dev reload'da overlay sızıntısı kalmasın).
  private var overlayWindowManager: WindowManager? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val hideOverlayAtZero = Runnable { hideOverlayInternal() }

  private val context: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("MiniTimer")

    Function("hasOverlayPermission") {
      context?.let { Settings.canDrawOverlays(it) } ?: false
    }

    Function("requestOverlayPermission") {
      runCatching {
        val ctx = context ?: return@runCatching
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${ctx.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
      }
      Unit
    }

    Function("showOverlay") { endsAt: Double, label: String ->
      mainHandler.post { runCatching { showOverlayInternal(endsAt.toLong(), label) } }
      Unit
    }

    Function("hideOverlay") {
      mainHandler.post { runCatching { hideOverlayInternal() } }
      Unit
    }

    Function("showCountdownNotification") { endsAt: Double, title: String ->
      runCatching { showNotificationInternal(endsAt.toLong(), title) }
      Unit
    }

    Function("hideCountdownNotification") {
      runCatching { cancelNotification() }
      Unit
    }

    OnDestroy {
      mainHandler.post { runCatching { hideOverlayInternal() } }
      runCatching { cancelNotification() }
    }
  }

  private fun dp(ctx: Context, value: Float): Int =
    TypedValue
      .applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, ctx.resources.displayMetrics)
      .toInt()

  private fun showOverlayInternal(endsAtMs: Long, label: String) {
    val ctx = context ?: return
    if (endsAtMs <= System.currentTimeMillis()) return
    if (!Settings.canDrawOverlays(ctx)) return
    hideOverlayInternal()
    val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    val container = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(ctx, 12f), dp(ctx, 6f), dp(ctx, 12f), dp(ctx, 7f))
      background = GradientDrawable().apply {
        setColor(Color.argb(140, 0, 0, 0)) // yarı saydam siyah zemin
        cornerRadius = dp(ctx, 10f).toFloat()
      }
    }
    if (label.isNotBlank()) {
      container.addView(
        TextView(ctx).apply {
          text = label
          setTextColor(Color.argb(210, 255, 255, 255))
          textSize = 11f
        },
      )
    }
    container.addView(
      Chronometer(ctx).apply {
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
      x = dp(ctx, 16f)
      y = dp(ctx, 96f) // sol üstte, durum çubuğunun biraz altında
    }
    runCatching { wm.addView(container, params) }.onSuccess {
      overlayView = container
      overlayWindowManager = wm
      // 0 anında kendiliğinden kalk: negatife sayan bayat sayaç kalmasın.
      // (Süreç dondurulursa gecikebilir; bildirim ayağı setTimeoutAfter ile
      // sistem tarafında garanti.)
      mainHandler.postDelayed(hideOverlayAtZero, endsAtMs - System.currentTimeMillis())
    }
  }

  private fun hideOverlayInternal() {
    mainHandler.removeCallbacks(hideOverlayAtZero)
    val view = overlayView ?: return
    overlayView = null
    val wm = overlayWindowManager
    overlayWindowManager = null
    runCatching { wm?.removeView(view) }
  }

  private fun showNotificationInternal(endsAtMs: Long, title: String) {
    val ctx = context ?: return
    val remainingMs = endsAtMs - System.currentTimeMillis()
    if (remainingMs <= 0) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Mini sayaç", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val contentIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
      PendingIntent.getActivity(
        ctx,
        0,
        it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
    val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
      // Adaptive launcher ikonu durum çubuğunda blob görünür; modülün kendi
      // monokrom vektörü kullanılır.
      .setSmallIcon(R.drawable.mini_timer_notification_icon)
      .setContentTitle(title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(true)
      // Kronometre SystemUI'da tikler: setWhen(endsAt) + countdown → canlı geri sayım.
      .setWhen(endsAtMs)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      // 0 anında sistem bildirimi kendisi düşürür (API 26+); süreç ölse bile
      // yetim/negatif sayan kalıcı bildirim kalmaz.
      .setTimeoutAfter(remainingMs)
      .apply { contentIntent?.let { setContentIntent(it) } }
      .build()
    runCatching { nm.notify(NOTIFICATION_ID, notification) }
  }

  private fun cancelNotification() {
    val ctx = context ?: return
    (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
      .cancel(NOTIFICATION_ID)
  }

  companion object {
    private const val CHANNEL_ID = "mini-sayac"
    private const val NOTIFICATION_ID = 4242
  }
}
