package com.trainfit.app

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * 震动反馈。用系统预设的震感（点击 / 重击 / 双击 / 滴答），和系统应用的手感一致。
 * kind: tick | tap | start | stop | success | error
 */
class Haptics(private val context: Context) {

    private val vibrator: Vibrator? by lazy {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        } catch (_: Exception) { null }
    }

    fun fire(kind: String) {
        val v = vibrator ?: return
        try {
            if (!v.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= 29) {
                val effect = when (kind) {
                    "tick" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                    "start" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
                    "success" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK)
                    "error" -> VibrationEffect.createWaveform(longArrayOf(0, 45, 70, 45, 70, 45), -1)
                    else -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                }
                v.vibrate(effect)
            } else if (Build.VERSION.SDK_INT >= 26) {
                val effect = when (kind) {
                    "success" -> VibrationEffect.createWaveform(longArrayOf(0, 25, 70, 25), -1)
                    "error" -> VibrationEffect.createWaveform(longArrayOf(0, 45, 70, 45, 70, 45), -1)
                    "tick" -> VibrationEffect.createOneShot(10, VibrationEffect.DEFAULT_AMPLITUDE)
                    "start" -> VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE)
                    else -> VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE)
                }
                v.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(if (kind == "start") 35L else 20L)
            }
        } catch (_: Exception) {
        }
    }
}
