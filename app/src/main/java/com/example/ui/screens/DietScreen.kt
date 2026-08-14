package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.data.model.DietLog
import com.example.ui.components.DictationMode
import com.example.ui.theme.ElectricLime
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary
import com.example.viewmodel.FitnessViewModel
import kotlin.math.roundToInt

@Composable
fun DietScreen(
    viewModel: FitnessViewModel,
    onOpenDictation: (DictationMode) -> Unit
) {
    val selectedDate by viewModel.selectedDate.collectAsState()
    val dietLogs by viewModel.dietLogsForSelectedDate.collectAsState()
    val profile by viewModel.userProfile.collectAsState()
    val daySummary by viewModel.currentDaySummary.collectAsState()

    var showManualAddDialog by remember { mutableStateOf(false) }

    val totalCalories = dietLogs.sumOf { it.calories }
    val totalProtein = dietLogs.sumOf { it.proteinG }
    val totalCarbs = dietLogs.sumOf { it.carbsG }
    val totalFat = dietLogs.sumOf { it.fatG }

    if (showManualAddDialog) {
        ManualDietDialog(
            currentDate = selectedDate,
            onConfirm = {
                viewModel.addManualDiet(it)
                showManualAddDialog = false
            },
            onDismiss = { showManualAddDialog = false }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "饮食与热量缺口记录",
                        color = TextPrimary,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = "$selectedDate 饮食明细与缺口追踪",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                }

                Surface(
                    onClick = { showManualAddDialog = true },
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155)),
                    modifier = Modifier.testTag("manual_add_diet_btn")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, tint = EmberOrange, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("手动记餐", color = EmberOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Voice Dictation Banner CTA (Requirement #2)
        item {
            Card(
                onClick = { onOpenDictation(DictationMode.DIET) },
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF431407)),
                border = androidx.compose.foundation.BorderStroke(1.5.dp, EmberOrange),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("open_voice_diet_cta")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(CircleShape)
                            .background(EmberOrange),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = null,
                            tint = Color.Black,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "🎙️ 开启口喷录入饮食",
                                color = TextPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = EmberOrange.copy(alpha = 0.2f)
                            ) {
                                Text(
                                    text = "AI 算克数与热量",
                                    color = EmberOrange,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = "例：\"中午吃了200克大米饭配200克鸡胸肉和一盘西兰花\"",
                            color = EmberOrange.copy(alpha = 0.9f),
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }

        // Daily Calorie Deficit Progress Monitor Widget (Requirement #3)
        item {
            val targetDeficit = profile.targetDeficitKcal
            val currentDeficit = daySummary.calorieDeficit
            val deficitRatio = if (targetDeficit > 0) (currentDeficit / targetDeficit).coerceIn(0.0, 1.5).toFloat() else 0f
            val isTargetMet = currentDeficit >= targetDeficit
            val isPositive = currentDeficit >= 0

            val statusColor = when {
                isTargetMet -> ElectricLime
                isPositive -> NeonCyan
                else -> Color(0xFFEF4444)
            }

            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, statusColor.copy(alpha = 0.4f)),
                modifier = Modifier.fillMaxWidth().testTag("diet_deficit_tracker_card")
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(CircleShape)
                                    .background(statusColor.copy(alpha = 0.2f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.LocalFireDepartment,
                                    contentDescription = null,
                                    tint = statusColor,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "今日热量缺口进度",
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = statusColor.copy(alpha = 0.15f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, statusColor.copy(alpha = 0.3f))
                        ) {
                            Text(
                                text = if (isTargetMet) "已达标 ${(deficitRatio * 100).roundToInt()}%" else if (isPositive) "进行中 ${(deficitRatio * 100).roundToInt()}%" else "热量盈余",
                                color = statusColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Big Deficit numbers
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        Column {
                            Text("当前已产生缺口", color = TextMuted, fontSize = 11.sp)
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(
                                    text = "${currentDeficit.roundToInt()}",
                                    color = statusColor,
                                    fontSize = 28.sp,
                                    fontWeight = FontWeight.Black
                                )
                                Text(
                                    text = " / ${targetDeficit.roundToInt()} kcal",
                                    color = TextSecondary,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(bottom = 3.dp, start = 4.dp)
                                )
                            }
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text("总消耗(TDEE+运动)", color = TextMuted, fontSize = 11.sp)
                            Text(
                                "${daySummary.totalBurned.roundToInt()} kcal",
                                color = TextPrimary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Progress Bar
                    LinearProgressIndicator(
                        progress = { deficitRatio.coerceIn(0f, 1f) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = statusColor,
                        trackColor = Color(0xFF1E293B)
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Balance formula text
                    val remainingCaloriesForDeficit = (daySummary.totalBurned - targetDeficit - totalCalories).coerceAtLeast(0.0)
                    Text(
                        text = "计算方式: 总消耗 ${daySummary.totalBurned.roundToInt()} kcal - 饮食摄入 ${totalCalories.roundToInt()} kcal = 净缺口 ${currentDeficit.roundToInt()} kcal (达成目标还可摄入约 ${remainingCaloriesForDeficit.roundToInt()} kcal)",
                        color = TextSecondary,
                        fontSize = 11.sp,
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Daily Calories & Macros Summary Card
        item {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("今日饮食摄入总量", color = TextMuted, fontSize = 12.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(
                                    text = "${totalCalories.roundToInt()}",
                                    color = EmberOrange,
                                    fontSize = 26.sp,
                                    fontWeight = FontWeight.Black
                                )
                                Text(
                                    text = " kcal",
                                    color = EmberOrange,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(bottom = 2.dp)
                                )
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFF131A29),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A))
                        ) {
                            Text(
                                text = "${dietLogs.size} 次进餐明细",
                                color = TextSecondary,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Macro breakdown pills
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        MacroStatBox("蛋白质", totalProtein, profile.targetProteinG, NeonCyan, Modifier.weight(1f))
                        MacroStatBox("碳水化合物", totalCarbs, profile.targetCarbsG, ElectricLime, Modifier.weight(1f))
                        MacroStatBox("脂肪", totalFat, profile.targetFatG, Color(0xFFFBBF24), Modifier.weight(1f))
                    }
                }
            }
        }

        // Meal Logs List
        if (dietLogs.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 36.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Restaurant,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(text = "今日暂无饮食记录", color = TextMuted, fontSize = 14.sp)
                        Text(text = "点击上方【口喷录入】快速添加", color = TextSecondary, fontSize = 12.sp)
                    }
                }
            }
        } else {
            items(dietLogs, key = { it.id }) { item ->
                DietItemCard(
                    diet = item,
                    onDelete = { viewModel.deleteDiet(item.id) }
                )
            }
        }
    }
}

@Composable
private fun MacroStatBox(
    name: String,
    current: Double,
    target: Double,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFF131A29),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(name, color = TextMuted, fontSize = 10.sp)
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                "${current.roundToInt()}g",
                color = accentColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { if (target > 0) (current / target).coerceIn(0.0, 1.0).toFloat() else 0f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = accentColor,
                trackColor = Color(0xFF1E293B)
            )
        }
    }
}

@Composable
fun DietItemCard(
    diet: DietLog,
    onDelete: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = EmberOrange.copy(alpha = 0.15f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, EmberOrange.copy(alpha = 0.3f))
                    ) {
                        Text(
                            text = diet.mealType,
                            color = EmberOrange,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "${diet.calories.roundToInt()} kcal",
                        color = EmberOrange,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete",
                        tint = TextMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = diet.foodSummary,
                color = TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("蛋白: ${diet.proteinG.roundToInt()}g", color = NeonCyan, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text("碳水: ${diet.carbsG.roundToInt()}g", color = ElectricLime, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text("脂肪: ${diet.fatG.roundToInt()}g", color = Color(0xFFFBBF24), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }

            if (diet.notes.isNotBlank() && diet.notes != diet.foodSummary) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF131A29))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = EmberOrange,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = diet.notes,
                        color = TextSecondary,
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}

@Composable
fun ManualDietDialog(
    currentDate: String,
    onConfirm: (DietLog) -> Unit,
    onDismiss: () -> Unit
) {
    var mealType by remember { mutableStateOf("午餐") }
    var foodSummary by remember { mutableStateOf("") }
    var calories by remember { mutableStateOf("450") }
    var protein by remember { mutableStateOf("30") }
    var carbs by remember { mutableStateOf("50") }
    var fat by remember { mutableStateOf("12") }

    val mealOptions = listOf("早餐", "午餐", "晚餐", "加餐/补剂")

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SurfaceCardDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155)),
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.Restaurant, contentDescription = null, tint = EmberOrange)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = "手动记录饮食", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(14.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    mealOptions.forEach { type ->
                        Surface(
                            onClick = { mealType = type },
                            shape = RoundedCornerShape(8.dp),
                            color = if (mealType == type) EmberOrange else Color(0xFF131A29),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                text = type,
                                color = if (mealType == type) Color.Black else TextSecondary,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(vertical = 6.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = foodSummary,
                    onValueChange = { foodSummary = it },
                    label = { Text("吃了什么 (如: 米饭200g + 鸡胸肉200g)") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = calories,
                        onValueChange = { calories = it },
                        label = { Text("热量(kcal)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1.2f),
                        shape = RoundedCornerShape(10.dp)
                    )
                    OutlinedTextField(
                        value = protein,
                        onValueChange = { protein = it },
                        label = { Text("蛋白(g)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = carbs,
                        onValueChange = { carbs = it },
                        label = { Text("碳水(g)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                    OutlinedTextField(
                        value = fat,
                        onValueChange = { fat = it },
                        label = { Text("脂肪(g)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                        Text("取消", color = TextSecondary)
                    }
                    Button(
                        onClick = {
                            if (foodSummary.isNotBlank()) {
                                onConfirm(
                                    DietLog(
                                        date = currentDate,
                                        timestamp = System.currentTimeMillis(),
                                        mealType = mealType,
                                        foodSummary = foodSummary.trim(),
                                        calories = calories.toDoubleOrNull() ?: 0.0,
                                        proteinG = protein.toDoubleOrNull() ?: 0.0,
                                        carbsG = carbs.toDoubleOrNull() ?: 0.0,
                                        fatG = fat.toDoubleOrNull() ?: 0.0
                                    )
                                )
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = EmberOrange, contentColor = Color.Black),
                        modifier = Modifier.weight(1.2f)
                    ) {
                        Text("保存", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
