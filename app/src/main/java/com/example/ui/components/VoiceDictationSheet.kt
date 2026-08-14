package com.example.ui.components

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.speech.SpeechRecognizerHelper
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.RoyalPurple
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

enum class DictationMode {
    WORKOUT, DIET
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun VoiceDictationSheet(
    mode: DictationMode,
    isProcessing: Boolean,
    onDismiss: () -> Unit,
    onSubmitVoice: (String) -> Unit
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val speechHelper = remember { SpeechRecognizerHelper(context) }

    val isListening by speechHelper.isListening.collectAsState()
    val recognizedText by speechHelper.recognizedText.collectAsState()
    val errorMessage by speechHelper.errorMessage.collectAsState()

    var inputPromptText by remember { mutableStateOf("") }
    var hasAudioPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasAudioPermission = isGranted
        if (isGranted) {
            speechHelper.startListening()
        }
    }

    LaunchedEffect(recognizedText) {
        if (recognizedText.isNotBlank()) {
            inputPromptText = recognizedText
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            speechHelper.stopListening()
        }
    }

    val samplePrompts = if (mode == DictationMode.WORKOUT) {
        listOf(
            "卧推4组每组10次80公斤",
            "深蹲3组12次100公斤，RPE 8.5",
            "哑铃侧平举4组15次8公斤，引体向上3组10次自重",
            "传统硬拉4组8次120公斤，高位下拉4组12次60公斤"
        )
    } else {
        listOf(
            "早上吃了2个水煮蛋大概100克，一杯牛奶250毫升",
            "中午吃了200克大米饭，200克黑椒鸡胸肉和一盘西兰花",
            "练后加餐：1勺乳清蛋白粉配1根香蕉",
            "晚上吃了一碗紫米饭150克和煎三文鱼200克"
        )
    }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.25f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    val primaryAccent = if (mode == DictationMode.WORKOUT) NeonCyan else EmberOrange

    ModalBottomSheet(
        onDismissRequest = {
            speechHelper.stopListening()
            onDismiss()
        },
        sheetState = sheetState,
        containerColor = SurfaceCardDark,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .padding(bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(primaryAccent.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = primaryAccent,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = if (mode == DictationMode.WORKOUT) "口喷训练 · AI自动分类" else "口喷饮食 · AI营养计算",
                            color = TextPrimary,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = if (mode == DictationMode.WORKOUT) "说出动作、组数、次数与重量" else "说出吃什么、大概克数，自动计算卡路里",
                            color = TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.testTag("close_dictation_btn")
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = TextSecondary
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Microphone Big Button with Ripple
            Box(
                modifier = Modifier
                    .size(110.dp),
                contentAlignment = Alignment.Center
            ) {
                if (isListening) {
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .scale(pulseScale)
                            .clip(CircleShape)
                            .background(primaryAccent.copy(alpha = 0.25f))
                    )
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .scale(pulseScale * 0.9f)
                            .clip(CircleShape)
                            .background(primaryAccent.copy(alpha = 0.4f))
                    )
                }

                Surface(
                    onClick = {
                        if (isListening) {
                            speechHelper.stopListening()
                        } else {
                            if (hasAudioPermission) {
                                speechHelper.startListening()
                            } else {
                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    },
                    modifier = Modifier
                        .size(76.dp)
                        .testTag("mic_toggle_btn"),
                    shape = CircleShape,
                    color = if (isListening) primaryAccent else primaryAccent.copy(alpha = 0.15f),
                    border = androidx.compose.foundation.BorderStroke(2.dp, primaryAccent)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (isListening) Icons.Default.Mic else Icons.Default.Mic,
                            contentDescription = "Microphone",
                            tint = if (isListening) Color.Black else primaryAccent,
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = if (isListening) "正在聆听中... 尽管口喷！" else "点击上方麦克风开始录音，或在下方直接编辑",
                color = if (isListening) primaryAccent else TextSecondary,
                fontSize = 13.sp,
                fontWeight = if (isListening) FontWeight.Bold else FontWeight.Normal
            )

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = errorMessage ?: "",
                    color = EmberOrange,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Quick Example Tags
            Text(
                text = "快捷示例（点击快速填入）：",
                color = TextMuted,
                fontSize = 11.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 6.dp)
            )

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                samplePrompts.forEach { sample ->
                    Surface(
                        onClick = {
                            inputPromptText = sample
                            speechHelper.setText(sample)
                        },
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFF131A29),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                        modifier = Modifier.padding(bottom = 2.dp)
                    ) {
                        Text(
                            text = sample,
                            color = TextSecondary,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Input / Dictated Text Box
            OutlinedTextField(
                value = inputPromptText,
                onValueChange = {
                    inputPromptText = it
                    speechHelper.setText(it)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("dictation_input_field"),
                placeholder = {
                    Text(
                        text = if (mode == DictationMode.WORKOUT) "例如：今天练了卧推4组每组10次80公斤，深蹲3组100公斤" else "例如：中午吃了大米饭200克配200克鸡胸肉和一盘西兰花",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                },
                shape = RoundedCornerShape(16.dp),
                minLines = 3,
                maxLines = 5,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary,
                    focusedBorderColor = primaryAccent,
                    unfocusedBorderColor = Color(0xFF334155),
                    focusedContainerColor = Color(0xFF131A29),
                    unfocusedContainerColor = Color(0xFF131A29)
                )
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Submit Button
            Surface(
                onClick = {
                    if (inputPromptText.isNotBlank() && !isProcessing) {
                        speechHelper.stopListening()
                        onSubmitVoice(inputPromptText.trim())
                    }
                },
                enabled = inputPromptText.isNotBlank() && !isProcessing,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("submit_dictation_btn"),
                color = if (inputPromptText.isNotBlank()) primaryAccent else Color(0xFF334155)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (isProcessing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            color = Color.Black,
                            strokeWidth = 2.5.dp
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "AI 正在分析提取中...",
                            color = Color.Black,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = if (inputPromptText.isNotBlank()) Color.Black else TextMuted,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (mode == DictationMode.WORKOUT) "🤖 AI 识别并分类训练" else "🤖 AI 计算卡路里与营养素",
                            color = if (inputPromptText.isNotBlank()) Color.Black else TextMuted,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                }
            }
        }
    }
}
