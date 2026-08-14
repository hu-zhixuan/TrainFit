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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import com.example.data.model.UserProfile
import com.example.ui.theme.ElectricLime
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.RoyalPurple
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary
import com.example.viewmodel.FitnessViewModel
import kotlin.math.roundToInt

@Composable
fun ProfileSettingsScreen(
    viewModel: FitnessViewModel,
    onNavigateBack: () -> Unit
) {
    val currentProfile by viewModel.userProfile.collectAsState()

    var height by remember(currentProfile) { mutableStateOf(currentProfile.heightCm.toString()) }
    var weight by remember(currentProfile) { mutableStateOf(currentProfile.weightKg.toString()) }
    var age by remember(currentProfile) { mutableStateOf(currentProfile.age.toString()) }
    var gender by remember(currentProfile) { mutableStateOf(currentProfile.gender) }
    var goalType by remember(currentProfile) { mutableStateOf(currentProfile.goalType) }
    var targetDeficit by remember(currentProfile) { mutableStateOf(currentProfile.targetDeficitKcal.toString()) }
    var targetProtein by remember(currentProfile) { mutableStateOf(currentProfile.targetProteinG.toString()) }
    var targetCarbs by remember(currentProfile) { mutableStateOf(currentProfile.targetCarbsG.toString()) }
    var targetFat by remember(currentProfile) { mutableStateOf(currentProfile.targetFatG.toString()) }

    var saveSuccess by remember { mutableStateOf(false) }

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
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                IconButton(onClick = onNavigateBack) {
                    Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        text = "个人身体档案与目标设定",
                        color = TextPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = "计算基础代谢(BMR)、TDEE与目标热量缺口",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                }
            }
        }

        // BMR & TDEE Auto-calculation Card
        item {
            val h = height.toDoubleOrNull() ?: 175.0
            val w = weight.toDoubleOrNull() ?: 72.0
            val a = age.toIntOrNull() ?: 26
            val isMale = gender == "male"
            val bmr = if (isMale) (10 * w + 6.25 * h - 5 * a + 5) else (10 * w + 6.25 * h - 5 * a - 161)
            val calculatedTdee = bmr * 1.45

            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, NeonCyan.copy(alpha = 0.5f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = NeonCyan, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("人体代谢评估 (Mifflin-St Jeor公式)", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("基础代谢 (BMR)", color = TextMuted, fontSize = 11.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("${bmr.roundToInt()} kcal", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                        Box(modifier = Modifier.width(1.dp).height(30.dp).background(Color(0xFF334155)))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("日常总消耗 (TDEE)", color = TextMuted, fontSize = 11.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("${calculatedTdee.roundToInt()} kcal", color = NeonCyan, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Body metrics inputs
        item {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("基础身体指标", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(12.dp))

                    // Gender toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        listOf("male" to "男性 ♂", "female" to "女性 ♀").forEach { (gKey, gLabel) ->
                            val isSel = gender == gKey
                            Surface(
                                onClick = { gender = gKey },
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSel) NeonCyan else Color(0xFF131A29),
                                border = androidx.compose.foundation.BorderStroke(1.dp, if (isSel) NeonCyan else Color(0xFF334155)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = gLabel,
                                    color = if (isSel) Color.Black else TextSecondary,
                                    fontWeight = if (isSel) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = height,
                            onValueChange = { height = it },
                            label = { Text("身高(cm)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        OutlinedTextField(
                            value = weight,
                            onValueChange = { weight = it },
                            label = { Text("体重(kg)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        OutlinedTextField(
                            value = age,
                            onValueChange = { age = it },
                            label = { Text("年龄") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                }
            }
        }

        // Fitness Goal & Deficit Target
        item {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("阶段健身目标与热量缺口", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        listOf("fat_loss" to "减脂塑形 (保持热量缺口)", "muscle_gain" to "增肌增力 (微量盈余/平账)").forEach { (goalKey, goalLabel) ->
                            val isSel = goalType == goalKey
                            Surface(
                                onClick = {
                                    goalType = goalKey
                                    if (goalKey == "fat_loss") targetDeficit = "450" else targetDeficit = "0"
                                },
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSel) ElectricLime else Color(0xFF131A29),
                                border = androidx.compose.foundation.BorderStroke(1.dp, if (isSel) ElectricLime else Color(0xFF334155)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = goalLabel,
                                    color = if (isSel) Color.Black else TextSecondary,
                                    fontWeight = if (isSel) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = targetDeficit,
                        onValueChange = { targetDeficit = it },
                        label = { Text("每日目标热量缺口 (kcal)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedTextColor = ElectricLime, unfocusedTextColor = TextPrimary)
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = targetProtein,
                            onValueChange = { targetProtein = it },
                            label = { Text("蛋白目标(g)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        OutlinedTextField(
                            value = targetCarbs,
                            onValueChange = { targetCarbs = it },
                            label = { Text("碳水目标(g)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        OutlinedTextField(
                            value = targetFat,
                            onValueChange = { targetFat = it },
                            label = { Text("脂肪目标(g)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                }
            }
        }

        // Save Button
        item {
            Button(
                onClick = {
                    val h = height.toDoubleOrNull() ?: 175.0
                    val w = weight.toDoubleOrNull() ?: 72.0
                    val a = age.toIntOrNull() ?: 26
                    val isMale = gender == "male"
                    val bmr = if (isMale) (10 * w + 6.25 * h - 5 * a + 5) else (10 * w + 6.25 * h - 5 * a - 161)
                    val tdee = bmr * 1.45

                    val updated = currentProfile.copy(
                        gender = gender,
                        heightCm = h,
                        weightKg = w,
                        age = a,
                        goalType = goalType,
                        targetDeficitKcal = targetDeficit.toDoubleOrNull() ?: 450.0,
                        targetProteinG = targetProtein.toDoubleOrNull() ?: 140.0,
                        targetCarbsG = targetCarbs.toDoubleOrNull() ?: 240.0,
                        targetFatG = targetFat.toDoubleOrNull() ?: 55.0
                    )
                    viewModel.updateUserProfile(updated)
                    saveSuccess = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("save_profile_btn"),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black)
            ) {
                Icon(imageVector = Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (saveSuccess) "✓ 保存成功" else "保存身体档案与热量目标", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
        }
    }
}
