/**
 * 练食AI · 增强型全能语音识别与麦克风音频感知引擎
 * - 支持 Web Speech API (双内核兼容)
 * - 支持 Web Audio API 麦克风实时音频电平 (RMS/Waveform) 可视化
 * - 针对移动端 / WebView 针对性防中断与自愈重连
 */

const SpeechModule = {
  recognition: null,
  isRecording: false,
  audioContext: null,
  analyser: null,
  mediaStream: null,
  animationFrameId: null,
  onResultCallback: null,
  onEndCallback: null,
  onVolumeChangeCallback: null,
  accumulatedTranscript: '',
  manualStopped: false,

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  async start(onResult, onEnd, onError, onVolumeChange) {
    this.manualStopped = false;
    this.accumulatedTranscript = '';
    this.onResultCallback = onResult;
    this.onEndCallback = onEnd;
    this.onVolumeChangeCallback = onVolumeChange;

    // 1. First start AudioContext visualizer for instant mic feedback
    await this.startAudioVisualizer(onVolumeChange).catch(err => {
      console.warn('Audio visualizer init error (non-fatal):', err);
    });

    // 2. Start Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (onError) onError('NOT_SUPPORTED');
      this.isRecording = true; // Keep visualizer active for manual typing / mic simulation
      return true;
    }

    try {
      this.stopRecognitionOnly();

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'zh-CN';
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        this.isRecording = true;
      };

      rec.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += trans;
          } else {
            interimText += trans;
          }
        }

        if (finalText) {
          this.accumulatedTranscript += (this.accumulatedTranscript ? '，' : '') + finalText.trim();
        }

        const currentOutput = (this.accumulatedTranscript + (interimText ? ' ' + interimText : '')).trim();
        if (currentOutput && this.onResultCallback) {
          this.onResultCallback(currentOutput);
        }
      };

      rec.onerror = (event) => {
        console.warn('Speech recognition warning/error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          if (onError) onError('not-allowed');
          this.stop();
        } else if (event.error === 'network') {
          if (onError) onError('network');
        } else if (event.error === 'no-speech') {
          // Keep listening, do not abort
        } else {
          if (onError) onError(event.error || 'ERROR');
        }
      };

      rec.onend = () => {
        // Auto-restart if user has not manually stopped (handles mobile silence timeout)
        if (this.isRecording && !this.manualStopped) {
          try {
            rec.start();
          } catch (e) {
            this.stop();
          }
        } else {
          this.isRecording = false;
          if (this.onEndCallback) this.onEndCallback();
        }
      };

      this.recognition = rec;
      rec.start();
      this.isRecording = true;
      return true;
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      // Even if native STT fails, keep recording state active so user can use visualizer & voice typing
      this.isRecording = true;
      if (onError) onError(err.name || 'NOT_SUPPORTED');
      return true;
    }
  },

  async startAudioVisualizer(onVolumeChange) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.mediaStream = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!this.isRecording || !this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1.0, Math.max(0.05, avg / 60));

        if (onVolumeChange) {
          onVolumeChange(normalized);
        }

        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Microphone stream access ignored or unavailable:', e);
    }
  },

  stopRecognitionOnly() {
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
  },

  stop() {
    this.manualStopped = true;
    this.isRecording = false;

    this.stopRecognitionOnly();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.onVolumeChangeCallback) {
      this.onVolumeChangeCallback(0);
    }

    if (this.onEndCallback) {
      this.onEndCallback();
    }
  }
};

if (typeof window !== 'undefined') {
  window.SpeechModule = SpeechModule;
}
