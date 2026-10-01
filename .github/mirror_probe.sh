#!/usr/bin/env bash
# 本机模型（SenseVoice int8 2024-07-17）在哪些镜像能直接下：看状态码、大小，下载一份算 sha256
set -u
WANT=c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51
out=""
for u in \
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx" \
  "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx" \
  "https://www.modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/master/model.int8.onnx" \
  "https://www.modelscope.cn/models/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/master/model.int8.onnx" \
  "https://www.modelscope.cn/models/k2-fsa/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/master/model.int8.onnx" \
  "https://modelscope.cn/models/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/resolve/master/model.int8.onnx" \
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt" ; do
  r=$(curl -sL -o /dev/null -r 0-1023 -w '%{http_code} %{size_download}' --max-time 30 "$u")
  len=$(curl -sIL --max-time 30 "$u" | grep -i '^content-length' | tail -1 | tr -d '\r' | awk '{print $2}')
  out="$out%0A$(echo "$u" | sed 's#https://##; s#/resolve/.*##') → $r len=$len"
done
# 整份下一次核对 sha256（hf-mirror）
t0=$(date +%s); curl -sL --max-time 600 -o m.onnx "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx"; t1=$(date +%s)
sum=$(sha256sum m.onnx | cut -c1-64); sz=$(stat -c %s m.onnx)
out="$out%0Ahf-mirror 整份 ${sz} 字节 $((t1-t0))s sha256 $( [ "$sum" = "$WANT" ] && echo 一致 || echo "不一致 $sum")"
echo "::notice title=模型镜像::$out"
