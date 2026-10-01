package com.trainfit.app.net

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.TreeMap
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * 千问 AI 平台的实时语音识别（默认 Qwen-Audio-3.1-ASR-Flash-Message）：按住说话时就把声音一路传上去，
 * 松手发「说完了」，服务器把整段话的文字发回来，所以松手后很快就有结果。
 * 协议是 DashScope 的 inference WebSocket：run-task → 音频（16k 16bit 单声道 PCM 二进制帧）→ finish-task，
 * 收 result-generated…task-finished / task-failed。参数照 BiBi-Keyboard 的 buildDashRecognitionParam。
 * 连不上、出错、超时都只是拿不到结果（await 返回 null），由调用方退回本机识别。
 */
class QianwenStream(
    private val cfg: ApiConfig,
    private val model: String,
    private val onText: ((String) -> Unit)? = null // 边说边出的字（本机模型还没下好时显示云端的）
) {
    private val taskId = UUID.randomUUID().toString().replace("-", "")
    private val lock = Any()
    private val early = ArrayList<ByteString>() // 连上之前说的话先攒着（最多 60 秒）
    private var started = false
    private var finishWanted = false
    @Volatile private var ws: WebSocket? = null
    private val done = CountDownLatch(1)
    private val finals = TreeMap<Long, String>() // 说完的句子，按开始时间排
    @Volatile private var partial = ""
    @Volatile var error: String? = null
        private set

    fun open() {
        val req = Request.Builder()
            .url(Qianwen.wsUrl(cfg))
            .header("Authorization", "Bearer ${cfg.apiKey}")
            .build()
        ws = client.newWebSocket(req, listener)
    }

    /** 录音线程里调用：100ms 一块 */
    fun feed(chunk: ShortArray, n: Int) {
        if (done.count == 0L || n <= 0) return
        val b = ByteArray(n * 2)
        for (i in 0 until n) {
            val v = chunk[i].toInt()
            b[2 * i] = (v and 0xff).toByte()
            b[2 * i + 1] = ((v shr 8) and 0xff).toByte()
        }
        val bs = b.toByteString()
        synchronized(lock) {
            if (!started) {
                if (early.size < 600) early.add(bs)
                return
            }
        }
        ws?.send(bs)
    }

    /** 松手（录音已经停了）：告诉服务器说完了；还没连上就等连上以后再发 */
    fun finish() {
        synchronized(lock) {
            finishWanted = true
            if (!started) return
        }
        sendFinish()
    }

    /** 等结果，最多等到 deadline（毫秒时间戳）；没拿到返回 null */
    fun await(deadline: Long): String? {
        val wait = deadline - System.currentTimeMillis()
        if (wait > 0) try { done.await(wait, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) {}
        val finished = done.count == 0L && error == null
        if (!finished && error == null) error = "TIMEOUT"
        cancel()
        if (!finished) return null
        val text = (finals.values + partial).joinToString("").trim()
        return OpenAiApi.cleanAsrText(text).ifBlank { null }
    }

    fun cancel() {
        try { ws?.cancel() } catch (_: Exception) {}
        ws = null
        done.countDown()
    }

    private fun sendFinish() {
        val msg = JSONObject()
            .put("header", JSONObject().put("action", "finish-task").put("task_id", taskId).put("streaming", "duplex"))
            .put("payload", JSONObject().put("input", JSONObject()))
        ws?.send(msg.toString())
    }

    private fun runTask(): String {
        val params = JSONObject()
            .put("format", "pcm")
            .put("sample_rate", 16000)
            .put("semantic_punctuation_enabled", true)
            .put("heartbeat", true)
            .put("keep_dialect", false)
            .put("intermediate_result_enabled", true)
            .put("disfluency_removal_enabled", true) // 去掉「呃、那个、就是」
        return JSONObject()
            .put("header", JSONObject().put("action", "run-task").put("task_id", taskId).put("streaming", "duplex"))
            .put("payload", JSONObject()
                .put("task_group", "audio").put("task", "asr").put("function", "recognition")
                .put("model", model)
                .put("parameters", params)
                .put("input", JSONObject()))
            .toString()
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send(runTask())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val obj = try { JSONObject(text) } catch (_: Exception) { return }
            val header = obj.optJSONObject("header") ?: return
            when (header.optString("event")) {
                "task-started" -> {
                    val sendFinishNow: Boolean
                    synchronized(lock) {
                        early.forEach { webSocket.send(it) }
                        early.clear()
                        started = true
                        sendFinishNow = finishWanted
                    }
                    if (sendFinishNow) sendFinish()
                }
                "result-generated" -> {
                    val s = obj.optJSONObject("payload")?.optJSONObject("output")?.optJSONObject("sentence") ?: return
                    val t = s.optString("text").trim()
                    if (s.optBoolean("sentence_end", false)) {
                        if (t.isNotEmpty()) synchronized(finals) { finals[s.optLong("begin_time", finals.size.toLong())] = t }
                        partial = ""
                    } else if (t.isNotEmpty()) {
                        partial = t
                    }
                    onText?.let { cb ->
                        val now = synchronized(finals) { finals.values.joinToString("") } + partial
                        if (now.isNotBlank()) cb(now.trim())
                    }
                }
                "task-finished" -> done.countDown()
                "task-failed" -> {
                    error = "${header.optString("error_code")}: ${header.optString("error_message")}".take(200)
                    done.countDown()
                }
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (done.count == 0L) return
            error = if (response != null) "HTTP ${response.code} ${response.message}" else "${t.javaClass.simpleName}: ${t.message.orEmpty()}"
            done.countDown()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (done.count == 0L) return
            error = "CLOSED $code $reason"
            done.countDown()
        }
    }

    companion object {
        private val client: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(3, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS)
                .build()
        }
    }
}
