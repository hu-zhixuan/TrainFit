#!/usr/bin/env bash
# 下载本机语音识别需要的文件（太大，不放进仓库）：
#   - sherpa-onnx 预编译库（arm64-v8a）：libsherpa-onnx-jni.so + libonnxruntime.so
#   - Paraformer small 中文模型（int8）+ tokens
#   - Silero VAD
# 版本要和 app/src/main/java/com/k2fsa/sherpa/onnx/*.kt 一致（v1.13.8）。
set -euo pipefail
cd "$(dirname "$0")/.."

SHERPA_VERSION=1.13.8
MODEL=sherpa-onnx-paraformer-zh-small-2024-03-09
JNI=app/src/main/jniLibs/arm64-v8a
ASSETS=app/src/main/assets/asr
CACHE=${ASR_CACHE_DIR:-.asr-cache}
mkdir -p "$JNI" "$ASSETS/paraformer" "$CACHE"

fetch() { # url out
  [ -s "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"
}

if [ ! -s "$JNI/libsherpa-onnx-jni.so" ] || [ ! -s "$JNI/libonnxruntime.so" ]; then
  fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/sherpa-onnx-v${SHERPA_VERSION}-android.tar.bz2" "$CACHE/sherpa-android.tar.bz2"
  tar xjf "$CACHE/sherpa-android.tar.bz2" -C "$CACHE" ./jniLibs/arm64-v8a/libsherpa-onnx-jni.so ./jniLibs/arm64-v8a/libonnxruntime.so
  cp "$CACHE/jniLibs/arm64-v8a/libsherpa-onnx-jni.so" "$CACHE/jniLibs/arm64-v8a/libonnxruntime.so" "$JNI/"
fi

if [ ! -s "$ASSETS/paraformer/model.int8.onnx" ]; then
  fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL}.tar.bz2" "$CACHE/model.tar.bz2"
  tar xjf "$CACHE/model.tar.bz2" -C "$CACHE" "${MODEL}/model.int8.onnx" "${MODEL}/tokens.txt"
  cp "$CACHE/${MODEL}/model.int8.onnx" "$CACHE/${MODEL}/tokens.txt" "$ASSETS/paraformer/"
fi

fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" "$ASSETS/silero_vad.onnx"

ls -la "$JNI" "$ASSETS" "$ASSETS/paraformer"
