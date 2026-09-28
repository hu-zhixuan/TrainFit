package com.trainfit.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * 通知：
 *  - 「整理完成」：App 在后台时，语音记录整理好了发一条
 *  - 定时提醒：午餐 / 晚餐（这一餐已经记了就不提醒）、晚间小结（今天还能吃多少、蛋白还差多少）
 * 网页通过 NativeBridge 把提醒设置和「今天的状态」存进 SharedPreferences，闹钟响时在这里判断要不要提醒。
 */
object Reminders {
    private const val PREFS = "trainfit_reminders"
    private const val KEY_REMINDERS = "reminders"
    private const val KEY_DAY = "day_state"
    const val CH_REMIND = "remind"
    const val CH_DONE = "done"
    private const val EXTRA_ID = "rid"

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CH_REMIND, "记录提醒", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "午餐、晚餐和晚间小结提醒"
        })
        nm.createNotificationChannel(NotificationChannel(CH_DONE, "整理完成", NotificationManager.IMPORTANCE_LOW).apply {
            description = "在后台时，语音记录整理好了通知你"
        })
    }

    fun canNotify(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    private fun openAppIntent(ctx: Context, code: Int): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun show(ctx: Context, channel: String, id: Int, title: String, body: String) {
        if (!canNotify(ctx)) return
        ensureChannels(ctx)
        val n = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_trainfit)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(ctx, id))
            .setPriority(if (channel == CH_DONE) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(id, n)
        } catch (_: SecurityException) {
        }
    }

    // ---------------- 设置 ----------------
    /** [{"id":"lunch","enabled":true,"time":"12:40"}, ...] */
    fun saveReminders(ctx: Context, json: String) {
        prefs(ctx).edit().putString(KEY_REMINDERS, json).apply()
        scheduleAll(ctx)
    }

    fun loadReminders(ctx: Context): JSONArray =
        try { JSONArray(prefs(ctx).getString(KEY_REMINDERS, "[]")) } catch (_: Exception) { JSONArray() }

    /** {"date":"2026-09-28","meals":["早餐","午餐"],"count":3,"remaining":812,"proteinLeft":40} */
    fun saveDayState(ctx: Context, json: String) {
        prefs(ctx).edit().putString(KEY_DAY, json).apply()
    }

    // ---------------- 闹钟 ----------------
    private fun alarmIntent(ctx: Context, id: String, requestCode: Int): PendingIntent {
        val i = Intent(ctx, ReminderReceiver::class.java).apply {
            action = "com.trainfit.app.REMIND.$id"
            putExtra(EXTRA_ID, id)
        }
        return PendingIntent.getBroadcast(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun code(id: String) = 7000 + (id.hashCode() and 0xfff)

    fun scheduleAll(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val list = loadReminders(ctx)
        for (i in 0 until list.length()) {
            val r = list.optJSONObject(i) ?: continue
            val id = r.optString("id")
            if (id.isBlank()) continue
            val pi = alarmIntent(ctx, id, code(id))
            am.cancel(pi)
            if (!r.optBoolean("enabled")) continue
            val at = nextTrigger(r.optString("time", "12:00"))
            // 非精确闹钟（10 分钟窗口），不需要「精确闹钟」权限，也更省电
            am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * 60 * 1000L, pi)
        }
    }

    private fun nextTrigger(hhmm: String): Long {
        val parts = hhmm.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 12
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val c = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, h)
            set(Calendar.MINUTE, m)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (c.timeInMillis <= System.currentTimeMillis() + 30_000) c.add(Calendar.DAY_OF_YEAR, 1)
        return c.timeInMillis
    }

    fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /** 闹钟响了：看今天的状态决定要不要提醒 */
    fun onAlarm(ctx: Context, id: String) {
        val state = try { JSONObject(prefs(ctx).getString(KEY_DAY, "{}")) } catch (_: Exception) { JSONObject() }
        val isToday = state.optString("date") == today()
        val meals = state.optJSONArray("meals")
        val hasMeal = { name: String ->
            var found = false
            if (isToday && meals != null) for (i in 0 until meals.length()) if (meals.optString(i) == name) found = true
            found
        }
        when (id) {
            "lunch" -> if (!hasMeal("午餐")) show(ctx, CH_REMIND, 101, "午饭吃了吗？", "打开练食AI，按住说一句就记好了")
            "dinner" -> if (!hasMeal("晚餐")) show(ctx, CH_REMIND, 102, "晚饭记了吗？", "按住说一句，比如「晚上一碗牛肉面加个卤蛋」")
            "night" -> {
                val count = if (isToday) state.optInt("count", 0) else 0
                if (count == 0) {
                    show(ctx, CH_REMIND, 103, "今天还没有记录", "睡前花 10 秒补一下今天吃了什么、练了什么？")
                } else {
                    val remaining = state.optInt("remaining", 0)
                    val proteinLeft = state.optInt("proteinLeft", 0)
                    val a = if (remaining >= 0) "今天还能吃 $remaining 千卡" else "今天超出 ${-remaining} 千卡"
                    val b = if (proteinLeft > 0) "，蛋白质还差 ${proteinLeft}g" else "，蛋白质达标了 💪"
                    show(ctx, CH_REMIND, 103, "今日小结", a + b)
                }
            }
        }
        scheduleAll(ctx) // 排好明天的
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("rid") ?: return
        Reminders.onAlarm(context.applicationContext, id)
    }
}

/** 开机、更新 App、改时间后，重新排好提醒 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Reminders.scheduleAll(context.applicationContext)
    }
}
