package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "diet_logs")
data class DietLog(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val date: String, // format: YYYY-MM-DD
    val timestamp: Long = System.currentTimeMillis(),
    val mealType: String, // 早餐, 午餐, 晚餐, 加餐/补剂
    val foodSummary: String, // e.g. 鸡蛋2个(100g) + 脱脂牛奶(250ml)
    val calories: Double, // 总热量 (kcal)
    val proteinG: Double = 0.0, // 蛋白质 (g)
    val carbsG: Double = 0.0, // 碳水化合物 (g)
    val fatG: Double = 0.0, // 脂肪 (g)
    val rawVoiceInput: String = "", // 原始口喷输入
    val notes: String = ""
)
