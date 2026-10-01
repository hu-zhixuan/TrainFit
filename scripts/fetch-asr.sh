#!/usr/bin/env bash
# 下载本机语音识别需要的文件（太大，不放进仓库）：
#   - sherpa-onnx 预编译库（arm64-v8a）：libsherpa-onnx-jni.so + libonnxruntime.so
#   - Silero VAD
# SenseVoice 模型（239MB）不打进安装包了：App 第一次打开时从 hf-mirror 下载（asr/ModelDownloader.kt）。
# 版本要和 app/src/main/java/com/k2fsa/sherpa/onnx/*.kt 一致（v1.13.8）。
set -euo pipefail
cd "$(dirname "$0")/.."

SHERPA_VERSION=1.13.8
JNI=app/src/main/jniLibs/arm64-v8a
ASSETS=app/src/main/assets/asr
CACHE=${ASR_CACHE_DIR:-.asr-cache}
mkdir -p "$JNI" "$ASSETS" "$CACHE"
# 以前打包进去的模型（Paraformer small、SenseVoice），别再带上
rm -rf "$ASSETS/paraformer" "$ASSETS/sensevoice"

fetch() { # url out
  [ -s "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"
}

if [ ! -s "$JNI/libsherpa-onnx-jni.so" ] || [ ! -s "$JNI/libonnxruntime.so" ]; then
  fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/sherpa-onnx-v${SHERPA_VERSION}-android.tar.bz2" "$CACHE/sherpa-android.tar.bz2"
  tar xjf "$CACHE/sherpa-android.tar.bz2" -C "$CACHE" ./jniLibs/arm64-v8a/libsherpa-onnx-jni.so ./jniLibs/arm64-v8a/libonnxruntime.so
  cp "$CACHE/jniLibs/arm64-v8a/libsherpa-onnx-jni.so" "$CACHE/jniLibs/arm64-v8a/libonnxruntime.so" "$JNI/"
fi

fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" "$ASSETS/silero_vad.onnx"

ls -la "$JNI" "$ASSETS"
