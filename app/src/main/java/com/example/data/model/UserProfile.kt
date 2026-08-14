package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "user_profile")
data class UserProfile(
    @PrimaryKey val id: Int = 1,
    val name: String = "健身达人",
    val gender: String = "male", // male, female
    val age: Int = 25,
    val heightCm: Double = 175.0,
    val weightKg: Double = 72.0,
    val activityLevel: String = "moderate", // sedentary, light, moderate, active, extreme
    val targetDeficitKcal: Double = 400.0, // 每日目标热量缺口
    val targetProteinG: Double = 140.0, // 目标蛋白质 (g)
    val targetCarbsG: Double = 220.0, // 目标碳水 (g)
    val targetFatG: Double = 55.0, // 目标脂肪 (g)
    val goalType: String = "fat_loss" // fat_loss (减脂), muscle_gain (增肌), maintenance (维持)
) {
    // Mifflin-St Jeor Formula for BMR
    val bmr: Double
        get() {
            return if (gender.lowercase() == "female") {
                (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
            } else {
                (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
            }
        }

    // TDEE (Total Daily Energy Expenditure) without specific workout
    val tdee: Double
        get() {
            val multiplier = when (activityLevel) {
                "sedentary" -> 1.2
                "light" -> 1.375
                "moderate" -> 1.55
                "active" -> 1.725
                "extreme" -> 1.9
                else -> 1.55
            }
            return bmr * multiplier
        }
}
