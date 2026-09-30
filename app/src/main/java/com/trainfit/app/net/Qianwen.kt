package com.trainfit.app.net

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 千问 AI 平台（原阿里云百炼 / DashScope）的语音识别 qwen3-asr-flash：新用户注册就送免费额度，国内直连。
 * 它不走 OpenAI 的 /audio/transcriptions，要把录音转成 base64 放进 JSON（照 BiBi-Keyboard 的做法）。
 * key 以 sk-ws- 开头，或者接口地址是它家的，就走这里；设置里只填 key、地址和模型留空也行。
 */
object Qianwen {
    const val MODEL = "qwen3-asr-flash"
    private const val DEFAULT_ROOT = "https://maas.qianwenaiapi.com"
    private val HOSTS = listOf("qianwenaiapi.com", "qwencloudapi.com", "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com")

    /** 提示识别的上下文：常说的动作和吃的，同音字少认错（没说到的词不会被硬塞进来） */
    private const val CONTEXT = "健身和饮食记录。常见词：卧推、深蹲、硬拉、引体向上、划船、推举、飞鸟、弯举、组、个、公斤、" +
        "跑步机、椭圆机、蛋白粉、乳清蛋白、鸡胸肉、茶叶蛋、豆浆、燕麦、米饭、牛肉面、千卡、大卡、毫升、克。"

    private fun hostOf(url: String) = try { URL(url).host.orEmpty() } catch (_: Exception) { "" }

    fun matches(cfg: ApiConfig): Boolean =
        cfg.apiKey.startsWith("sk-ws-") || HOSTS.any { hostOf(cfg.baseUrl).endsWith(it) }

    /** 地址留空（还是默认的硅基流动）就用千问的；模型名是别家的（带 /）就换成 qwen3-asr-flash */
    fun endpoint(cfg: ApiConfig): String {
        val host = hostOf(cfg.baseUrl)
        val root = if (HOSTS.any { host.endsWith(it) }) "https://$host" else DEFAULT_ROOT
        return "$root/api/v1/services/aigc/multimodal-generation/generation"
    }

    fun model(cfg: ApiConfig): String = cfg.model.takeIf { it.isNotBlank() && !it.contains('/') } ?: MODEL

    fun transcribe(cfg: ApiConfig, wav: ByteArray, quick: Boolean): ApiResult {
        val audio = "data:audio/wav;base64," + Base64.encodeToString(wav, Base64.NO_WRAP)
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", JSONArray().put(JSONObject().put("text", CONTEXT))))
            .put(JSONObject().put("role", "user").put("content", JSONArray().put(JSONObject().put("audio", audio))))
        val body = JSONObject()
            .put("model", model(cfg))
            .put("input", JSONObject().put("messages", messages))
            .put("parameters", JSONObject().put("asr_options", JSONObject().put("enable_itn", true).put("language", "zh")))
            .toString().toByteArray(Charsets.UTF_8)

        var lastError = ""
        for (attempt in 0 until (if (quick) 1 else 2)) {
            try {
                val conn = (URL(endpoint(cfg)).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = if (quick) 3000 else 10000
                    readTimeout = if (quick) 6000 else 30000
                    doOutput = true
                    setFixedLengthStreamingMode(body.size)
                    setRequestProperty("Authorization", "Bearer ${cfg.apiKey}")
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("X-DashScope-SSE", "disable")
                }
                conn.outputStream.use { it.write(body) }
                val (code, text) = OpenAiApi.readResponse(conn)
                if (code in 200..299) return ApiResult(true, OpenAiApi.cleanAsrText(textOf(text)))
                lastError = "HTTP $code ${text.take(200)}"
                if (code in 400..499 && code != 429) break
            } catch (e: Exception) {
                lastError = OpenAiApi.describe(e)
            }
        }
        return ApiResult(false, lastError)
    }

    /** {"output":{"choices":[{"message":{"content":[{"text":"…"}]}}]}} */
    fun textOf(body: String): String = try {
        val content = JSONObject(body).optJSONObject("output")?.optJSONArray("choices")
            ?.optJSONObject(0)?.optJSONObject("message")?.optJSONArray("content")
        var t = ""
        if (content != null) for (i in 0 until content.length()) {
            t = content.optJSONObject(i)?.optString("text").orEmpty().trim()
            if (t.isNotEmpty()) break
        }
        t
    } catch (_: Exception) { "" }
}
