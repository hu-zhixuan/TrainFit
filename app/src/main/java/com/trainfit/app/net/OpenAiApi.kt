package com.trainfit.app.net

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/** 接口地址、key 和模型：设置里填了就用设置里的，否则用编译时注入的默认值 */
data class ApiConfig(val baseUrl: String, val apiKey: String, val model: String) {
    val isComplete: Boolean get() = baseUrl.isNotBlank() && apiKey.isNotBlank()

    companion object {
        /** @param overrideJson 网页传来的 {"baseUrl","apiKey","model"}，空的字段用默认值 */
        fun resolve(overrideJson: String?, defBase: String, defKey: String, defModel: String): ApiConfig {
            val ov = try { JSONObject(overrideJson ?: "") } catch (_: Exception) { null }
            return ApiConfig(
                baseUrl = ov?.optString("baseUrl").orEmpty().ifBlank { defBase }.trim().trimEnd('/'),
                apiKey = ov?.optString("apiKey").orEmpty().ifBlank { defKey }.trim(),
                model = ov?.optString("model").orEmpty().ifBlank { defModel }.trim(),
            )
        }
    }
}

/** ok=true 时 body 是接口原始返回；ok=false 时是给网页看的错误说明 */
data class ApiResult(val ok: Boolean, val body: String)

/**
 * OpenAI 兼容接口：/chat/completions（大模型）和 /audio/transcriptions（云端语音转文字）。
 * 都是阻塞调用，要在后台线程里用。原生发请求没有 CORS 问题，key 也不会出现在网页源码里。
 */
object OpenAiApi {

    fun chat(cfg: ApiConfig, body: JSONObject): ApiResult {
        return try {
            if (body.optString("model").isBlank()) body.put("model", cfg.model)
            val conn = (URL("${cfg.baseUrl}/chat/completions").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 60000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer ${cfg.apiKey}")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val (code, text) = readResponse(conn)
            if (code in 200..299) ApiResult(true, text) else ApiResult(false, "HTTP $code ${text.take(300)}")
        } catch (e: Exception) {
            ApiResult(false, describe(e))
        }
    }

    /**
     * 上传一段 WAV 转文字；网络抖动或限流时再试一次。成功时 body 是识别出的文字。
     * quick：松手后「再认一遍」用，等不起——连接 3 秒、读 6 秒，只试一次，不行就用本机的结果
     */
    fun transcribe(cfg: ApiConfig, wav: ByteArray, quick: Boolean = false): ApiResult {
        if (Qianwen.matches(cfg)) return Qianwen.transcribe(cfg, wav, quick)
        var lastError = ""
        for (attempt in 0 until (if (quick) 1 else 2)) {
            try {
                val boundary = "----TrainFit" + System.currentTimeMillis()
                val out = ByteArrayOutputStream()
                out.write("--$boundary\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n${cfg.model}\r\n".toByteArray(Charsets.UTF_8))
                out.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n".toByteArray(Charsets.UTF_8))
                out.write(wav)
                out.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
                val body = out.toByteArray()

                val conn = (URL("${cfg.baseUrl}/audio/transcriptions").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = if (quick) 3000 else 10000
                    readTimeout = if (quick) 6000 else 30000
                    doOutput = true
                    setFixedLengthStreamingMode(body.size)
                    setRequestProperty("Authorization", "Bearer ${cfg.apiKey}")
                    setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                    setRequestProperty("Accept", "application/json")
                }
                conn.outputStream.use { it.write(body) }
                val (code, text) = readResponse(conn)
                if (code in 200..299) {
                    val said = try { JSONObject(text).optString("text") } catch (_: Exception) { text }
                    return ApiResult(true, cleanAsrText(said))
                }
                lastError = "HTTP $code ${text.take(200)}"
                if (code in 400..499 && code != 429) break
            } catch (e: Exception) {
                lastError = describe(e)
            }
        }
        return ApiResult(false, lastError)
    }

    /** Qwen3-ASR 有时带「language Chinese<asr_text>」这类标记：去掉 */
    fun cleanAsrText(raw: String): String = raw
        .replace(Regex("(?s)^.*<asr_text>"), "")
        .replace(Regex("<[^>]{1,40}>"), "")
        .replace(Regex("^\\s*language\\s+\\S+\\s*", RegexOption.IGNORE_CASE), "")
        .trim()

    internal fun readResponse(conn: HttpURLConnection): Pair<Int, String> {
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        conn.disconnect()
        return code to text
    }

    internal fun describe(e: Exception) = "${e.javaClass.simpleName}: ${e.message.orEmpty()}"
}
