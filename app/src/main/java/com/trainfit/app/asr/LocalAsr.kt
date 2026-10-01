package com.trainfit.app.asr

import android.annotation.SuppressLint
import android.content.res.AssetManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineSenseVoiceModelConfig
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import java.io.File
import kotlin.math.sqrt

/**
 * 本机语音识别（不联网）。照搬 sherpa-onnx 官方 Android demo「SherpaOnnxSimulateStreamingAsr」的做法，
 * 模型也用它默认的 SenseVoice（int8，比以前的 Paraformer small 准，数字直接出阿拉伯数字、带标点）。
 * 模型 239MB 不打进安装包，第一次打开时由 ModelDownloader 下到 modelDir：
 *  - 录音线程只管收声音，不做别的——以前在录音线程里识别，一句话说长了识别一次要大半秒，
 *    录音缓冲只有 0.2 秒，中间的声音就丢了；
 *  - 识别线程用 Silero VAD 按停顿切句，当前这句隔一会儿重新识别一次 → 边说边出字；
 *  - 松手后把整段话（25 秒以内）连起来再识别一遍，上下文完整，比一句句拼起来准；太长就用切好的句子拼。
 * 开始和结束完全由用户控制，停顿不会结束录音。
 */
class LocalAsr(private val assets: AssetManager, private val modelDir: File) {
    companion object {
        const val SAMPLE_RATE = 16000
        private const val WINDOW = 512
        private const val MAX_MS = 120_000L
        private const val VAD_MODEL = "asr/silero_vad.onnx" // VAD 很小，还在安装包里
        private const val FULL_PASS_MAX = SAMPLE_RATE * 25 // 松手后整段重新识别的上限
        private const val PAD = SAMPLE_RATE * 3 / 10       // 整段识别时前后多留 0.3 秒
    }

    @Volatile var ready = false
        private set
    @Volatile var failed = false
        private set
    /** 模型还没下载好（ModelDownloader 在后台下）：录音照常、只是本机不识别，靠云端 */
    @Volatile var missing = false
        private set

    private var recognizer: OfflineRecognizer? = null
    private var vad: Vad? = null

    /** 加载模型（约 1~3 秒），在后台线程调用；模型下载完以后会再调一次 */
    @Synchronized
    fun init() {
        if (ready || failed) return
        // 只带了 arm64 的 .so：32 位手机用不了本机识别，也就不用下模型
        if (!Build.SUPPORTED_ABIS.contains("arm64-v8a")) {
            failed = true
            return
        }
        val model = File(modelDir, "model.int8.onnx")
        val tokens = File(modelDir, "tokens.txt")
        if (ModelDownloader.FILES.any { File(modelDir, it.name).length() != it.size }) {
            missing = true
            return
        }
        try {
            recognizer = OfflineRecognizer(
                assetManager = null, // 模型在 App 自己的目录里，按文件路径加载
                config = OfflineRecognizerConfig(
                    featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
                    modelConfig = OfflineModelConfig(
                        // 固定中文：自动判断语言时，纯噪声会被认成韩文、日文
                        senseVoice = OfflineSenseVoiceModelConfig(model = model.absolutePath, language = "zh", useInverseTextNormalization = true),
                        tokens = tokens.absolutePath,
                        numThreads = 4,
                    ),
                ),
            )
            vad = newVad()
            missing = false
            ready = true
        } catch (t: Throwable) {
            // 比如 32 位手机没有对应的 .so、内存不够：退回云端识别
            failed = true
        }
    }

    private fun newVad() = Vad(
        assetManager = assets,
        config = VadModelConfig(
            sileroVadModelConfig = SileroVadModelConfig(
                model = VAD_MODEL,
                threshold = 0.5f,
                minSilenceDuration = 0.5f,   // 停顿 0.5 秒算一句结束（只是切句，不会停止录音）
                minSpeechDuration = 0.25f,
                windowSize = WINDOW,
                maxSpeechDuration = 15f,
            ),
            sampleRate = SAMPLE_RATE,
            numThreads = 1,
        ),
    )

    // ---------------- 一次录音 ----------------
    // all / total 录音线程写、识别线程读，用 lock 保护；其余状态只有识别线程（录完之后是 stop()）在用
    private val lock = Object()
    @Volatile private var running = false
    private var capture: Thread? = null
    private var worker: Thread? = null
    private var record: AudioRecord? = null
    private var all = FloatArray(SAMPLE_RATE * 10)
    private var total = 0

    private val committed = mutableListOf<String>()
    private var processed = 0
    private var speechStart = -1
    private var firstSpeech = -1
    private var lastSpeechEnd = -1

    val isRecording: Boolean get() = running

    @SuppressLint("MissingPermission") // 调用前已检查 RECORD_AUDIO
    /** onAudio：录音线程每收到 100ms 声音就给一份（云端实时识别用），别在里面做耗时的事 */
    fun start(
        onLevel: (Float) -> Unit,
        onPartial: (String) -> Unit,
        onMax: () -> Unit,
        onAudio: ((ShortArray, Int) -> Unit)? = null
    ): Boolean {
        if (running) return true
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuf <= 0) return false
        val r = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBuf * 4, SAMPLE_RATE * 2) // 1 秒的缓冲，手机卡一下也不丢声音
            )
        } catch (e: Exception) {
            return false
        }
        if (r.state != AudioRecord.STATE_INITIALIZED) {
            r.release()
            return false
        }
        synchronized(lock) { total = 0 }
        resetState()
        try {
            r.startRecording()
        } catch (e: Exception) {
            r.release()
            return false
        }
        record = r
        running = true
        val startedAt = System.currentTimeMillis()

        // 录音线程：只收声音
        capture = Thread {
            val chunk = ShortArray(SAMPLE_RATE / 10) // 100ms
            var maxNotified = false
            while (running) {
                val n = try { r.read(chunk, 0, chunk.size) } catch (e: Exception) { -1 }
                if (n <= 0) continue
                try { onAudio?.invoke(chunk, n) } catch (_: Exception) {}
                var sum = 0.0
                synchronized(lock) {
                    ensureCapacity(total + n)
                    for (i in 0 until n) {
                        val f = chunk[i] / 32768f
                        all[total + i] = f
                        sum += f * f
                    }
                    total += n
                }
                onLevel((sqrt(sum / n) * 4).coerceIn(0.0, 1.0).toFloat())
                if (!maxNotified && System.currentTimeMillis() - startedAt >= MAX_MS) {
                    maxNotified = true
                    onMax()
                }
            }
        }.apply {
            name = "TrainFitAsrCapture"
            priority = Thread.MAX_PRIORITY
            start()
        }

        // 识别线程：切句、边说边出字
        worker = Thread {
            var lastPartialAt = 0L
            var gap = 300L
            var lastPartial = ""
            while (running) {
                if (!ready) { Thread.sleep(50); continue }
                val fed = feedAvailable()
                val now = System.currentTimeMillis()
                if (speechStart >= 0 && now - lastPartialAt > gap) {
                    val tail = synchronized(lock) { all.copyOfRange(speechStart, processed) }
                    val t = decode(tail)
                    val cost = System.currentTimeMillis() - now
                    gap = maxOf(300L, cost * 2) // 手机慢就少刷几次，别把 CPU 占满
                    lastPartialAt = System.currentTimeMillis()
                    val text = (committed + t).filter { it.isNotBlank() }.joinToString("，")
                    if (text.isNotBlank() && text != lastPartial) {
                        lastPartial = text
                        onPartial(text)
                    }
                } else if (!fed) {
                    Thread.sleep(30)
                }
            }
        }.apply {
            name = "TrainFitAsrDecode"
            start()
        }
        return true
    }

    /**
     * 停止并返回最终文字（在后台线程调用）。
     * afterCapture：录音一停（最后一块声音已经交给 onAudio）就调用，比如告诉云端说完了；之后本机再整段认一遍
     */
    fun stop(afterCapture: () -> Unit = {}): String {
        if (!running && record == null) {
            try { afterCapture() } catch (_: Exception) {}
            return ""
        }
        running = false
        try { capture?.join(1500) } catch (_: Exception) {}
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        capture = null
        try { afterCapture() } catch (_: Exception) {}
        // 识别线程手上那一次识别做完就退出
        try { worker?.join(10_000) } catch (_: Exception) {}
        worker = null

        // 模型还没加载完（刚打开 App 就按住）：等一下；还没下载的不用等
        val waitUntil = System.currentTimeMillis() + 10_000
        while (!ready && !failed && !missing && System.currentTimeMillis() < waitUntil) Thread.sleep(50)
        if (!ready) {
            // 本机认不了：整段（最多 60 秒）留给云端整段识别
            val got = synchronized(lock) { total }
            lastSpeech = if (got > SAMPLE_RATE / 2) synchronized(lock) { all.copyOfRange(0, minOf(got, SAMPLE_RATE * 60)) } else null
            return ""
        }

        feedAvailable()
        try { vad?.flush() } catch (_: Throwable) {}
        drainSegments()
        val segments = committed.filter { it.isNotBlank() }.joinToString("，")
        val n = synchronized(lock) { total }

        // 整段重新识别：从第一次说话到最后一次说话（前后各多 0.3 秒）；VAD 没听到人声就整段识别兜底
        val from = if (firstSpeech >= 0) maxOf(0, firstSpeech - PAD) else 0
        val to = if (lastSpeechEnd > 0) minOf(n, lastSpeechEnd + PAD) else n
        lastSpeech = if (to - from > SAMPLE_RATE / 2) synchronized(lock) { all.copyOfRange(from, minOf(to, from + SAMPLE_RATE * 60)) } else null
        if (to - from in (SAMPLE_RATE / 2)..FULL_PASS_MAX) {
            val whole = decode(synchronized(lock) { all.copyOfRange(from, to) })
            if (whole.isNotBlank()) return whole.trim()
        }
        return segments.trim()
    }

    /** 刚才那段话（去掉前后的静音，最多 60 秒）：给云端大模型再认一遍用 */
    @Volatile private var lastSpeech: FloatArray? = null

    /** 刚才那段话的 16kHz 16bit 单声道 WAV；没有返回 null */
    fun lastWav(): ByteArray? {
        val f = lastSpeech ?: return null
        val pcm = java.nio.ByteBuffer.allocate(f.size * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        for (v in f) pcm.putShort((v.coerceIn(-1f, 1f) * 32767).toInt().toShort())
        val data = pcm.array()
        val header = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt(36 + data.size); put("WAVE".toByteArray())
            put("fmt ".toByteArray()); putInt(16); putShort(1.toShort()); putShort(1.toShort())
            putInt(SAMPLE_RATE); putInt(SAMPLE_RATE * 2); putShort(2.toShort()); putShort(16.toShort())
            put("data".toByteArray()); putInt(data.size)
        }.array()
        return header + data
    }

    fun cancel() {
        running = false
        try { capture?.join(1000) } catch (_: Exception) {}
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        capture = null
        try { worker?.join(5000) } catch (_: Exception) {}
        worker = null
        synchronized(lock) { total = 0 }
        resetState()
    }

    // ---------------- 内部（只在识别线程，或录完之后调用） ----------------
    private fun resetState() {
        lastSpeech = null
        committed.clear()
        processed = 0
        speechStart = -1
        firstSpeech = -1
        lastSpeechEnd = -1
        try { vad?.reset() } catch (_: Throwable) {}
    }

    private fun ensureCapacity(n: Int) {
        if (n <= all.size) return
        var size = all.size
        while (size < n) size *= 2
        all = all.copyOf(size)
    }

    /** 把还没喂给 VAD 的样本按 512 一窗喂进去，顺便识别已经切好的句子。喂了东西返回 true */
    private fun feedAvailable(): Boolean {
        val v = vad ?: return false
        val avail = synchronized(lock) { total }
        if (processed + WINDOW > avail) return false
        while (processed + WINDOW <= avail) {
            val w = synchronized(lock) { all.copyOfRange(processed, processed + WINDOW) }
            v.acceptWaveform(w)
            processed += WINDOW
            if (speechStart < 0 && v.isSpeechDetected()) {
                speechStart = maxOf(0, processed - SAMPLE_RATE * 4 / 10) // 往前多留 0.4 秒，别吃掉第一个字
            }
            drainSegments()
        }
        return true
    }

    private fun drainSegments() {
        val v = vad ?: return
        while (!v.empty()) {
            val seg = v.front()
            if (firstSpeech < 0) firstSpeech = seg.start
            lastSpeechEnd = seg.start + seg.samples.size
            val t = decode(seg.samples)
            if (t.isNotBlank()) committed.add(t)
            v.pop()
            speechStart = -1
        }
    }

    private fun decode(samples: FloatArray): String {
        val r = recognizer ?: return ""
        if (samples.isEmpty()) return ""
        val s = r.createStream()
        return try {
            s.acceptWaveform(samples, SAMPLE_RATE)
            r.decode(s)
            clean(r.getResult(s).text)
        } catch (t: Throwable) {
            ""
        } finally {
            s.release()
        }
    }

    /** 只有语气词（「嗯」「啊」，噪声常被认成这些）当没说 */
    private fun clean(text: String): String {
        val t = text.trim()
        val core = t.replace(Regex("[\\p{P}\\s]"), "")
        return if (core.isEmpty() || core.matches(Regex("[嗯啊呃哦唉额诶]+"))) "" else t
    }
}
