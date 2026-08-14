package com.example.data.repository

import com.example.data.dao.DietDao
import com.example.data.dao.UserProfileDao
import com.example.data.dao.WorkoutDao
import com.example.data.model.DietLog
import com.example.data.model.UserProfile
import com.example.data.model.WorkoutLog
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class DailySummary(
    val date: String,
    val totalCaloriesConsumed: Double,
    val totalProteinG: Double,
    val totalCarbsG: Double,
    val totalFatG: Double,
    val workoutCaloriesBurned: Double,
    val totalWorkoutVolumeKg: Double,
    val workoutCount: Int,
    val mealsCount: Int,
    val tdee: Double,
    val totalBurned: Double,
    val calorieDeficit: Double // totalBurned - totalCaloriesConsumed (>0 means deficit, <0 means surplus)
)

data class ProgressiveOverloadAdvice(
    val exerciseName: String,
    val muscleGroup: String = "复合项",
    val currentWeightKg: Double,
    val currentSets: Int,
    val currentReps: Int,
    val status: String, // "READY_TO_ADD_PLATE" (可加片), "INCREASE_REPS" (增加次数), "MAINTAIN" (巩固姿态), "DELOAD" (减量恢复)
    val actionTitle: String, // e.g. "建议加片 +2.5 kg"
    val actionDetail: String, // e.g. "您已连续2次在当前重量达成目标组次，建议升级到 82.5kg x 6-8次"
    val targetWeightKg: Double,
    val targetSets: Int,
    val targetReps: Int,
    val confidenceScore: Double = 0.95
) {
    val recommendedWeightKg: Double get() = targetWeightKg
}

class FitnessRepository(
    private val workoutDao: WorkoutDao,
    private val dietDao: DietDao,
    private val userProfileDao: UserProfileDao
) {
    val allWorkoutLogs: Flow<List<WorkoutLog>> = workoutDao.getAllWorkoutLogs()
    val allDietLogs: Flow<List<DietLog>> = dietDao.getAllDietLogs()
    val userProfile: Flow<UserProfile?> = userProfileDao.getUserProfile()
    val distinctExercises: Flow<List<String>> = workoutDao.getAllDistinctExercises()

    fun getWorkoutsForDate(date: String): Flow<List<WorkoutLog>> = workoutDao.getWorkoutsForDate(date)
    fun getDietLogsForDate(date: String): Flow<List<DietLog>> = dietDao.getDietLogsForDate(date)
    fun getWorkoutsForExercise(exerciseName: String): Flow<List<WorkoutLog>> = workoutDao.getWorkoutsForExercise(exerciseName)

    suspend fun insertWorkout(workout: WorkoutLog): Long = workoutDao.insertWorkout(workout)
    suspend fun insertWorkouts(workouts: List<WorkoutLog>): List<Long> = workoutDao.insertWorkouts(workouts)
    suspend fun updateWorkout(workout: WorkoutLog) = workoutDao.updateWorkout(workout)
    suspend fun deleteWorkout(id: Int) = workoutDao.deleteWorkoutById(id)

    suspend fun insertDiet(diet: DietLog): Long = dietDao.insertDiet(diet)
    suspend fun insertDietLogs(diets: List<DietLog>): List<Long> = dietDao.insertDietLogs(diets)
    suspend fun updateDiet(diet: DietLog) = dietDao.updateDiet(diet)
    suspend fun deleteDiet(id: Int) = dietDao.deleteDietById(id)

    suspend fun updateProfile(profile: UserProfile) = userProfileDao.insertOrUpdateProfile(profile)
    suspend fun getUserProfileOnce(): UserProfile? = userProfileDao.getUserProfileOnce()

    suspend fun getWorkoutsForDateOnce(date: String): List<WorkoutLog> = workoutDao.getWorkoutsForDateOnce(date)
    suspend fun getDietLogsForDateOnce(date: String): List<DietLog> = dietDao.getDietLogsForDateOnce(date)

    // Calculate rule-based Progressive Overload heuristics across all recorded exercises
    suspend fun computeProgressiveOverloadAdvices(): List<ProgressiveOverloadAdvice> {
        val allWorkouts = mutableListOf<WorkoutLog>()
        // Fetch all exercise names and logs
        val mapByExercise = mutableMapOf<String, MutableList<WorkoutLog>>()
        // Collect latest workouts
        val exerciseList = listOf("杠铃平板卧推", "杠铃深蹲", "传统硬拉", "杠铃站姿推举", "上斜哑铃卧推", "哑铃侧平举", "高位下拉", "杠铃划船")
        
        val advices = mutableListOf<ProgressiveOverloadAdvice>()

        for (exercise in exerciseList) {
            val logs = workoutDao.getWorkoutsForExerciseOnce(exercise)
            if (logs.isNotEmpty()) {
                val latest = logs.last()
                val prev = if (logs.size >= 2) logs[logs.size - 2] else null

                // Rule-based progressive overload logic:
                // If user did >= 4 sets and reps >= 10 (or >= 8 for deadlift) with RPE <= 8.5
                val targetRepsGoal = if (exercise.contains("硬拉") || exercise.contains("深蹲")) 8 else 10
                val isCompound = exercise.contains("卧推") || exercise.contains("深蹲") || exercise.contains("硬拉") || exercise.contains("推举") || exercise.contains("划船")
                val increment = if (isCompound) 2.5 else 1.0
                val muscle = when {
                    exercise.contains("卧推") -> "胸部"
                    exercise.contains("深蹲") -> "腿部"
                    exercise.contains("硬拉") -> "背部/臀腿"
                    exercise.contains("推举") || exercise.contains("侧平举") -> "肩部"
                    exercise.contains("划船") || exercise.contains("下拉") -> "背部"
                    else -> "全身"
                }

                if (latest.reps >= targetRepsGoal && latest.sets >= 3 && latest.rpe <= 8.5) {
                    advices.add(
                        ProgressiveOverloadAdvice(
                            exerciseName = exercise,
                            muscleGroup = muscle,
                            currentWeightKg = latest.weightKg,
                            currentSets = latest.sets,
                            currentReps = latest.reps,
                            status = "READY_TO_ADD_PLATE",
                            actionTitle = "🚀 达成负荷标靶，建议加片 +${increment}kg",
                            actionDetail = "您最近一次【${latest.exerciseName}】以 ${latest.weightKg}kg 达成 ${latest.sets}组×${latest.reps}次（RPE ${latest.rpe}），动作稳定性极佳！建议下次上调至 ${(latest.weightKg + increment)}kg 进行 6~8 次冲刺！",
                            targetWeightKg = latest.weightKg + increment,
                            targetSets = latest.sets,
                            targetReps = maxOf(6, latest.reps - 2)
                        )
                    )
                } else if (latest.reps < targetRepsGoal) {
                    advices.add(
                        ProgressiveOverloadAdvice(
                            exerciseName = exercise,
                            muscleGroup = muscle,
                            currentWeightKg = latest.weightKg,
                            currentSets = latest.sets,
                            currentReps = latest.reps,
                            status = "INCREASE_REPS",
                            actionTitle = "📈 保持当前重量，冲击更多次数",
                            actionDetail = "当前重量 ${latest.weightKg}kg 距离标靶 (${targetRepsGoal}次) 还有提升空间，建议保持 ${latest.weightKg}kg 训练，尝试将每组次数推至 ${latest.reps + 1}~${targetRepsGoal} 次后再加片。",
                            targetWeightKg = latest.weightKg,
                            targetSets = latest.sets,
                            targetReps = latest.reps + 1
                        )
                    )
                } else {
                    advices.add(
                        ProgressiveOverloadAdvice(
                            exerciseName = exercise,
                            muscleGroup = muscle,
                            currentWeightKg = latest.weightKg,
                            currentSets = latest.sets,
                            currentReps = latest.reps,
                            status = "MAINTAIN",
                            actionTitle = "💪 巩固动作轨迹与向心控制",
                            actionDetail = "目前 ${latest.weightKg}kg ${latest.sets}组×${latest.reps}次 负荷适应中，注重向心离心节奏与顶峰收缩，蓄力下周冲击新PR。",
                            targetWeightKg = latest.weightKg,
                            targetSets = latest.sets,
                            targetReps = latest.reps
                        )
                    )
                }
            }
        }
        return advices
    }
}
