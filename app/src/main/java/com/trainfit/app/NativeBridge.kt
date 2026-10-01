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
import com.trainfit.app.asr.ModelDownloader
import com.trainfit.app.asr.SystemSpeech
import com.trainfit.app.asr.VoiceRecorder
import com.trainfit.app.net.ApiConfig
import com.trainfit.app.net.ApiResult
import com.trainfit.app.net.OpenAiApi
import com.trainfit.app.net.Qianwen
import com.trainfit.app.net.QianwenStream
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
 *  - 选文件 / 一键找回：window.__tfFile(ok, textOrError)，失败时 textOrError = CANCEL | NO_BACKUP | READ_FAILED
 *  - 别的 App 打开过来的文件：window.__tfOpenedFile()，网页再调 takeOpenedFile() 取内容
 */
class NativeBridge(
    private val activity: ComponentActivity,
    private val evalJs: (String) -> Unit,
    private val requestMicPermission: (onResult: (Boolean) -> Unit) -> Unit,
    private val onSystemBarsLight: (Boolean) -> Unit = {},
    private val requestNotifPermission: (onResult: (Boolean) -> Unit) -> Unit = { it(false) },
    private val pickDocument: (onResult: (android.net.Uri?) -> Unit) -> Unit = { it(null) },
    private val pickFolder: (onResult: (android.net.Uri?) -> Unit) -> Unit = { it(null) }
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

    // 本机识别：模型第一次打开时在后台下载（239MB，不打进安装包），下好后加载
    private val localAsr = LocalAsr(activity.assets, ModelDownloader.dir(activity))
    private val modelDl = ModelDownloader(activity) { io.execute { localAsr.init() } }

    init {
        io.execute {
            localAsr.init()
            if (localAsr.missing) {
                modelDl.watchNetwork()
                modelDl.start()
            }
        }
    }

    /** 回到前台：模型没下完就接着下（连着 Wi-Fi 的话） */
    fun onAppResume() {
        if (localAsr.missing) modelDl.start()
    }

    /** 设置里点「用流量下载」「重试」 */
    @JavascriptInterface
    fun downloadAsrModel() = modelDl.start(userAsked = true)
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
        if (!localAsr.failed && !localAsr.missing) return true // 本机识别可用（或正在加载）
        return asrConfig(overrideJson).isComplete // 本机用不了 / 模型还没下好：靠云端
    }

    @JavascriptInterface
    fun getAsrInfo(): String = JSONObject().apply {
        val def = asrConfig("{}")
        val qw = def.isComplete && Qianwen.matches(def)
        put("baseUrl", if (qw) Qianwen.endpoint(def).substringBefore("/services/") else BuildConfig.ASR_BASE_URL)
        put("model", if (qw) Qianwen.model(def) else BuildConfig.ASR_MODEL)
        put("hasKey", BuildConfig.ASR_API_KEY.isNotBlank())
        put("local", if (localAsr.ready) "ready" else if (localAsr.failed) "failed" else if (localAsr.missing) "missing" else "loading")
        put("dl", modelDl.state)
        put("dlDone", modelDl.done())
        put("dlTotal", ModelDownloader.TOTAL)
        put("dlError", modelDl.error)
        put("cloud", cloudStatus)
    }.toString()

    // 松手后用云端大模型再认一遍：上次的结果（设置里显示），接口用不了时先歇一会儿
    @Volatile private var cloudStatus = ""
    @Volatile private var cloudPausedUntil = 0L
    @Volatile private var cloudPausedFor = "" // 哪个接口 + key 在歇着：设置里换了 key 就马上再试

    private fun cloudWho(cfg: ApiConfig) = cfg.baseUrl + " " + cfg.apiKey
    private fun cloudPaused(cfg: ApiConfig) = cloudWho(cfg) == cloudPausedFor && System.currentTimeMillis() < cloudPausedUntil

    /** 余额不足 / 免费额度用完、key 不对：半小时内别再试，免得每次都白等；其它（没网、超时）下次照试 */
    private fun noteCloudFailure(cfg: ApiConfig, err: String) {
        cloudStatus = err
        if (Regex("^HTTP 4(01|02|03)|Arrearage|FreeTierOnly|InvalidApiKey|AccessDenied").containsMatchIn(err)) {
            cloudPausedFor = cloudWho(cfg)
            cloudPausedUntil = System.currentTimeMillis() + 30 * 60_000L
        }
    }

    /** 联网就把刚才那段话交给云端大模型再认一遍，认出来就用它的；没联网、没余额、超时返回 null（用本机的） */
    private fun cloudFinal(local: String, overrideJson: String): String? {
        if (local.isBlank() && localAsr.ready) return null // 本机认过了、确实没说话
        val cfg = asrConfig(overrideJson)
        if (!cfg.isComplete || cloudPaused(cfg)) return null
        val wav = localAsr.lastWav() ?: return null
        val r = OpenAiApi.transcribe(cfg, wav, quick = true)
        if (r.ok && r.body.isNotBlank()) {
            cloudStatus = "ok"
            return r.body
        }
        noteCloudFailure(cfg, r.body)
        return null
    }

    // 千问的实时识别（Qwen-Audio-3.1-ASR-Message）：按住时开始边说边传，松手后等它的结果
    @Volatile private var cloudStream: QianwenStream? = null

    private fun openCloudStream(overrideJson: String): QianwenStream? {
        val cfg = asrConfig(overrideJson)
        if (!cfg.isComplete || !Qianwen.matches(cfg) || cloudPaused(cfg)) return null
        val model = Qianwen.model(cfg)
        if (!Qianwen.isStreaming(model)) return null
        // 本机模型还没下好：边说边出的字用云端给的
        val onText = { t: String -> if (!localAsr.ready) callJs("__tfRec", "partial", t) }
        return try { QianwenStream(cfg, model, onText).also { it.open() } } catch (_: Exception) { null }
    }

    /** 松手后最多等到 deadline；拿不到返回 null（用本机的） */
    private fun streamResult(cs: QianwenStream, deadline: Long, overrideJson: String): String? {
        val r = cs.await(deadline)
        val err = cs.error
        if (err == null) {
            cloudStatus = "ok"
            return r
        }
        noteCloudFailure(asrConfig(overrideJson), err)
        return null
    }

    @JavascriptInterface
    fun startRecording() {
        startRecording("{}")
    }

    /** overrideJson：设置里填的语音识别接口（实时识别按住时就要连上） */
    @JavascriptInterface
    fun startRecording(overrideJson: String) {
        main.post {
            systemSpeech.cancel() // 别和系统语音抢麦克风
            if (hasMicPermission()) {
                io.execute {
                    usingLocal = !localAsr.failed
                    cloudStream?.cancel()
                    val cs = if (usingLocal) openCloudStream(overrideJson) else null
                    cloudStream = cs
                    val ok = if (usingLocal) {
                        localAsr.start(
                            onLevel = { lv -> callJs("__tfRec", "level", formatLevel(lv)) },
                            onPartial = { text -> callJs("__tfRec", "partial", text) },
                            onMax = { callJs("__tfRec", "max", "") },
                            onAudio = cs?.let { s -> { buf: ShortArray, n: Int -> s.feed(buf, n) } }
                        )
                    } else {
                        recorder.start()
                    }
                    if (!ok) {
                        cs?.cancel()
                        cloudStream = null
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
        io.execute {
            cloudStream?.cancel()
            cloudStream = null
            if (usingLocal) localAsr.cancel() else recorder.cancel()
        }
    }

    /** 停止录音并转文字，结果通过 __tfAsr 回调 */
    @JavascriptInterface
    fun stopRecording(requestId: String, overrideJson: String) {
        io.execute {
            if (usingLocal) {
                // 本机识别：松手后把整段话再识别一遍（几百毫秒到一两秒）。
                // 千问实时识别：录音一停就告诉它说完了，本机整段再认的同时等它，5 秒内回来就用它的；
                // 别的云端接口：本机认完再把这段话交给它认一遍
                val releasedAt = System.currentTimeMillis()
                val cs = cloudStream
                cloudStream = null
                val local = localAsr.stop { cs?.finish() }
                val cloud = if (cs != null) streamResult(cs, releasedAt + 5000, overrideJson) else cloudFinal(local, overrideJson)
                val text = cloud?.takeIf { it.isNotBlank() } ?: local
                if (text.isNotBlank()) callJs("__tfAsr", requestId, true, text)
                else callJs("__tfAsr", requestId, false, if (localAsr.ready) "NO_SPEECH" else if (localAsr.missing) "MODEL_MISSING" else "LOCAL_NOT_READY")
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

    /** 流式：边出字边回调 window.__tfLlmDelta(id, 这段字)，最后和 llmChat 一样回调 __tfLlm */
    @JavascriptInterface
    fun llmChatStream(requestId: String, bodyJson: String, overrideJson: String) {
        io.execute {
            val cfg = ApiConfig.resolve(overrideJson, BuildConfig.LLM_BASE_URL, BuildConfig.LLM_API_KEY, BuildConfig.LLM_MODEL)
            if (!cfg.isComplete) {
                callJs("__tfLlm", requestId, false, "NO_KEY")
                return@execute
            }
            val r = try {
                OpenAiApi.chatStream(cfg, JSONObject(bodyJson)) { piece -> callJs("__tfLlmDelta", requestId, piece) }
            } catch (e: Exception) {
                ApiResult(false, "${e.javaClass.simpleName}: ${e.message.orEmpty()}")
            }
            callJs("__tfLlm", requestId, r.ok, r.body)
        }
    }

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

    /** 网页的音效：手机静音 / 震动模式时不响 */
    @JavascriptInterface
    fun soundAllowed(): Boolean = try {
        val am = activity.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
        am.ringerMode == android.media.AudioManager.RINGER_MODE_NORMAL
    } catch (e: Exception) {
        true
    }

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

    // ================= 备份和分享（见 FileShare） =================

    /** 把一段文字存成文件交给系统分享面板（备份文件发到微信、网盘） */
    @JavascriptInterface
    fun shareFile(name: String, mime: String, text: String) {
        io.execute {
            try {
                FileShare.shareText(activity, name, mime, text, "发送备份")
            } catch (e: Exception) {
                callJs("__tfToast", "没发出去：" + (e.message ?: "未知错误"))
            }
        }
    }

    /** 分享图片（base64 的 PNG） */
    @JavascriptInterface
    fun shareImage(name: String, base64Png: String) {
        io.execute {
            try {
                FileShare.shareImage(activity, name, base64Png, "分享")
            } catch (e: Exception) {
                callJs("__tfToast", "没分享出去：" + (e.message ?: "未知错误"))
            }
        }
    }

    /** 存到「下载/练食AI/」，返回位置；Android 9 及以下或失败返回 "" */
    @JavascriptInterface
    fun saveToDownloads(name: String, mime: String, text: String): String = FileShare.saveToDownloads(activity, name, mime, text)

    /** 存到相册，返回位置；Android 9 及以下或失败返回 "" */
    @JavascriptInterface
    fun saveImage(name: String, base64Png: String): String = FileShare.saveImageToGallery(activity, name, base64Png)

    /** 让用户选一个文件（从备份恢复），读出来交给 window.__tfFile(ok, text) */
    @JavascriptInterface
    fun pickFile() {
        main.post {
            pickDocument { uri ->
                if (uri == null) {
                    callJs("__tfFile", false, "CANCEL")
                } else {
                    io.execute {
                        val text = FileShare.readText(activity, uri)
                        if (text == null) callJs("__tfFile", false, "READ_FAILED") else callJs("__tfFile", true, text)
                    }
                }
            }
        }
    }

    /** 一键找回：用户授权「下载/练食AI」文件夹后，找记录最多的那份备份交给 window.__tfFile(ok, text) */
    @JavascriptInterface
    fun restoreFromFolder() {
        main.post {
            pickFolder { tree ->
                if (tree == null) {
                    callJs("__tfFile", false, "CANCEL")
                } else {
                    io.execute {
                        try {
                            FileShare.rememberTree(activity, tree)
                            val text = FileShare.readBestBackup(activity, tree)
                            if (text == null) callJs("__tfFile", false, "NO_BACKUP") else callJs("__tfFile", true, text)
                        } catch (e: Exception) {
                            callJs("__tfFile", false, "READ_FAILED")
                        }
                    }
                }
            }
        }
    }

    @Volatile
    private var openedText: String? = null

    /** 微信里点备份文件 →「用其他应用打开」→ 练食AI：先读出来放着，网页准备好了来取 */
    fun openedFile(uri: android.net.Uri) {
        io.execute {
            val text = FileShare.readText(activity, uri)
            if (text != null) {
                openedText = text
                callJs("__tfOpenedFile")
            }
        }
    }

    /** 取走别的 App 打开过来的文件内容（取一次就清掉）；没有返回 "" */
    @JavascriptInterface
    fun takeOpenedFile(): String {
        val t = openedText ?: ""
        openedText = null
        return t
    }

    fun shutdown() {
        main.post { systemSpeech.cancel() }
        recorder.cancel()
        localAsr.cancel()
        io.shutdown()
    }
}
