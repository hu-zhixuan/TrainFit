package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "workout_logs")
data class WorkoutLog(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val date: String, // format: YYYY-MM-DD
    val timestamp: Long = System.currentTimeMillis(),
    val exerciseName: String, // e.g. 平板杠铃卧推, 杠铃深蹲, 罗马尼亚硬拉, 哑铃推肩
    val muscleGroup: String, // 胸部, 背部, 腿部, 肩部, 手臂, 核心, 有氧
    val sets: Int, // 组数 (e.g. 4)
    val reps: Int, // 每组次数 (e.g. 10)
    val weightKg: Double, // 训练重量 (e.g. 80.0)
    val rpe: Double = 8.0, // 自觉费力程度 (1-10)
    val caloriesBurned: Double = 0.0, // 估算热量消耗 (kcal)
    val rawVoiceInput: String = "", // 原始口喷记录
    val notes: String = "" // 备注或动作体会
) {
    val totalVolumeKg: Double
        get() = sets * reps * weightKg
}
