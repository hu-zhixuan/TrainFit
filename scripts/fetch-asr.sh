#!/usr/bin/env bash
# 下载本机语音识别需要的文件（太大，不放进仓库）：
#   - sherpa-onnx 预编译库（arm64-v8a）：libsherpa-onnx-jni.so + libonnxruntime.so
#   - SenseVoice 模型（int8，中英日韩粤，官方模拟流式 demo 默认用的就是它）+ tokens
#   - Silero VAD
# 版本要和 app/src/main/java/com/k2fsa/sherpa/onnx/*.kt 一致（v1.13.8）。
set -euo pipefail
cd "$(dirname "$0")/.."

SHERPA_VERSION=1.13.8
# 2025-09-09 那版是粤语微调的，普通话用 2024-07-17 原版
MODEL=sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17
JNI=app/src/main/jniLibs/arm64-v8a
ASSETS=app/src/main/assets/asr
CACHE=${ASR_CACHE_DIR:-.asr-cache}
mkdir -p "$JNI" "$ASSETS/sensevoice" "$CACHE"
# 以前用的 Paraformer small，别一起打进安装包
rm -rf "$ASSETS/paraformer"

fetch() { # url out
  [ -s "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"
}

if [ ! -s "$JNI/libsherpa-onnx-jni.so" ] || [ ! -s "$JNI/libonnxruntime.so" ]; then
  fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/sherpa-onnx-v${SHERPA_VERSION}-android.tar.bz2" "$CACHE/sherpa-android.tar.bz2"
  tar xjf "$CACHE/sherpa-android.tar.bz2" -C "$CACHE" ./jniLibs/arm64-v8a/libsherpa-onnx-jni.so ./jniLibs/arm64-v8a/libonnxruntime.so
  cp "$CACHE/jniLibs/arm64-v8a/libsherpa-onnx-jni.so" "$CACHE/jniLibs/arm64-v8a/libonnxruntime.so" "$JNI/"
fi

if [ ! -s "$ASSETS/sensevoice/model.int8.onnx" ]; then
  fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL}.tar.bz2" "$CACHE/${MODEL}.tar.bz2"
  tar xjf "$CACHE/${MODEL}.tar.bz2" -C "$CACHE" "${MODEL}/model.int8.onnx" "${MODEL}/tokens.txt"
  cp "$CACHE/${MODEL}/model.int8.onnx" "$CACHE/${MODEL}/tokens.txt" "$ASSETS/sensevoice/"
fi

fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" "$ASSETS/silero_vad.onnx"

ls -la "$JNI" "$ASSETS" "$ASSETS/sensevoice"
