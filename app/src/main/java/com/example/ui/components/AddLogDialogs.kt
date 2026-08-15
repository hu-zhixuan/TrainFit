package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import com.example.data.ai.ParsedDietResult
import kotlin.math.roundToInt
import com.example.data.ai.ParsedWorkoutItem
import com.example.data.model.DietLog
import com.example.data.model.WorkoutLog
import com.example.ui.theme.ElectricLime
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.SurfaceCardLight
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

@Composable
fun WorkoutConfirmationDialog(
    initialItems: List<ParsedWorkoutItem>,
    rawVoiceText: String,
    onConfirm: (List<ParsedWorkoutItem>) -> Unit,
    onDismiss: () -> Unit
) {
    val items = remember { mutableStateListOf<ParsedWorkoutItem>().apply { addAll(initialItems) } }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SurfaceCardDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, NeonCyan.copy(alpha = 0.5f)),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(NeonCyan.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = NeonCyan,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "AI 识别到 ${items.size} 项训练",
                            color = TextPrimary,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "请核对或修改项目、组数与重量",
                            color = TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Items list
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    itemsIndexed(items) { index, item ->
                        var name by remember { mutableStateOf(item.exerciseName) }
                        var muscle by remember { mutableStateOf(item.muscleGroup) }
                        var sets by remember { mutableStateOf(item.sets.toString()) }
                        var reps by remember { mutableStateOf(item.reps.toString()) }
                        var weight by remember { mutableStateOf(item.weightKg.toString()) }

                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF131A29)),
                            shape = RoundedCornerShape(16.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = "#${index + 1}",
                                            color = NeonCyan,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = NeonCyan.copy(alpha = 0.15f)
                                        ) {
                                            Text(
                                                text = muscle,
                                                color = NeonCyan,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    IconButton(
                                        onClick = { items.removeAt(index) },
                                        modifier = Modifier.size(28.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Delete,
                                            contentDescription = "Remove",
                                            tint = TextMuted,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                OutlinedTextField(
                                    value = name,
                                    onValueChange = {
                                        name = it
                                        items[index] = items[index].copy(exerciseName = it)
                                    },
                                    label = { Text("动作名称", fontSize = 11.sp) },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedTextColor = TextPrimary,
                                        unfocusedTextColor = TextPrimary,
                                        focusedBorderColor = NeonCyan,
                                        unfocusedBorderColor = Color(0xFF334155)
                                    )
                                )

                                Spacer(modifier = Modifier.height(8.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    OutlinedTextField(
                                        value = sets,
                                        onValueChange = {
                                            sets = it
                                            val num = it.toIntOrNull() ?: 1
                                            items[index] = items[index].copy(sets = num)
                                        },
                                        label = { Text("组数(组)", fontSize = 11.sp) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedTextColor = TextPrimary,
                                            unfocusedTextColor = TextPrimary
                                        )
                                    )

                                    OutlinedTextField(
                                        value = reps,
                                        onValueChange = {
                                            reps = it
                                            val num = it.toIntOrNull() ?: 1
                                            items[index] = items[index].copy(reps = num)
                                        },
                                        label = { Text("每组(次)", fontSize = 11.sp) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedTextColor = TextPrimary,
                                            unfocusedTextColor = TextPrimary
                                        )
                                    )

                                    OutlinedTextField(
                                        value = weight,
                                        onValueChange = {
                                            weight = it
                                            val num = it.toDoubleOrNull() ?: 0.0
                                            items[index] = items[index].copy(weightKg = num)
                                        },
                                        label = { Text("重量(kg)", fontSize = 11.sp) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        modifier = Modifier.weight(1.2f),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedTextColor = TextPrimary,
                                            unfocusedTextColor = TextPrimary
                                        )
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Actions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary)
                    ) {
                        Text("取消")
                    }

                    Button(
                        onClick = { onConfirm(items) },
                        modifier = Modifier
                            .weight(1.5f)
                            .testTag("confirm_workout_btn"),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = NeonCyan,
                            contentColor = Color.Black
                        )
                    ) {
                        Icon(imageVector = Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("确认存入记录", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun DietConfirmationDialog(
    initialResult: ParsedDietResult,
    rawVoiceText: String,
    onConfirm: (ParsedDietResult) -> Unit,
    onDismiss: () -> Unit
) {
    var mealType by remember { mutableStateOf(initialResult.mealType) }
    var foodSummary by remember { mutableStateOf(initialResult.foodSummary) }
    var calories by remember { mutableStateOf(initialResult.totalCalories.roundToInt().toString()) }
    var protein by remember { mutableStateOf(initialResult.proteinG.roundToInt().toString()) }
    var carbs by remember { mutableStateOf(initialResult.carbsG.roundToInt().toString()) }
    var fat by remember { mutableStateOf(initialResult.fatG.roundToInt().toString()) }
    var foodItems by remember { mutableStateOf(initialResult.items) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SurfaceCardDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, EmberOrange.copy(alpha = 0.5f)),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp)
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Header
                item {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(EmberOrange.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Restaurant,
                                contentDescription = null,
                                tint = EmberOrange,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "口喷饮食 · AI营养识别",
                                color = TextPrimary,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "已自动计算食物克数与热量营养",
                                color = TextSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                // Spoken raw voice reminder if available
                if (rawVoiceText.isNotBlank()) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFF131A29),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("🎙️", fontSize = 14.sp)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "语音识别: \"$rawVoiceText\"",
                                    color = TextSecondary,
                                    fontSize = 12.sp,
                                    fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
                                )
                            }
                        }
                    }
                }

                // Meal Type selector
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf("早餐", "午餐", "晚餐", "加餐/补剂").forEach { type ->
                            Surface(
                                onClick = { mealType = type },
                                shape = RoundedCornerShape(10.dp),
                                color = if (mealType == type) EmberOrange else Color(0xFF131A29),
                                border = androidx.compose.foundation.BorderStroke(1.dp, if (mealType == type) EmberOrange else Color(0xFF26324A)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = type,
                                    color = if (mealType == type) Color.Black else TextSecondary,
                                    fontWeight = if (mealType == type) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(vertical = 6.dp),
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }
                }

                // Food Items Breakdown List (Estimated Grams + Calculated Calories per item)
                if (foodItems.isNotEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(Color(0xFF131A29))
                                .border(1.dp, Color(0xFF26324A), RoundedCornerShape(14.dp))
                                .padding(12.dp)
                        ) {
                            Text(
                                text = "识别到的食物明细 (克数与热量)",
                                color = TextPrimary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(8.dp))

                            foodItems.forEach { item ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 3.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(
                                            modifier = Modifier
                                                .size(6.dp)
                                                .clip(CircleShape)
                                                .background(EmberOrange)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "${item.name} (${item.estimatedGrams.roundToInt()}g)",
                                            color = TextPrimary,
                                            fontSize = 13.sp
                                        )
                                    }
                                    Text(
                                        text = "${item.calories.roundToInt()} kcal",
                                        color = EmberOrange,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }

                item {
                    OutlinedTextField(
                        value = foodSummary,
                        onValueChange = { foodSummary = it },
                        label = { Text("食物摘要", fontSize = 11.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            focusedBorderColor = EmberOrange,
                            unfocusedBorderColor = Color(0xFF334155)
                        )
                    )
                }

                // Nutrient inputs
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = calories,
                            onValueChange = { calories = it },
                            label = { Text("总热量(kcal)", fontSize = 11.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1.2f),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = EmberOrange,
                                unfocusedTextColor = TextPrimary
                            )
                        )

                        OutlinedTextField(
                            value = protein,
                            onValueChange = { protein = it },
                            label = { Text("蛋白质(g)", fontSize = 11.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = NeonCyan,
                                unfocusedTextColor = TextPrimary
                            )
                        )
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = carbs,
                            onValueChange = { carbs = it },
                            label = { Text("碳水(g)", fontSize = 11.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = ElectricLime,
                                unfocusedTextColor = TextPrimary
                            )
                        )

                        OutlinedTextField(
                            value = fat,
                            onValueChange = { fat = it },
                            label = { Text("脂肪(g)", fontSize = 11.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color(0xFFFBBF24),
                                unfocusedTextColor = TextPrimary
                            )
                        )
                    }
                }

                if (initialResult.advice.isNotBlank()) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFF131A29),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = null,
                                    tint = EmberOrange,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = initialResult.advice,
                                    color = TextSecondary,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }

                // Actions
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedButton(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary)
                        ) {
                            Text("取消")
                        }

                        Button(
                            onClick = {
                                val result = initialResult.copy(
                                    mealType = mealType,
                                    foodSummary = foodSummary,
                                    totalCalories = calories.toDoubleOrNull() ?: 0.0,
                                    proteinG = protein.toDoubleOrNull() ?: 0.0,
                                    carbsG = carbs.toDoubleOrNull() ?: 0.0,
                                    fatG = fat.toDoubleOrNull() ?: 0.0,
                                    items = foodItems
                                )
                                onConfirm(result)
                            },
                            modifier = Modifier
                                .weight(1.5f)
                                .testTag("confirm_diet_btn"),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = EmberOrange,
                                contentColor = Color.Black
                            )
                        ) {
                            Icon(imageVector = Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("确认存入饮食", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ManualWorkoutDialog(
    currentDate: String,
    onConfirm: (WorkoutLog) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var muscle by remember { mutableStateOf("胸部") }
    var sets by remember { mutableStateOf("4") }
    var reps by remember { mutableStateOf("10") }
    var weight by remember { mutableStateOf("60.0") }
    var rpe by remember { mutableStateOf("8.0") }
    var notes by remember { mutableStateOf("") }

    val muscleOptions = listOf("胸部", "背部", "腿部", "肩部", "手臂", "核心", "有氧")

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SurfaceCardDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155)),
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.FitnessCenter, contentDescription = null, tint = NeonCyan)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = "手动添加训练动作", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("动作名称 (如: 杠铃平板卧推)") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = TextPrimary, unfocusedTextColor = TextPrimary)
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Muscle picker
                Text(text = "所属肌群：", color = TextSecondary, fontSize = 12.sp)
                Spacer(modifier = Modifier.height(4.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    muscleOptions.take(4).forEach { m ->
                        Surface(
                            onClick = { muscle = m },
                            shape = RoundedCornerShape(8.dp),
                            color = if (muscle == m) NeonCyan else Color(0xFF131A29),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                text = m,
                                color = if (muscle == m) Color.Black else TextSecondary,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(vertical = 6.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    muscleOptions.drop(4).forEach { m ->
                        Surface(
                            onClick = { muscle = m },
                            shape = RoundedCornerShape(8.dp),
                            color = if (muscle == m) NeonCyan else Color(0xFF131A29),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                text = m,
                                color = if (muscle == m) Color.Black else TextSecondary,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(vertical = 6.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = sets,
                        onValueChange = { sets = it },
                        label = { Text("组数") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                    OutlinedTextField(
                        value = reps,
                        onValueChange = { reps = it },
                        label = { Text("次数") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                    OutlinedTextField(
                        value = weight,
                        onValueChange = { weight = it },
                        label = { Text("重量(kg)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1.2f),
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
                            if (name.isNotBlank()) {
                                val s = sets.toIntOrNull() ?: 4
                                val r = reps.toIntOrNull() ?: 10
                                val w = weight.toDoubleOrNull() ?: 0.0
                                onConfirm(
                                    WorkoutLog(
                                        date = currentDate,
                                        timestamp = System.currentTimeMillis(),
                                        exerciseName = name.trim(),
                                        muscleGroup = muscle,
                                        sets = s,
                                        reps = r,
                                        weightKg = w,
                                        rpe = rpe.toDoubleOrNull() ?: 8.0,
                                        caloriesBurned = s * r * 4.0,
                                        notes = notes
                                    )
                                )
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black),
                        modifier = Modifier.weight(1.2f)
                    ) {
                        Text("保存", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ==================== Barbell Plate Calculator (杠铃片配重计算器) ====================
@Composable
fun BarbellPlateCalculatorDialog(
    initialWeightKg: Double = 80.0,
    onDismiss: () -> Unit
) {
    var weightText by remember { mutableStateOf(initialWeightKg.roundToInt().toString()) }
    val currentWeight = weightText.toDoubleOrNull() ?: 20.0
    val targetWeight = currentWeight.coerceAtLeast(20.0)
    val barWeight = 20.0
    val netWeight = (targetWeight - barWeight).coerceAtLeast(0.0)
    val perSideWeight = netWeight / 2.0

    val availablePlates = listOf(25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 1.25)
    val platesPerSide = remember(perSideWeight) {
        val result = mutableListOf<Double>()
        var remaining = perSideWeight
        for (p in availablePlates) {
            while (remaining >= p - 0.01) {
                result.add(p)
                remaining = kotlin.math.round((remaining - p) * 100) / 100.0
            }
        }
        result
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SurfaceCardDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, NeonCyan.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier.size(38.dp).clip(CircleShape).background(NeonCyan.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.FitnessCenter, contentDescription = null, tint = NeonCyan, modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("🏋️ 杠铃配重算片器", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                            Text("告别大脑缺氧算片，单边装片一目了然", color = TextSecondary, fontSize = 11.sp)
                        }
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = TextMuted)
                    }
                }

                // Weight Input & Steppers
                Column {
                    Text("目标总重量 (含20kg标准奥林匹克杆)", color = TextMuted, fontSize = 11.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedButton(
                            onClick = {
                                val next = (targetWeight - 2.5).coerceAtLeast(20.0)
                                weightText = if (next % 1.0 == 0.0) next.roundToInt().toString() else next.toString()
                            },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.size(44.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("-2.5", color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }

                        OutlinedTextField(
                            value = weightText,
                            onValueChange = { weightText = it },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = NeonCyan,
                                unfocusedTextColor = NeonCyan,
                                focusedBorderColor = NeonCyan,
                                unfocusedBorderColor = Color(0xFF334155)
                            ),
                            textStyle = androidx.compose.ui.text.TextStyle(
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp
                            )
                        )

                        OutlinedButton(
                            onClick = {
                                val next = targetWeight + 2.5
                                weightText = if (next % 1.0 == 0.0) next.roundToInt().toString() else next.toString()
                            },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.size(44.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("+2.5", color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Barbell Visual Schematic
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF131A29))
                        .border(1.dp, Color(0xFF26324A), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        // Left plates
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                            platesPerSide.asReversed().forEach { p ->
                                PlateDiscView(p)
                            }
                        }
                        // Sleeve & Collar & Bar
                        Box(modifier = Modifier.width(4.dp).height(30.dp).background(Color(0xFF64748B)))
                        Box(
                            modifier = Modifier.width(40.dp).height(18.dp).background(Color(0xFF94A3B8)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("20kg", color = Color.Black, fontSize = 9.sp, fontWeight = FontWeight.Black)
                        }
                        Box(modifier = Modifier.width(4.dp).height(30.dp).background(Color(0xFF64748B)))
                        // Right plates
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                            platesPerSide.forEach { p ->
                                PlateDiscView(p)
                            }
                        }
                    }
                }

                // Summary Text
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF131A29))
                        .padding(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("单侧配重: ", color = TextMuted, fontSize = 12.sp)
                        Text("${perSideWeight} kg", color = NeonCyan, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    val plateSummary = if (platesPerSide.isEmpty()) {
                        "无需挂片 (使用20kg空杆)"
                    } else {
                        val counts = platesPerSide.groupingBy { it }.eachCount()
                        counts.entries.joinToString(" + ") { "${it.key}kg × ${it.value}块" }
                    }
                    Text("👉 每边装片: $plateSummary", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }

                // Confirm button
                Button(
                    onClick = onDismiss,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("✓ 明白，去举铁", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun PlateDiscView(weightKg: Double) {
    val (color, height, width) = when (weightKg) {
        25.0 -> Triple(Color(0xFFEF4444), 48.dp, 10.dp)
        20.0 -> Triple(Color(0xFF3B82F6), 44.dp, 9.dp)
        15.0 -> Triple(Color(0xFFEAB308), 40.dp, 8.dp)
        10.0 -> Triple(Color(0xFF22C55E), 36.dp, 7.dp)
        5.0 -> Triple(Color(0xFFF8FAFC), 30.dp, 6.dp)
        2.5 -> Triple(Color(0xFF1E293B), 24.dp, 5.dp)
        else -> Triple(Color(0xFF64748B), 20.dp, 5.dp)
    }
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .clip(RoundedCornerShape(2.dp))
            .background(color)
            .border(0.5.dp, Color.Black.copy(alpha = 0.3f), RoundedCornerShape(2.dp))
    )
}

// ==================== Custom Macros Dialog (自定义碳蛋脂弹窗) ====================
@Composable
fun CustomMacrosDialog(
    currentProteinG: Double,
    currentCarbsG: Double,
    currentFatG: Double,
    weightKg: Double = 70.0,
    targetCalories: Double = 2000.0,
    onSave: (protein: Double, carbs: Double, fat: Double) -> Unit,
    onDismiss: () -> Unit
) {
    var pStr by remember { mutableStateOf(currentProteinG.roundToInt().toString()) }
    var cStr by remember { mutableStateOf(currentCarbsG.roundToInt().toString()) }
    var fStr by remember { mutableStateOf(currentFatG.roundToInt().toString()) }

    val pVal = pStr.toDoubleOrNull() ?: 140.0
    val cVal = cStr.toDoubleOrNull() ?: 240.0
    val fVal = fStr.toDoubleOrNull() ?: 55.0
    val totalCal = (pVal * 4 + cVal * 4 + fVal * 9).roundToInt()
    val safeTotal = totalCal.coerceAtLeast(1)
    val pPct = ((pVal * 4 / safeTotal) * 100).roundToInt()
    val cPct = ((cVal * 4 / safeTotal) * 100).roundToInt()
    val fPct = (100 - pPct - cPct).coerceAtLeast(0)

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SurfaceCardDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, EmberOrange.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(38.dp).clip(CircleShape).background(EmberOrange.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.LocalFireDepartment, contentDescription = null, tint = EmberOrange, modifier = Modifier.size(20.dp))
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text("🎯 自定义碳蛋脂摄入", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                                Text("精准匹配高蛋白刷脂、生酮或增肌", color = TextSecondary, fontSize = 11.sp)
                            }
                        }
                        IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = TextMuted)
                        }
                    }
                }

                // 4 Fitness Presets
                item {
                    Text("💡 健身经典方案一键带入", color = TextMuted, fontSize = 11.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            PresetChip("🌟高蛋白刷脂 4:4:2", modifier = Modifier.weight(1f)) {
                                pStr = (weightKg * 2.2).roundToInt().toString()
                                fStr = (weightKg * 0.7).roundToInt().toString()
                                val curP = pStr.toDouble()
                                val curF = fStr.toDouble()
                                cStr = (((targetCalories - curP * 4 - curF * 9) / 4).coerceAtLeast(40.0)).roundToInt().toString()
                            }
                            PresetChip("⚖️均衡减脂 4:4:2", modifier = Modifier.weight(1f)) {
                                pStr = (weightKg * 1.6).roundToInt().toString()
                                fStr = (weightKg * 0.8).roundToInt().toString()
                                val curP = pStr.toDouble()
                                val curF = fStr.toDouble()
                                cStr = (((targetCalories - curP * 4 - curF * 9) / 4).coerceAtLeast(50.0)).roundToInt().toString()
                            }
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            PresetChip("🚀增肌充碳 5:3:2", modifier = Modifier.weight(1f)) {
                                pStr = (weightKg * 1.8).roundToInt().toString()
                                fStr = (weightKg * 0.7).roundToInt().toString()
                                val curP = pStr.toDouble()
                                val curF = fStr.toDouble()
                                cStr = (((targetCalories - curP * 4 - curF * 9) / 4).coerceAtLeast(80.0)).roundToInt().toString()
                            }
                            PresetChip("🥑低碳生酮 2:1:7", modifier = Modifier.weight(1f)) {
                                cStr = (weightKg * 0.5).roundToInt().toString()
                                pStr = (weightKg * 2.0).roundToInt().toString()
                                val curC = cStr.toDouble()
                                val curP = pStr.toDouble()
                                fStr = (((targetCalories - curP * 4 - curC * 4) / 9).coerceAtLeast(30.0)).roundToInt().toString()
                            }
                        }
                    }
                }

                // Inputs for P, C, F
                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = pStr,
                            onValueChange = { pStr = it },
                            label = { Text("蛋白(g)", fontSize = 10.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = NeonCyan, unfocusedTextColor = NeonCyan)
                        )
                        OutlinedTextField(
                            value = cStr,
                            onValueChange = { cStr = it },
                            label = { Text("碳水(g)", fontSize = 10.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = ElectricLime, unfocusedTextColor = ElectricLime)
                        )
                        OutlinedTextField(
                            value = fStr,
                            onValueChange = { fStr = it },
                            label = { Text("脂肪(g)", fontSize = 10.sp) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = EmberOrange, unfocusedTextColor = EmberOrange)
                        )
                    }
                }

                // Dynamic Ratio Bar
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF131A29))
                            .padding(12.dp)
                    ) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("宏量能量核算", color = TextMuted, fontSize = 11.sp)
                            Text("$totalCal kcal", color = EmberOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(16.dp)
                                .clip(RoundedCornerShape(8.dp))
                        ) {
                            if (pPct > 0) Box(modifier = Modifier.weight(pPct.toFloat().coerceAtLeast(0.1f)).fillMaxHeight().background(NeonCyan), contentAlignment = Alignment.Center) {
                                Text("蛋$pPct%", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                            }
                            if (cPct > 0) Box(modifier = Modifier.weight(cPct.toFloat().coerceAtLeast(0.1f)).fillMaxHeight().background(ElectricLime), contentAlignment = Alignment.Center) {
                                Text("碳$cPct%", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                            }
                            if (fPct > 0) Box(modifier = Modifier.weight(fPct.toFloat().coerceAtLeast(0.1f)).fillMaxHeight().background(EmberOrange), contentAlignment = Alignment.Center) {
                                Text("脂$fPct%", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Actions
                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                            Text("取消", color = TextSecondary)
                        }
                        Button(
                            onClick = {
                                onSave(pVal, cVal, fVal)
                                onDismiss()
                            },
                            modifier = Modifier.weight(1.2f),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = EmberOrange, contentColor = Color.Black)
                        ) {
                            Text("保存配比", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PresetChip(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFF131A29),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
        modifier = modifier
    ) {
        Text(
            text = text,
            color = TextSecondary,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
    }
}
