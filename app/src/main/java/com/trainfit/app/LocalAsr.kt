package com.trainfit.app

import android.annotation.SuppressLint
import android.content.res.AssetManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineParaformerModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import kotlin.math.sqrt

/**
 * 本机语音识别（不联网）。照搬 sherpa-onnx 官方 Android demo「SherpaOnnxSimulateStreamingAsr」的做法：
 *  - 边录边用 Silero VAD 按停顿切句；
 *  - 当前这句每 ~300ms 用 Paraformer 重新识别一次 → 边说边出字；
 *  - 切出来的整句识别后固定下来；
 *  - 用户松手时只剩最后一句要识别，几乎立刻出结果。
 * 开始和结束完全由用户控制，停顿不会结束录音。
 */
class LocalAsr(private val assets: AssetManager) {
    companion object {
        const val SAMPLE_RATE = 16000
        private const val WINDOW = 512
        private const val MAX_MS = 120_000L
        private const val MODEL = "asr/paraformer/model.int8.onnx"
        private const val TOKENS = "asr/paraformer/tokens.txt"
        private const val VAD_MODEL = "asr/silero_vad.onnx"
    }

    @Volatile var ready = false
        private set
    @Volatile var failed = false
        private set

    private var recognizer: OfflineRecognizer? = null
    private var vad: Vad? = null
    private val lock = Object()

    /** 加载模型（约 1~2 秒），在后台线程调用 */
    fun init() {
        if (ready || failed) return
        try {
            val files = assets.list("asr/paraformer")?.toList().orEmpty()
            if (!files.contains("model.int8.onnx") || !files.contains("tokens.txt")) {
                failed = true
                return
            }
            recognizer = OfflineRecognizer(
                assetManager = assets,
                config = OfflineRecognizerConfig(
                    featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
                    modelConfig = OfflineModelConfig(
                        paraformer = OfflineParaformerModelConfig(model = MODEL),
                        tokens = TOKENS,
                        numThreads = 2,
                        modelType = "paraformer",
                    ),
                ),
            )
            vad = newVad()
            ready = true
        } catch (t: Throwable) {
            // 比如 32 位手机没有对应的 .so：退回云端识别
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
                maxSpeechDuration = 20f,
            ),
            sampleRate = SAMPLE_RATE,
            numThreads = 1,
        ),
    )

    // ---------------- 一次录音 ----------------
    @Volatile private var running = false
    private var thread: Thread? = null
    private var record: AudioRecord? = null
    private val committed = mutableListOf<String>()
    private var all = FloatArray(SAMPLE_RATE * 10)
    private var total = 0
    private var processed = 0
    private var speechStart = -1
    private var sawSpeech = false

    val isRecording: Boolean get() = running

    @SuppressLint("MissingPermission") // 调用前已检查 RECORD_AUDIO
    fun start(onLevel: (Float) -> Unit, onPartial: (String) -> Unit, onMax: () -> Unit): Boolean {
        if (running) return true
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuf <= 0) return false
        val r = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBuf * 2, SAMPLE_RATE / 5 * 2)
            )
        } catch (e: Exception) {
            return false
        }
        if (r.state != AudioRecord.STATE_INITIALIZED) {
            r.release()
            return false
        }
        synchronized(lock) {
            committed.clear()
            total = 0
            processed = 0
            speechStart = -1
            sawSpeech = false
            try { vad?.reset() } catch (_: Throwable) {}
        }
        try {
            r.startRecording()
        } catch (e: Exception) {
            r.release()
            return false
        }
        record = r
        running = true
        val startedAt = System.currentTimeMillis()
        thread = Thread {
            val chunk = ShortArray(SAMPLE_RATE / 10) // 100ms
            var lastPartialAt = 0L
            var lastPartial = ""
            var maxNotified = false
            while (running) {
                val n = try { r.read(chunk, 0, chunk.size) } catch (e: Exception) { -1 }
                if (n <= 0) continue
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

                if (ready) {
                    val now = System.currentTimeMillis()
                    synchronized(lock) {
                        feedVad()
                        if (speechStart >= 0 && now - lastPartialAt > 300) {
                            lastPartialAt = now
                            val text = currentText(includeTail = true)
                            if (text.isNotBlank() && text != lastPartial) {
                                lastPartial = text
                                onPartial(text)
                            }
                        }
                    }
                }
                if (!maxNotified && System.currentTimeMillis() - startedAt >= MAX_MS) {
                    maxNotified = true
                    onMax()
                }
            }
        }.apply {
            name = "TrainFitLocalAsr"
            start()
        }
        return true
    }

    /** 停止并返回最终文字（在后台线程调用，通常几十到几百毫秒） */
    fun stop(): String {
        if (!running && record == null) return ""
        running = false
        try { thread?.join(1500) } catch (_: Exception) {}
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        thread = null

        // 模型还没加载完（刚打开 App 就按住）：等一下
        val waitUntil = System.currentTimeMillis() + 8000
        while (!ready && !failed && System.currentTimeMillis() < waitUntil) Thread.sleep(50)
        if (!ready) return ""

        synchronized(lock) {
            feedVad()
            try { vad?.flush() } catch (_: Throwable) {}
            drainSegments()
            var text = committed.filter { it.isNotBlank() }.joinToString("，")
            // VAD 没检测到人声（比如声音很小）：整段直接识别一遍兜底
            if (text.isBlank() && total > SAMPLE_RATE / 2) {
                text = decode(all.copyOfRange(0, total))
            }
            return text.trim()
        }
    }

    fun cancel() {
        running = false
        try { thread?.join(1000) } catch (_: Exception) {}
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        thread = null
        synchronized(lock) {
            committed.clear()
            total = 0
            processed = 0
            speechStart = -1
            try { vad?.reset() } catch (_: Throwable) {}
        }
    }

    // ---------------- 内部 ----------------
    private fun ensureCapacity(n: Int) {
        if (n <= all.size) return
        var size = all.size
        while (size < n) size *= 2
        all = all.copyOf(size)
    }

    /** 把还没喂给 VAD 的样本按 512 一窗喂进去，顺便收掉已经切好的句子 */
    private fun feedVad() {
        val v = vad ?: return
        while (processed + WINDOW <= total) {
            v.acceptWaveform(all.copyOfRange(processed, processed + WINDOW))
            processed += WINDOW
            if (speechStart < 0 && v.isSpeechDetected()) {
                sawSpeech = true
                speechStart = maxOf(0, processed - SAMPLE_RATE * 4 / 10) // 往前多留 0.4 秒，别吃掉第一个字
            }
            drainSegments()
        }
    }

    private fun drainSegments() {
        val v = vad ?: return
        while (!v.empty()) {
            val seg = v.front()
            val t = decode(seg.samples)
            if (t.isNotBlank()) committed.add(t)
            v.pop()
            speechStart = -1
        }
    }

    private fun currentText(includeTail: Boolean): String {
        val parts = committed.filter { it.isNotBlank() }.toMutableList()
        if (includeTail && speechStart >= 0 && processed > speechStart) {
            val t = decode(all.copyOfRange(speechStart, processed))
            if (t.isNotBlank()) parts.add(t)
        }
        return parts.joinToString("，")
    }

    private fun decode(samples: FloatArray): String {
        val r = recognizer ?: return ""
        if (samples.isEmpty()) return ""
        val s = r.createStream()
        return try {
            s.acceptWaveform(samples, SAMPLE_RATE)
            r.decode(s)
            r.getResult(s).text.trim()
        } catch (t: Throwable) {
            ""
        } finally {
            s.release()
        }
    }
}
