/**
 * 练食AI · 浏览器原生 Web Speech API 语音听写引擎 (防清空与全量拼接版)
 */

const SpeechModule = {
  recognition: null,
  isRecording: false,
  onResultCallback: null,
  onEndCallback: null,
  finalTranscript: '',

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'zh-CN';

      this.recognition.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
        }
        
        // Never wipe out with empty string
        if (fullTranscript.trim() && this.onResultCallback) {
          this.onResultCallback(fullTranscript.trim());
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        this.isRecording = false;
        if (this.onEndCallback) this.onEndCallback();
      };

      this.recognition.onend = () => {
        this.isRecording = false;
        if (this.onEndCallback) this.onEndCallback();
      };
    }
  },

  start(onResult, onEnd) {
    this.onResultCallback = onResult;
    this.onEndCallback = onEnd;

    if (!this.recognition) {
      this.init();
    }

    if (this.recognition) {
      try {
        this.recognition.start();
        this.isRecording = true;
      } catch (e) {
        console.warn("Recognition already started or error:", e);
      }
    }
  },

  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.warn("Error stopping recognition:", e);
      }
      this.isRecording = false;
    }
  }
};
