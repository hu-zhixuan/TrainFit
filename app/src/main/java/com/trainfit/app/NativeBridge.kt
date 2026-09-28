package com.trainfit.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * 暴露给网页的原生能力（window.TrainFitNative）：
 *  1. 系统语音识别（WebView 里没有 Web Speech API，只能走原生 SpeechRecognizer）
 *  2. 调用 OpenAI 兼容的 /chat/completions 接口（原生发请求，没有 CORS 问题，key 不进 JS 源码）
 *
 * 回调约定：
 *  - 语音：window.__tfSpeech(type, text)，type = start | partial | final | error | end
 *  - LLM：window.__tfLlm(requestId, ok, payload)，ok=true 时 payload 是接口原始 JSON 字符串
 */
class NativeBridge(
    private val activity: ComponentActivity,
    private val evalJs: (String) -> Unit,
    private val requestMicPermission: (onResult: (Boolean) -> Unit) -> Unit,
    private val onSystemBarsLight: (Boolean) -> Unit = {}
) {
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()

    // ---------- 语音识别状态 ----------
    private var recognizer: SpeechRecognizer? = null
    private var wantListening = false   // 用户是否还希望继续听（按住中 / 点击录音中）
    private var sessionActive = false   // 识别器当前是否有一轮在跑
    private var finished = true         // 本次录音是否已经回调过 final/end
    private val committed = StringBuilder()
    private var lastPartial = ""

    // ================= 语音 =================

    @JavascriptInterface
    fun isSpeechAvailable(): Boolean {
        if (SpeechRecognizer.isRecognitionAvailable(activity)) return true
        return Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)
    }

    @JavascriptInterface
    fun startListening() {
        main.post {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED
            ) {
                beginListening()
            } else {
                requestMicPermission { granted ->
                    if (granted) beginListening() else {
                        emitSpeech("error", "PERMISSION_DENIED")
                        emitSpeech("end", "")
                    }
                }
            }
        }
    }

    @JavascriptInterface
    fun stopListening() {
        main.post {
            if (finished) return@post
            wantListening = false
            if (sessionActive) {
                recognizer?.stopListening()
                // 兜底：个别 ROM 停止后不回调 onResults
                main.postDelayed({ if (!finished) { commitPartial(); finish() } }, 2500)
            } else {
                commitPartial()
                finish()
            }
        }
    }

    @JavascriptInterface
    fun cancelListening() {
        main.post { cancelInternal() }
    }

    fun cancelInternal() {
        if (finished) return
        wantListening = false
        finished = true
        sessionActive = false
        try { recognizer?.cancel() } catch (_: Exception) {}
        destroyRecognizer()
        emitSpeech("end", "canceled")
    }

    private fun beginListening() {
        if (!finished) cancelInternal()
        if (!isSpeechAvailable()) {
            emitSpeech("error", "NOT_AVAILABLE")
            emitSpeech("end", "")
            return
        }
        committed.setLength(0)
        lastPartial = ""
        finished = false
        wantListening = true
        createRecognizer()
        emitSpeech("start", "")
        startSession()
    }

    private fun createRecognizer() {
        destroyRecognizer()
        val r = if (SpeechRecognizer.isRecognitionAvailable(activity)) {
            SpeechRecognizer.createSpeechRecognizer(activity)
        } else if (Build.VERSION.SDK_INT >= 31) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(activity)
        } else {
            SpeechRecognizer.createSpeechRecognizer(activity)
        }
        r.setRecognitionListener(listener)
        recognizer = r
    }

    private fun destroyRecognizer() {
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
    }

    private fun startSession() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            // 尽量允许中途停顿（多数引擎只当作建议值）
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 10000L)
        }
        sessionActive = true
        try {
            recognizer?.startListening(intent)
        } catch (e: Exception) {
            sessionActive = false
            wantListening = false
            emitSpeech("error", "START_FAILED")
            finish()
        }
    }

    private fun combined(): String {
        val sb = StringBuilder(committed)
        if (lastPartial.isNotBlank()) {
            if (sb.isNotEmpty()) sb.append('，')
            sb.append(lastPartial)
        }
        return sb.toString()
    }

    private fun commitPartial() {
        if (lastPartial.isNotBlank()) {
            if (committed.isNotEmpty()) committed.append('，')
            committed.append(lastPartial.trim())
        }
        lastPartial = ""
    }

    private fun finish() {
        if (finished) return
        finished = true
        wantListening = false
        sessionActive = false
        destroyRecognizer()
        emitSpeech("final", committed.toString())
        emitSpeech("end", "")
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            if (finished) return
            val text = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull().orEmpty()
            if (text.isNotBlank()) {
                lastPartial = text
                emitSpeech("partial", combined())
            }
        }

        override fun onResults(results: Bundle?) {
            if (finished) return
            sessionActive = false
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull().orEmpty()
            lastPartial = text.ifBlank { lastPartial }
            commitPartial()
            if (wantListening) {
                // 用户还在说：引擎因为停顿自动断句了，接着听
                emitSpeech("partial", combined())
                startSession()
            } else {
                finish()
            }
        }

        override fun onError(error: Int) {
            if (finished) return
            sessionActive = false
            commitPartial()
            val silent = error == SpeechRecognizer.ERROR_NO_MATCH ||
                error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
            if (wantListening && silent) {
                // 停顿太久没声音：继续等用户说
                main.postDelayed({ if (wantListening && !finished) startSession() }, 150)
                return
            }
            if (wantListening && committed.isEmpty()) {
                emitSpeech("error", errorName(error))
            }
            finish()
        }
    }

    private fun errorName(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "NETWORK"
        SpeechRecognizer.ERROR_AUDIO -> "AUDIO"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "PERMISSION_DENIED"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "BUSY"
        SpeechRecognizer.ERROR_SERVER -> "SERVER"
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "NO_SPEECH"
        else -> "ERROR_$code"
    }

    private fun emitSpeech(type: String, text: String) {
        val js = "window.__tfSpeech && window.__tfSpeech(${JSONObject.quote(type)}, ${JSONObject.quote(text)});"
        main.post { evalJs(js) }
    }

    // ================= 外观 =================

    /**
     * 系统是否是深色模式。WebView 的 prefers-color-scheme 跟随的是 App 自身主题（深色），
     * 不跟随系统，所以网页的「跟随系统」要问原生。系统切换深浅色时 Activity 会重建，网页会重新读取。
     */
    @JavascriptInterface
    fun isSystemDark(): Boolean {
        val mode = activity.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK
        return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES
    }

    /** 网页切换深浅色时调用，让状态栏和导航栏一起变 */
    @JavascriptInterface
    fun setSystemBarsLight(light: Boolean) {
        main.post { onSystemBarsLight(light) }
    }

    // ================= 自己录音 + 语音转文字（OpenAI 兼容 /audio/transcriptions） =================
    //
    // 开始和结束都由用户控制（按住/松开，或点一下/再点一下），不做静音检测。
    // 回调：window.__tfRec(type, value)  type = start | level | max | error
    //      window.__tfAsr(requestId, ok, textOrError)

    private val recorder = VoiceRecorder(
        onLevel = { lv -> emitRec("level", String.format(java.util.Locale.US, "%.2f", lv)) },
        onMaxReached = { emitRec("max", "") }
    )

    private fun asrConfig(overrideJson: String): Triple<String, String, String> {
        val ov = try { JSONObject(overrideJson) } catch (_: Exception) { null }
        val base = ov?.optString("baseUrl").orEmpty().ifBlank { BuildConfig.ASR_BASE_URL }.trim().trimEnd('/')
        val key = ov?.optString("apiKey").orEmpty().ifBlank { BuildConfig.ASR_API_KEY }.trim()
        val model = ov?.optString("model").orEmpty().ifBlank { BuildConfig.ASR_MODEL }.trim()
        return Triple(base, key, model)
    }

    @JavascriptInterface
    fun isAsrConfigured(overrideJson: String): Boolean {
        val (base, key, _) = asrConfig(overrideJson)
        return base.isNotBlank() && key.isNotBlank()
    }

    @JavascriptInterface
    fun getAsrInfo(): String = JSONObject().apply {
        put("baseUrl", BuildConfig.ASR_BASE_URL)
        put("model", BuildConfig.ASR_MODEL)
        put("hasKey", BuildConfig.ASR_API_KEY.isNotBlank())
    }.toString()

    @JavascriptInterface
    fun startRecording() {
        main.post {
            cancelInternal() // 别和系统语音抢麦克风
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED
            ) {
                io.execute { if (recorder.start()) emitRec("start", "") else emitRec("error", "RECORD_FAILED") }
            } else {
                requestMicPermission { granted ->
                    // 第一次授权时用户已经松手了，只提示，不自动开录
                    emitRec("error", if (granted) "PERMISSION_JUST_GRANTED" else "PERMISSION_DENIED")
                }
            }
        }
    }

    @JavascriptInterface
    fun cancelRecording() {
        io.execute { recorder.cancel() }
    }

    /** 停止录音并转文字，结果通过 __tfAsr 回调 */
    @JavascriptInterface
    fun stopRecording(requestId: String, overrideJson: String) {
        io.execute {
            val audio = recorder.stop()
            if (audio == null) {
                replyAsr(requestId, false, "TOO_SHORT")
                return@execute
            }
            val (base, key, model) = asrConfig(overrideJson)
            if (base.isBlank() || key.isBlank()) {
                replyAsr(requestId, false, "NO_KEY")
                return@execute
            }
            var lastError = ""
            for (attempt in 0 until 2) {  // 网络抖动时再试一次
                try {
                    val boundary = "----TrainFit" + System.currentTimeMillis()
                    val out = java.io.ByteArrayOutputStream()
                    out.write("--$boundary\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n$model\r\n".toByteArray(Charsets.UTF_8))
                    out.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n".toByteArray(Charsets.UTF_8))
                    out.write(audio)
                    out.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
                    val body = out.toByteArray()

                    val conn = (URL("$base/audio/transcriptions").openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 10000
                        readTimeout = 30000
                        doOutput = true
                        setFixedLengthStreamingMode(body.size)
                        setRequestProperty("Authorization", "Bearer $key")
                        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                        setRequestProperty("Accept", "application/json")
                    }
                    conn.outputStream.use { it.write(body) }
                    val code = conn.responseCode
                    val ok = code in 200..299
                    val text = (if (ok) conn.inputStream else conn.errorStream)
                        ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    conn.disconnect()
                    if (ok) {
                        val said = try { JSONObject(text).optString("text") } catch (_: Exception) { text }
                        replyAsr(requestId, true, said.trim())
                        return@execute
                    }
                    lastError = "HTTP $code ${text.take(200)}"
                    if (code in 400..499 && code != 429) break
                } catch (e: Exception) {
                    lastError = "${e.javaClass.simpleName}: ${e.message.orEmpty()}"
                }
            }
            replyAsr(requestId, false, lastError)
        }
    }

    private fun emitRec(type: String, value: String) {
        val js = "window.__tfRec && window.__tfRec(${JSONObject.quote(type)}, ${JSONObject.quote(value)});"
        main.post { evalJs(js) }
    }

    private fun replyAsr(requestId: String, ok: Boolean, payload: String) {
        val js = "window.__tfAsr && window.__tfAsr(${JSONObject.quote(requestId)}, $ok, ${JSONObject.quote(payload)});"
        main.post { evalJs(js) }
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
            try {
                val ov = try { JSONObject(overrideJson) } catch (_: Exception) { null }
                val base = (ov?.optString("baseUrl").orEmpty().ifBlank { BuildConfig.LLM_BASE_URL })
                    .trim().trimEnd('/')
                val key = ov?.optString("apiKey").orEmpty().ifBlank { BuildConfig.LLM_API_KEY }.trim()
                val model = ov?.optString("model").orEmpty().ifBlank { BuildConfig.LLM_MODEL }.trim()
                if (key.isBlank() || base.isBlank()) {
                    replyLlm(requestId, false, "NO_KEY")
                    return@execute
                }
                val body = JSONObject(bodyJson)
                if (body.optString("model").isBlank()) body.put("model", model)

                val conn = (URL("$base/chat/completions").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 60000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Authorization", "Bearer $key")
                }
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                val ok = code in 200..299
                val stream = if (ok) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                conn.disconnect()
                replyLlm(requestId, ok, if (ok) text else "HTTP $code ${text.take(300)}")
            } catch (e: Exception) {
                replyLlm(requestId, false, "${e.javaClass.simpleName}: ${e.message.orEmpty()}")
            }
        }
    }

    private fun replyLlm(requestId: String, ok: Boolean, payload: String) {
        val js = "window.__tfLlm && window.__tfLlm(${JSONObject.quote(requestId)}, $ok, ${JSONObject.quote(payload)});"
        main.post { evalJs(js) }
    }

    fun shutdown() {
        main.post { cancelInternal() }
        recorder.cancel()
        io.shutdown()
    }
}
