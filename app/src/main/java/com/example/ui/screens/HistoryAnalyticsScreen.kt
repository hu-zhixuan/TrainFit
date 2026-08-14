package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.DietLog
import com.example.data.model.WorkoutLog
import com.example.data.repository.DailySummary
import com.example.ui.components.DeficitTrendChart
import com.example.ui.components.WorkoutVolumeChart
import com.example.ui.theme.ElectricLime
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.FireRed
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary
import com.example.viewmodel.FitnessViewModel
import kotlin.math.roundToInt

@Composable
fun HistoryAnalyticsScreen(
    viewModel: FitnessViewModel
) {
    val selectedRange by viewModel.selectedHistoryRange.collectAsState()
    val historySummaries by viewModel.historySummaries.collectAsState()
    val allWorkouts by viewModel.allWorkoutLogs.collectAsState()
    val allDiets by viewModel.allDietLogs.collectAsState()
    val profile by viewModel.userProfile.collectAsState()

    val rangeOptions = listOf(
        "WEEK" to "本周",
        "MONTH" to "本月",
        "YEAR" to "今年",
        "ALL" to "全部历史"
    )

    val totalDeficit = historySummaries.sumOf { it.calorieDeficit }
    val avgDeficit = if (historySummaries.isNotEmpty()) totalDeficit / historySummaries.size else 0.0
    val totalVolume = historySummaries.sumOf { it.totalWorkoutVolumeKg }
    val activeWorkoutDays = historySummaries.count { it.workoutCount > 0 }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        item {
            Column {
                Text(
                    text = "历史周期回看",
                    color = TextPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black
                )
                Text(
                    text = "多周期热量缺口走势与训练项目历史",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
        }

        // Period Switcher (本周 / 本月 / 今年 / 全部)
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                rangeOptions.forEach { (rangeKey, label) ->
                    val isSelected = selectedRange == rangeKey
                    Surface(
                        onClick = { viewModel.selectHistoryRange(rangeKey) },
                        shape = RoundedCornerShape(12.dp),
                        color = if (isSelected) NeonCyan else SurfaceCardDark,
                        border = androidx.compose.foundation.BorderStroke(1.dp, if (isSelected) NeonCyan else Color(0xFF26324A)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = label,
                            color = if (isSelected) Color.Black else TextSecondary,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(vertical = 8.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }

        // Aggregate Stats Card
        item {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "周期核心数据总览",
                        color = TextSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("累计热量缺口", color = TextMuted, fontSize = 11.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "${totalDeficit.roundToInt()} kcal",
                                color = if (totalDeficit >= 0) ElectricLime else FireRed,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Column {
                            Text("日均热量缺口", color = TextMuted, fontSize = 11.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "${avgDeficit.roundToInt()} kcal",
                                color = TextPrimary,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Column {
                            Text("累计训练吨位", color = TextMuted, fontSize = 11.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "${totalVolume.roundToInt()} kg",
                                color = NeonCyan,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Column {
                            Text("举铁天数", color = TextMuted, fontSize = 11.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "$activeWorkoutDays 天",
                                color = EmberOrange,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // Deficit Trend Chart (Requirement #3 & #5)
        item {
            DeficitTrendChart(
                summaries = historySummaries,
                targetDeficit = profile.targetDeficitKcal
            )
        }

        // Workout Volume Trend Chart
        item {
            WorkoutVolumeChart(
                summaries = historySummaries
            )
        }

        // Section: Day-by-Day Detailed History Timeline (Requirement #5)
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.CalendarMonth,
                    contentDescription = null,
                    tint = NeonCyan,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "每日详细记录明细 (${historySummaries.size}天)",
                    color = TextPrimary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        if (historySummaries.isEmpty()) {
            item {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = SurfaceCardDark,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "选定周期暂无记录数据",
                        color = TextMuted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        } else {
            items(historySummaries.reversed()) { summary ->
                val dayWorkouts = allWorkouts.filter { it.date == summary.date }
                val dayDiets = allDiets.filter { it.date == summary.date }

                DailyHistoryTimelineCard(
                    summary = summary,
                    workouts = dayWorkouts,
                    diets = dayDiets
                )
            }
        }
    }
}

@Composable
fun DailyHistoryTimelineCard(
    summary: DailySummary,
    workouts: List<WorkoutLog>,
    diets: List<DietLog>
) {
    var isExpanded by remember { mutableStateOf(false) }

    val isDeficitPositive = summary.calorieDeficit >= 0
    val badgeColor = if (isDeficitPositive) ElectricLime else FireRed

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { isExpanded = !isExpanded }
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Summary Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = summary.date,
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "训练 ${workouts.size} 项 · 进餐 ${diets.size} 次",
                        color = TextSecondary,
                        fontSize = 11.sp
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = badgeColor.copy(alpha = 0.15f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, badgeColor.copy(alpha = 0.4f))
                    ) {
                        Text(
                            text = if (isDeficitPositive) "缺口 +${summary.calorieDeficit.roundToInt()} kcal" else "盈余 ${summary.calorieDeficit.roundToInt()} kcal",
                            color = badgeColor,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    Icon(
                        imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        tint = TextMuted,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // Expanded Details
            AnimatedVisibility(visible = isExpanded) {
                Column(modifier = Modifier.padding(top = 14.dp)) {
                    // Quick Stats Bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF131A29))
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        Text("总消耗: ${summary.totalBurned.roundToInt()}kcal", color = TextSecondary, fontSize = 11.sp)
                        Text("摄入: ${summary.totalCaloriesConsumed.roundToInt()}kcal", color = EmberOrange, fontSize = 11.sp)
                        Text("容量: ${summary.totalWorkoutVolumeKg.roundToInt()}kg", color = NeonCyan, fontSize = 11.sp)
                    }

                    // Workout Items for that day
                    if (workouts.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.FitnessCenter, contentDescription = null, tint = NeonCyan, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("当天训练项目：", color = NeonCyan, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        workouts.forEach { w ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("• ${w.exerciseName} (${w.muscleGroup})", color = TextPrimary, fontSize = 12.sp)
                                Text("${w.sets}组 × ${w.reps}次 @ ${w.weightKg}kg", color = TextSecondary, fontSize = 12.sp)
                            }
                        }
                    }

                    // Diet Items for that day
                    if (diets.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Restaurant, contentDescription = null, tint = EmberOrange, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("当天饮食摄入：", color = EmberOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        diets.forEach { d ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("• [${d.mealType}] ${d.foodSummary}", color = TextPrimary, fontSize = 12.sp)
                                Text("${d.calories.roundToInt()} kcal", color = EmberOrange, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
