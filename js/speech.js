/**
 * 练食AI · 浏览器原生 Web Speech API 语音听写引擎
 * 每次录音创建独立干净实例，彻底避免 InvalidStateError 与复用中断
 */

const SpeechModule = {
  recognition: null,
  isRecording: false,
  onResultCallback: null,
  onEndCallback: null,

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  start(onResult, onEnd, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (onError) onError('NOT_SUPPORTED');
      return false;
    }

    // Stop any existing instance
    this.stop();

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'zh-CN';

      this.onResultCallback = onResult;
      this.onEndCallback = onEnd;

      this.recognition.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
        }

        if (fullTranscript.trim() && this.onResultCallback) {
          this.onResultCallback(fullTranscript.trim());
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        this.isRecording = false;
        if (onError) onError(event.error);
        if (this.onEndCallback) this.onEndCallback();
      };

      this.recognition.onend = () => {
        this.isRecording = false;
        if (this.onEndCallback) this.onEndCallback();
      };

      this.recognition.start();
      this.isRecording = true;
      return true;
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      this.isRecording = false;
      if (onError) onError(err);
      if (this.onEndCallback) this.onEndCallback();
      return false;
    }
  },

  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore already stopped error
      }
      this.recognition = null;
    }
    this.isRecording = false;
  }
};
