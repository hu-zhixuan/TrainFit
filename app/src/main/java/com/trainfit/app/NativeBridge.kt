package com.trainfit.app

import android.Manifest
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import com.trainfit.app.asr.LocalAsr
import com.trainfit.app.asr.SystemSpeech
import com.trainfit.app.asr.VoiceRecorder
import com.trainfit.app.net.ApiConfig
import com.trainfit.app.net.ApiResult
import com.trainfit.app.net.OpenAiApi
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors

/**
 * 暴露给网页的原生能力（window.TrainFitNative）。这里只做「网页 ↔ 原生」的转接，具体实现在：
 *  - asr/LocalAsr、asr/VoiceRecorder、asr/SystemSpeech：本机识别 / 录音给云端识别 / 手机系统识别
 *  - net/OpenAiApi：调大模型、云端语音转文字
 *  - Haptics：震动；Reminders：通知和提醒
 *
 * 回调约定（都在主线程执行）：
 *  - 系统语音：window.__tfSpeech(type, text)，type = start | partial | final | error | end
 *  - 录音：    window.__tfRec(type, value)，type = start | level | partial | max | error
 *  - 转文字：  window.__tfAsr(requestId, ok, textOrError)
 *  - 大模型：  window.__tfLlm(requestId, ok, payload)，ok=true 时 payload 是接口原始 JSON 字符串
 *  - 通知权限：window.__tfNotifPerm(granted)
 */
class NativeBridge(
    private val activity: ComponentActivity,
    private val evalJs: (String) -> Unit,
    private val requestMicPermission: (onResult: (Boolean) -> Unit) -> Unit,
    private val onSystemBarsLight: (Boolean) -> Unit = {},
    private val requestNotifPermission: (onResult: (Boolean) -> Unit) -> Unit = { it(false) }
) {
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()

    /** 调网页里的回调函数：字符串参数会转成 JS 字符串，其它（布尔值）原样写 */
    private fun callJs(fn: String, vararg args: Any) {
        val list = args.joinToString(", ") { if (it is String) JSONObject.quote(it) else it.toString() }
        val js = "window.$fn && window.$fn($list);"
        main.post { evalJs(js) }
    }

    private fun hasMicPermission() =
        ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    // ================= 系统语音识别（兜底） =================

    private val systemSpeech = SystemSpeech(activity, main) { type, text -> callJs("__tfSpeech", type, text) }

    @JavascriptInterface
    fun isSpeechAvailable(): Boolean = systemSpeech.isAvailable()

    @JavascriptInterface
    fun startListening() {
        main.post {
            if (hasMicPermission()) {
                systemSpeech.start()
            } else {
                requestMicPermission { granted ->
                    if (granted) systemSpeech.start() else {
                        callJs("__tfSpeech", "error", "PERMISSION_DENIED")
                        callJs("__tfSpeech", "end", "")
                    }
                }
            }
        }
    }

    @JavascriptInterface
    fun stopListening() {
        main.post { systemSpeech.stop() }
    }

    @JavascriptInterface
    fun cancelListening() {
        main.post { systemSpeech.cancel() }
    }

    /** App 退到后台时停掉系统语音（主线程调用） */
    fun cancelSystemSpeech() = systemSpeech.cancel()

    // ================= 录音 + 转文字（优先本机识别，其次云端） =================
    //
    // 开始和结束都由用户控制（按住/松开，或点一下/再点一下），停顿不会结束录音。

    // 本机识别：模型随 App 打包，启动后在后台加载
    private val localAsr = LocalAsr(activity.assets).also { asr -> io.execute { asr.init() } }
    @Volatile private var usingLocal = false

    private val recorder = VoiceRecorder(
        onLevel = { lv -> callJs("__tfRec", "level", formatLevel(lv)) },
        onMaxReached = { callJs("__tfRec", "max", "") }
    )

    private fun formatLevel(lv: Float) = String.format(Locale.US, "%.2f", lv)

    private fun asrConfig(overrideJson: String) =
        ApiConfig.resolve(overrideJson, BuildConfig.ASR_BASE_URL, BuildConfig.ASR_API_KEY, BuildConfig.ASR_MODEL)

    @JavascriptInterface
    fun isAsrConfigured(overrideJson: String): Boolean {
        if (!localAsr.failed) return true // 本机识别可用（或正在加载）
        return asrConfig(overrideJson).isComplete
    }

    @JavascriptInterface
    fun getAsrInfo(): String = JSONObject().apply {
        put("baseUrl", BuildConfig.ASR_BASE_URL)
        put("model", BuildConfig.ASR_MODEL)
        put("hasKey", BuildConfig.ASR_API_KEY.isNotBlank())
        put("local", if (localAsr.ready) "ready" else if (localAsr.failed) "failed" else "loading")
    }.toString()

    @JavascriptInterface
    fun startRecording() {
        main.post {
            systemSpeech.cancel() // 别和系统语音抢麦克风
            if (hasMicPermission()) {
                io.execute {
                    usingLocal = !localAsr.failed
                    val ok = if (usingLocal) {
                        localAsr.start(
                            onLevel = { lv -> callJs("__tfRec", "level", formatLevel(lv)) },
                            onPartial = { text -> callJs("__tfRec", "partial", text) },
                            onMax = { callJs("__tfRec", "max", "") }
                        )
                    } else {
                        recorder.start()
                    }
                    if (ok) callJs("__tfRec", "start", if (usingLocal) "local" else "cloud")
                    else callJs("__tfRec", "error", "RECORD_FAILED")
                }
            } else {
                requestMicPermission { granted ->
                    // 第一次授权时用户已经松手了，只提示，不自动开录
                    callJs("__tfRec", "error", if (granted) "PERMISSION_JUST_GRANTED" else "PERMISSION_DENIED")
                }
            }
        }
    }

    @JavascriptInterface
    fun cancelRecording() {
        io.execute { if (usingLocal) localAsr.cancel() else recorder.cancel() }
    }

    /** 停止录音并转文字，结果通过 __tfAsr 回调 */
    @JavascriptInterface
    fun stopRecording(requestId: String, overrideJson: String) {
        io.execute {
            if (usingLocal) {
                // 本机识别：松手时只剩最后一句要识别
                val text = localAsr.stop()
                if (text.isNotBlank()) callJs("__tfAsr", requestId, true, text)
                else callJs("__tfAsr", requestId, false, if (localAsr.ready) "NO_SPEECH" else "LOCAL_NOT_READY")
                return@execute
            }
            val audio = recorder.stop()
            if (audio == null) {
                callJs("__tfAsr", requestId, false, "TOO_SHORT")
                return@execute
            }
            val cfg = asrConfig(overrideJson)
            if (!cfg.isComplete) {
                callJs("__tfAsr", requestId, false, "NO_KEY")
                return@execute
            }
            val r = OpenAiApi.transcribe(cfg, audio)
            callJs("__tfAsr", requestId, r.ok, r.body)
        }
    }

    // ================= 大模型 =================

    @JavascriptInterface
    fun isLlmConfigured(): Boolean = BuildConfig.LLM_API_KEY.isNotBlank()

    @JavascriptInterface
    fun getLlmInfo(): String = JSONObject().apply {
        put("baseUrl", BuildConfig.LLM_BASE_URL)
        put("model", BuildConfig.LLM_MODEL)
        put("hasKey", BuildConfig.LLM_API_KEY.isNotBlank())
    }.toString()

    /**
     * @param bodyJson  chat/completions 请求体（messages 等），model 为空时用默认模型
     * @param overrideJson 可选 {"baseUrl","apiKey","model"}，App 设置里填了就覆盖打包时的默认值
     */
    @JavascriptInterface
    fun llmChat(requestId: String, bodyJson: String, overrideJson: String) {
        io.execute {
            val cfg = ApiConfig.resolve(overrideJson, BuildConfig.LLM_BASE_URL, BuildConfig.LLM_API_KEY, BuildConfig.LLM_MODEL)
            if (!cfg.isComplete) {
                callJs("__tfLlm", requestId, false, "NO_KEY")
                return@execute
            }
            val r = try {
                OpenAiApi.chat(cfg, JSONObject(bodyJson))
            } catch (e: Exception) {
                ApiResult(false, "${e.javaClass.simpleName}: ${e.message.orEmpty()}")
            }
            callJs("__tfLlm", requestId, r.ok, r.body)
        }
    }

    // ================= 震动 =================

    private val haptics = Haptics(activity)

    /** kind: tick | tap | start | stop | success | error */
    @JavascriptInterface
    fun haptic(kind: String) = haptics.fire(kind)

    // ================= 通知 =================

    @JavascriptInterface
    fun notificationsEnabled(): Boolean = Reminders.canNotify(activity)

    @JavascriptInterface
    fun requestNotifications() {
        main.post {
            if (Reminders.canNotify(activity)) {
                evalJs("window.__tfNotifPerm && window.__tfNotifPerm(true);")
            } else {
                requestNotifPermission { granted ->
                    evalJs("window.__tfNotifPerm && window.__tfNotifPerm(${granted && Reminders.canNotify(activity)});")
                }
            }
        }
    }

    /** 后台整理完成时发一条通知 */
    @JavascriptInterface
    fun showNotification(title: String, body: String) {
        Reminders.show(activity, Reminders.CH_DONE, 200, title, body)
    }

    /** [{"id":"lunch","enabled":true,"time":"12:40"}, ...] */
    @JavascriptInterface
    fun setReminders(json: String) {
        io.execute { Reminders.saveReminders(activity, json) }
    }

    /** 今天的状态，提醒时用来判断要不要打扰你 */
    @JavascriptInterface
    fun updateDayState(json: String) {
        Reminders.saveDayState(activity, json)
    }

    // ================= 外观 =================

    /**
     * 系统是否是深色模式。WebView 的 prefers-color-scheme 跟随的是 App 自身主题（深色），
     * 不跟随系统，所以网页的「跟随系统」要问原生。系统切换深浅色时 Activity 会重建，网页会重新读取。
     */
    @JavascriptInterface
    fun isSystemDark(): Boolean {
        val mode = activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mode == Configuration.UI_MODE_NIGHT_YES
    }

    /** 网页切换深浅色时调用，让状态栏和导航栏一起变 */
    @JavascriptInterface
    fun setSystemBarsLight(light: Boolean) {
        main.post { onSystemBarsLight(light) }
    }

    fun shutdown() {
        main.post { systemSpeech.cancel() }
        recorder.cancel()
        localAsr.cancel()
        io.shutdown()
    }
}
