package com.trainfit.app.asr

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * 手机系统自带的语音识别（SpeechRecognizer）。只在本机识别和云端识别都用不了时才会用到。
 *
 * 用户按住期间一直听：引擎因为停顿自动断句了就接着开下一轮，攒起来的文字最后一起给出。
 * 所有方法都要在主线程调用。
 *
 * @param emit 回调给网页：type = start | partial | final | error | end
 */
class SystemSpeech(
    private val context: Context,
    private val main: Handler,
    private val emit: (type: String, text: String) -> Unit,
) {
    private var recognizer: SpeechRecognizer? = null
    private var wantListening = false   // 用户是否还希望继续听（按住中 / 点击录音中）
    private var sessionActive = false   // 识别器当前是否有一轮在跑
    private var finished = true         // 本次录音是否已经回调过 final/end
    private val committed = StringBuilder()
    private var lastPartial = ""

    fun isAvailable(): Boolean {
        if (SpeechRecognizer.isRecognitionAvailable(context)) return true
        return Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    }

    fun start() {
        if (!finished) cancel()
        if (!isAvailable()) {
            emit("error", "NOT_AVAILABLE")
            emit("end", "")
            return
        }
        committed.setLength(0)
        lastPartial = ""
        finished = false
        wantListening = true
        createRecognizer()
        emit("start", "")
        startSession()
    }

    fun stop() {
        if (finished) return
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

    fun cancel() {
        if (finished) return
        wantListening = false
        finished = true
        sessionActive = false
        try { recognizer?.cancel() } catch (_: Exception) {}
        destroyRecognizer()
        emit("end", "canceled")
    }

    private fun createRecognizer() {
        destroyRecognizer()
        val r = if (SpeechRecognizer.isRecognitionAvailable(context)) {
            SpeechRecognizer.createSpeechRecognizer(context)
        } else if (Build.VERSION.SDK_INT >= 31) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
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
            emit("error", "START_FAILED")
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
        emit("final", committed.toString())
        emit("end", "")
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
                emit("partial", combined())
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
                emit("partial", combined())
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
                emit("error", errorName(error))
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
}
