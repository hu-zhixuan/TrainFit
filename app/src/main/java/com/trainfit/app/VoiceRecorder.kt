package com.trainfit.app

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * 录一段 16kHz 单声道 16bit 的 WAV。开始和结束完全由用户控制（按住/松开或点两下），
 * 不做任何静音检测，所以不会把话截断。
 */
class VoiceRecorder(
    private val onLevel: (Float) -> Unit,     // 0..1 音量，大约每 100ms 一次
    private val onMaxReached: () -> Unit      // 录满最长时长
) {
    companion object {
        const val SAMPLE_RATE = 16000
        const val MAX_MS = 120_000L
        private const val MIN_BYTES = SAMPLE_RATE * 2 * 4 / 10  // 0.4 秒
    }

    @Volatile private var recording = false
    private var record: AudioRecord? = null
    private var thread: Thread? = null
    private val pcm = ByteArrayOutputStream()

    @SuppressLint("MissingPermission") // 调用前已检查 RECORD_AUDIO
    fun start(): Boolean {
        if (recording) return true
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuf <= 0) return false
        val chunk = maxOf(minBuf, SAMPLE_RATE / 10 * 2) // 至少 100ms
        val r = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                chunk * 4
            )
        } catch (e: Exception) {
            return false
        }
        if (r.state != AudioRecord.STATE_INITIALIZED) {
            r.release()
            return false
        }
        synchronized(pcm) { pcm.reset() }
        try {
            r.startRecording()
        } catch (e: Exception) {
            r.release()
            return false
        }
        record = r
        recording = true
        val startedAt = System.currentTimeMillis()
        thread = Thread {
            val buf = ByteArray(chunk)
            var lastLevelAt = 0L
            var maxNotified = false
            while (recording) {
                val n = try { r.read(buf, 0, buf.size) } catch (e: Exception) { -1 }
                if (n <= 0) continue
                synchronized(pcm) { pcm.write(buf, 0, n) }
                val now = System.currentTimeMillis()
                if (now - lastLevelAt >= 100) {
                    lastLevelAt = now
                    onLevel(level(buf, n))
                }
                if (!maxNotified && now - startedAt >= MAX_MS) {
                    maxNotified = true
                    onMaxReached()
                }
            }
        }.apply {
            name = "TrainFitRecorder"
            start()
        }
        return true
    }

    /** 停止并返回 WAV 字节；太短返回 null */
    fun stop(): ByteArray? {
        if (!recording && record == null) return null
        recording = false
        try { thread?.join(1500) } catch (_: Exception) {}
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        thread = null
        val data = synchronized(pcm) { pcm.toByteArray() }
        if (data.size < MIN_BYTES) return null
        return wav(data)
    }

    fun cancel() {
        stop()
        synchronized(pcm) { pcm.reset() }
    }

    private fun level(buf: ByteArray, n: Int): Float {
        val bb = ByteBuffer.wrap(buf, 0, n).order(ByteOrder.LITTLE_ENDIAN)
        var sum = 0.0
        var count = 0
        while (bb.remaining() >= 2) {
            val s = bb.short.toDouble() / 32768.0
            sum += s * s
            count++
        }
        if (count == 0) return 0f
        return (sqrt(sum / count) * 4).coerceIn(0.0, 1.0).toFloat()
    }

    private fun wav(pcmData: ByteArray): ByteArray {
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray())
            putInt(36 + pcmData.size)
            put("WAVE".toByteArray())
            put("fmt ".toByteArray())
            putInt(16)
            putShort(1.toShort())        // PCM
            putShort(1.toShort())        // 单声道
            putInt(SAMPLE_RATE)
            putInt(SAMPLE_RATE * 2)      // byte rate
            putShort(2.toShort())        // block align
            putShort(16.toShort())       // bits
            put("data".toByteArray())
            putInt(pcmData.size)
        }.array()
        return header + pcmData
    }
}
