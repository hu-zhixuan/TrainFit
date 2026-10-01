package com.trainfit.app.asr

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 本机识别模型（SenseVoice int8 2024-07-17，239MB）不打进安装包：第一次打开时在后台下到 App 自己的目录。
 *  - 连着 Wi-Fi（不按流量计费的网络）自动下；用流量要在设置里点一下「用流量下载」；
 *  - 断了下次接着下（Range），下完核对 sha256 再用；
 *  - 国内从 GitHub 下太慢，用 hf-mirror，不行再试 huggingface（2026-10 实测 hf-mirror 能下、文件一致；ModelScope 上没有）。
 * 没下完之前：按住说话只走云端识别（千问实时识别），边说边出的字也是云端给的。
 */
class ModelDownloader(private val context: Context, private val onReady: () -> Unit) {
    class Part(val name: String, val size: Long, val sha256: String)

    companion object {
        val FILES = listOf(
            Part("model.int8.onnx", 239_233_841L, "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51"),
            Part("tokens.txt", 315_894L, "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc"),
        )
        private const val REPO = "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
        private val MIRRORS = listOf(
            "https://hf-mirror.com/$REPO/resolve/main/",
            "https://huggingface.co/$REPO/resolve/main/",
        )
        val TOTAL = FILES.sumOf { it.size }

        fun dir(context: Context) = File(context.filesDir, "asr/sensevoice")
        fun present(context: Context) = FILES.all { File(dir(context), it.name).length() == it.size }
    }

    /** idle | waiting_wifi | downloading | ready | failed */
    @Volatile var state = if (present(context)) "ready" else "idle"
        private set
    @Volatile var error = ""
        private set
    @Volatile private var allowMetered = false
    private val running = AtomicBoolean(false)
    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /** 已经下了多少字节（下完的文件 + 没下完的 .part） */
    fun done(): Long {
        val d = dir(context)
        return FILES.sumOf { f ->
            val out = File(d, f.name)
            if (out.length() == f.size) f.size else File(d, f.name + ".part").length()
        }
    }

    private fun metered(): Boolean = try {
        (context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).isActiveNetworkMetered
    } catch (_: Exception) { true }

    /** 打开 App、回到前台、连上 Wi-Fi 时调用；userAsked：用户在设置里点了「用流量下载 / 重试」 */
    fun start(userAsked: Boolean = false) {
        if (userAsked) allowMetered = true
        if (present(context)) {
            state = "ready"
            return
        }
        if (metered() && !allowMetered) {
            if (state != "downloading") state = "waiting_wifi"
            return
        }
        if (!running.compareAndSet(false, true)) return
        Thread {
            try { run() } catch (t: Throwable) { error = t.javaClass.simpleName; state = "failed" } finally { running.set(false) }
        }.apply { name = "TrainFitModelDl"; isDaemon = true; start() }
    }

    /** 连上 Wi-Fi 时自动接着下 */
    fun watchNetwork() {
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val unmetered = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                    if (unmetered && (state == "waiting_wifi" || state == "failed" || state == "idle")) start()
                }
            })
        } catch (_: Exception) {}
    }

    private fun run() {
        state = "downloading"
        error = ""
        val d = dir(context).apply { mkdirs() }
        val need = TOTAL - done()
        if (d.usableSpace < need + 50L * 1024 * 1024) {
            error = "手机空间不够，要 ${need / 1024 / 1024 + 50}MB"
            state = "failed"
            return
        }
        for (f in FILES) {
            val out = File(d, f.name)
            if (out.length() == f.size) continue
            val part = File(d, f.name + ".part")
            var ok = false
            for (m in MIRRORS) {
                if (fetch(m + f.name, part, f)) { ok = true; break }
                if (state == "waiting_wifi") return
            }
            if (!ok) {
                state = "failed"
                return
            }
            if (sha256(part) != f.sha256) {
                part.delete()
                error = "下载的文件不完整，点重试"
                state = "failed"
                return
            }
            out.delete()
            if (!part.renameTo(out)) {
                error = "存不下来"
                state = "failed"
                return
            }
        }
        state = "ready"
        onReady()
    }

    /** 下到 part（接着上次的下），下满返回 true */
    private fun fetch(url: String, part: File, f: Part): Boolean {
        for (attempt in 0 until 3) {
            try {
                var have = part.length()
                if (have > f.size) { part.delete(); have = 0 }
                if (have == f.size) return true
                val req = Request.Builder().url(url).apply { if (have > 0) header("Range", "bytes=$have-") }.build()
                client.newCall(req).execute().use { resp ->
                    if (resp.code != 200 && resp.code != 206) {
                        error = "HTTP ${resp.code}"
                        return false // 这个镜像不行，换下一个
                    }
                    val append = resp.code == 206
                    val body = resp.body ?: return false
                    body.byteStream().use { input ->
                        FileOutputStream(part, append).use { out ->
                            val buf = ByteArray(64 * 1024)
                            var sinceCheck = 0L
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                sinceCheck += n
                                if (sinceCheck > 4L * 1024 * 1024) { // 每 4MB 看一眼是不是换成流量了
                                    sinceCheck = 0
                                    if (!allowMetered && metered()) {
                                        state = "waiting_wifi"
                                        return false
                                    }
                                }
                            }
                        }
                    }
                }
                if (part.length() == f.size) return true
            } catch (e: Exception) {
                error = "网络不好（${e.javaClass.simpleName}）"
                try { Thread.sleep(2000L * (attempt + 1)) } catch (_: InterruptedException) {}
            }
        }
        return false
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(256 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}
