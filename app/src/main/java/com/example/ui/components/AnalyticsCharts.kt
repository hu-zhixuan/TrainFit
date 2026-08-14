package com.example.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.repository.DailySummary
import com.example.ui.theme.ElectricLime
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.FireRed
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary
import kotlin.math.roundToInt

@Composable
fun DeficitTrendChart(
    summaries: List<DailySummary>,
    targetDeficit: Double = 450.0,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(ElectricLime.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.ShowChart,
                            contentDescription = null,
                            tint = ElectricLime,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "热量缺口动态走势 (kcal)",
                        color = TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(ElectricLime)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "目标: ${targetDeficit.roundToInt()}",
                        color = TextSecondary,
                        fontSize = 11.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            if (summaries.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("暂无足够天数的热量数据", color = TextMuted, fontSize = 13.sp)
                }
            } else {
                val displayList = summaries.takeLast(7)
                val maxDeficit = maxOf(targetDeficit * 1.5, displayList.maxOfOrNull { it.calorieDeficit } ?: 600.0)

                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(170.dp)
                ) {
                    val width = size.width
                    val height = size.height
                    val bottomPadding = 30.dp.toPx()
                    val chartHeight = height - bottomPadding
                    val barWidth = (width / (displayList.size * 2)).coerceIn(16.dp.toPx(), 36.dp.toPx())
                    val stepX = width / displayList.size

                    // Draw Target Deficit Guideline
                    val targetY = chartHeight * (1f - (targetDeficit / maxDeficit).toFloat().coerceIn(0f, 1f))
                    drawLine(
                        color = ElectricLime.copy(alpha = 0.4f),
                        start = Offset(0f, targetY),
                        end = Offset(width, targetY),
                        strokeWidth = 1.5.dp.toPx(),
                        pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(12f, 8f))
                    )

                    // Draw Baseline zero
                    val zeroY = chartHeight
                    drawLine(
                        color = Color(0xFF334155),
                        start = Offset(0f, zeroY),
                        end = Offset(width, zeroY),
                        strokeWidth = 1.dp.toPx()
                    )

                    // Draw bars
                    displayList.forEachIndexed { index, summary ->
                        val centerX = stepX * index + stepX / 2
                        val deficit = summary.calorieDeficit
                        val barHeight = (chartHeight * (deficit / maxDeficit).toFloat()).coerceIn(4f, chartHeight)
                        val topY = chartHeight - barHeight

                        val barBrush = if (deficit >= targetDeficit) {
                            Brush.verticalGradient(listOf(ElectricLime, Color(0xFF059669)))
                        } else if (deficit > 0) {
                            Brush.verticalGradient(listOf(NeonCyan, Color(0xFF0284C7)))
                        } else {
                            Brush.verticalGradient(listOf(FireRed, Color(0xFF991B1B)))
                        }

                        // Bar rect
                        drawRoundRect(
                            brush = barBrush,
                            topLeft = Offset(centerX - barWidth / 2, topY),
                            size = Size(barWidth, barHeight),
                            cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx())
                        )

                        // Date label below
                        val dateParts = summary.date.split("-")
                        val shortDate = if (dateParts.size == 3) "${dateParts[1]}/${dateParts[2]}" else summary.date

                        drawContext.canvas.nativeCanvas.apply {
                            val paint = android.graphics.Paint().apply {
                                color = android.graphics.Color.parseColor("#94A3B8")
                                textSize = 10.sp.toPx()
                                textAlign = android.graphics.Paint.Align.CENTER
                                isAntiAlias = true
                            }
                            drawText(shortDate, centerX, height - 6.dp.toPx(), paint)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WorkoutVolumeChart(
    summaries: List<DailySummary>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCardDark),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26324A))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(NeonCyan.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.FitnessCenter,
                            contentDescription = null,
                            tint = NeonCyan,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "训练容量/吨位 (kg)",
                        color = TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            val displayList = summaries.takeLast(7)
            val maxVolume = maxOf(1000.0, displayList.maxOfOrNull { it.totalWorkoutVolumeKg } ?: 5000.0)

            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
            ) {
                val width = size.width
                val height = size.height
                val bottomPadding = 30.dp.toPx()
                val chartHeight = height - bottomPadding
                val stepX = width / displayList.size

                val path = Path()
                var firstPoint = true

                displayList.forEachIndexed { index, summary ->
                    val centerX = stepX * index + stepX / 2
                    val vol = summary.totalWorkoutVolumeKg
                    val currentY = chartHeight * (1f - (vol / maxVolume).toFloat().coerceIn(0f, 1f))

                    if (firstPoint) {
                        path.moveTo(centerX, currentY)
                        firstPoint = false
                    } else {
                        path.lineTo(centerX, currentY)
                    }

                    // Dot
                    drawCircle(
                        color = NeonCyan,
                        radius = 4.dp.toPx(),
                        center = Offset(centerX, currentY)
                    )

                    // Date label below
                    val dateParts = summary.date.split("-")
                    val shortDate = if (dateParts.size == 3) "${dateParts[1]}/${dateParts[2]}" else summary.date

                    drawContext.canvas.nativeCanvas.apply {
                        val paint = android.graphics.Paint().apply {
                            color = android.graphics.Color.parseColor("#94A3B8")
                            textSize = 10.sp.toPx()
                            textAlign = android.graphics.Paint.Align.CENTER
                            isAntiAlias = true
                        }
                        drawText(shortDate, centerX, height - 6.dp.toPx(), paint)
                    }
                }

                drawPath(
                    path = path,
                    color = NeonCyan,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                )
            }
        }
    }
}
