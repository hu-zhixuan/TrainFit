package com.example.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.data.dao.DietDao
import com.example.data.dao.UserProfileDao
import com.example.data.dao.WorkoutDao
import com.example.data.model.DietLog
import com.example.data.model.UserProfile
import com.example.data.model.WorkoutLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@Database(
    entities = [WorkoutLog::class, DietLog::class, UserProfile::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun workoutDao(): WorkoutDao
    abstract fun dietDao(): DietDao
    abstract fun userProfileDao(): UserProfileDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "fitpulse_database"
                )
                .fallbackToDestructiveMigration()
                .addCallback(object : Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        // Prepopulate default user profile & sample initial history
                        CoroutineScope(Dispatchers.IO).launch {
                            val database = getDatabase(context)
                            database.userProfileDao().insertOrUpdateProfile(
                                UserProfile(
                                    id = 1,
                                    name = "力量探索者",
                                    gender = "male",
                                    age = 26,
                                    heightCm = 178.0,
                                    weightKg = 74.5,
                                    activityLevel = "moderate",
                                    targetDeficitKcal = 450.0,
                                    targetProteinG = 150.0,
                                    targetCarbsG = 200.0,
                                    targetFatG = 50.0,
                                    goalType = "fat_loss"
                                )
                            )
                            seedSampleData(database)
                        }
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }

        private suspend fun seedSampleData(database: AppDatabase) {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val cal = Calendar.getInstance()

            // Seed previous 4 days of workout & diet for immediate rich analytics and overload demo
            for (i in 4 downTo 0) {
                cal.time = Date()
                cal.add(Calendar.DAY_OF_YEAR, -i)
                val dateStr = sdf.format(cal.time)
                val baseTime = cal.timeInMillis

                when (i) {
                    4 -> {
                        // Chest day 4 days ago
                        database.workoutDao().insertWorkouts(
                            listOf(
                                WorkoutLog(date = dateStr, timestamp = baseTime + 3600000, exerciseName = "杠铃平板卧推", muscleGroup = "胸部", sets = 4, reps = 10, weightKg = 77.5, rpe = 8.0, caloriesBurned = 210.0, notes = "感觉不错，每组都能完整完成10次"),
                                WorkoutLog(date = dateStr, timestamp = baseTime + 7200000, exerciseName = "上斜哑铃卧推", muscleGroup = "胸部", sets = 4, reps = 12, weightKg = 24.0, rpe = 8.5, caloriesBurned = 160.0, notes = "上胸泵感强烈"),
                                WorkoutLog(date = dateStr, timestamp = baseTime + 10800000, exerciseName = "双杠臂屈伸", muscleGroup = "胸部", sets = 3, reps = 12, weightKg = 0.0, rpe = 7.5, caloriesBurned = 110.0, notes = "自重")
                            )
                        )
                        database.dietDao().insertDietLogs(
                            listOf(
                                DietLog(date = dateStr, timestamp = baseTime + 28800000, mealType = "早餐", foodSummary = "燕麦片60g + 煮鸡蛋2个 + 脱脂奶250ml", calories = 430.0, proteinG = 26.0, carbsG = 52.0, fatG = 12.0),
                                DietLog(date = dateStr, timestamp = baseTime + 43200000, mealType = "午餐", foodSummary = "糙米饭180g + 黑椒鸡胸肉200g + 西蓝花150g", calories = 550.0, proteinG = 51.0, carbsG = 60.0, fatG = 8.0),
                                DietLog(date = dateStr, timestamp = baseTime + 68400000, mealType = "晚餐", foodSummary = "蒸红薯150g + 香煎巴沙鱼200g + 生菜沙拉", calories = 480.0, proteinG = 42.0, carbsG = 45.0, fatG = 11.0)
                            )
                        )
                    }
                    3 -> {
                        // Back day 3 days ago
                        database.workoutDao().insertWorkouts(
                            listOf(
                                WorkoutLog(date = dateStr, timestamp = baseTime + 3600000, exerciseName = "传统硬拉", muscleGroup = "背部", sets = 4, reps = 8, weightKg = 120.0, rpe = 9.0, caloriesBurned = 280.0, notes = "核心收紧，最后两把略吃力"),
                                WorkoutLog(date = dateStr, timestamp = baseTime + 7200000, exerciseName = "高位下拉", muscleGroup = "背部", sets = 4, reps = 12, weightKg = 60.0, rpe = 8.0, caloriesBurned = 140.0, notes = "背阔肌发力充分")
                            )
                        )
                        database.dietDao().insertDietLogs(
                            listOf(
                                DietLog(date = dateStr, timestamp = baseTime + 28800000, mealType = "早餐", foodSummary = "全麦吐司2片 + 煎蛋2个 + 黑咖啡1杯", calories = 360.0, proteinG = 18.0, carbsG = 34.0, fatG = 14.0),
                                DietLog(date = dateStr, timestamp = baseTime + 43200000, mealType = "午餐", foodSummary = "杂粮饭200g + 卤牛肉180g + 炒菠菜", calories = 590.0, proteinG = 54.0, carbsG = 58.0, fatG = 12.0),
                                DietLog(date = dateStr, timestamp = baseTime + 68400000, mealType = "晚餐", foodSummary = "玉米1根 + 水煮鸡胸肉150g + 番茄汤", calories = 410.0, proteinG = 38.0, carbsG = 42.0, fatG = 6.0)
                            )
                        )
                    }
                    2 -> {
                        // Leg day 2 days ago
                        database.workoutDao().insertWorkouts(
                            listOf(
                                WorkoutLog(date = dateStr, timestamp = baseTime + 3600000, exerciseName = "杠铃深蹲", muscleGroup = "腿部", sets = 4, reps = 10, weightKg = 100.0, rpe = 8.5, caloriesBurned = 320.0, notes = "下蹲深度到位，准备挑战加片"),
                                WorkoutLog(date = dateStr, timestamp = baseTime + 7200000, exerciseName = "器械腿弯举", muscleGroup = "腿部", sets = 4, reps = 15, weightKg = 45.0, rpe = 8.0, caloriesBurned = 130.0, notes = "腘绳肌顶峰收缩")
                            )
                        )
                        database.dietDao().insertDietLogs(
                            listOf(
                                DietLog(date = dateStr, timestamp = baseTime + 28800000, mealType = "早餐", foodSummary = "无糖酸奶200g + 蓝莓50g + 蛋白粉1勺", calories = 310.0, proteinG = 32.0, carbsG = 22.0, fatG = 5.0),
                                DietLog(date = dateStr, timestamp = baseTime + 43200000, mealType = "午餐", foodSummary = "白米饭150g + 柠檬香草鸡腿肉200g + 芦笋", calories = 520.0, proteinG = 46.0, carbsG = 48.0, fatG = 14.0),
                                DietLog(date = dateStr, timestamp = baseTime + 68400000, mealType = "晚餐", foodSummary = "蒸南瓜200g + 虾仁200g + 清炒西葫芦", calories = 420.0, proteinG = 44.0, carbsG = 40.0, fatG = 4.0)
                            )
                        )
                    }
                    1 -> {
                        // Shoulder day yesterday
                        database.workoutDao().insertWorkouts(
                            listOf(
                                WorkoutLog(date = dateStr, timestamp = baseTime + 3600000, exerciseName = "杠铃站姿推举", muscleGroup = "肩部", sets = 4, reps = 10, weightKg = 45.0, rpe = 8.0, caloriesBurned = 200.0, notes = "站立稳定，已达成4组10次标靶"),
                                WorkoutLog(date = dateStr, timestamp = baseTime + 7200000, exerciseName = "哑铃侧平举", muscleGroup = "肩部", sets = 4, reps = 15, weightKg = 10.0, rpe = 9.0, caloriesBurned = 120.0, notes = "中束酸痛感强烈")
                            )
                        )
                        database.dietDao().insertDietLogs(
                            listOf(
                                DietLog(date = dateStr, timestamp = baseTime + 28800000, mealType = "早餐", foodSummary = "水煮蛋2个 + 豆浆300ml + 全麦面包1片", calories = 340.0, proteinG = 22.0, carbsG = 30.0, fatG = 12.0),
                                DietLog(date = dateStr, timestamp = baseTime + 43200000, mealType = "午餐", foodSummary = "紫米饭180g + 煎三文鱼180g + 西兰花", calories = 570.0, proteinG = 42.0, carbsG = 52.0, fatG = 18.0),
                                DietLog(date = dateStr, timestamp = baseTime + 68400000, mealType = "晚餐", foodSummary = "荞麦面60g + 卤鸡胸肉150g + 黄瓜", calories = 430.0, proteinG = 40.0, carbsG = 48.0, fatG = 5.0)
                            )
                        )
                    }
                    0 -> {
                        // Today's initial log
                        database.workoutDao().insertWorkouts(
                            listOf(
                                WorkoutLog(date = dateStr, timestamp = baseTime + 3600000, exerciseName = "杠铃平板卧推", muscleGroup = "胸部", sets = 4, reps = 10, weightKg = 80.0, rpe = 8.0, caloriesBurned = 230.0, notes = "成功加重到80kg并完成4组10次！", rawVoiceInput = "今天练了杠铃卧推4组每组10次80公斤")
                            )
                        )
                        database.dietDao().insertDietLogs(
                            listOf(
                                DietLog(date = dateStr, timestamp = baseTime + 28800000, mealType = "早餐", foodSummary = "燕麦奶咖啡 + 水煮蛋2个 + 香蕉1根", calories = 330.0, proteinG = 16.0, carbsG = 45.0, fatG = 9.0, rawVoiceInput = "早餐吃了2个水煮蛋一根香蕉和燕麦奶咖啡")
                            )
                        )
                    }
                }
            }
        }
    }
}
