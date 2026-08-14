package com.example.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.ai.GeminiFitnessService
import com.example.data.ai.ParsedDietResult
import com.example.data.ai.ParsedWorkoutItem
import com.example.data.database.AppDatabase
import com.example.data.model.DietLog
import com.example.data.model.UserProfile
import com.example.data.model.WorkoutLog
import com.example.data.repository.DailySummary
import com.example.data.repository.FitnessRepository
import com.example.data.repository.ProgressiveOverloadAdvice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

sealed class AiParseState {
    object Idle : AiParseState()
    object Processing : AiParseState()
    data class WorkoutExtracted(val items: List<ParsedWorkoutItem>, val rawText: String) : AiParseState()
    data class DietExtracted(val result: ParsedDietResult, val rawText: String) : AiParseState()
    data class Error(val message: String) : AiParseState()
}

class FitnessViewModel(application: Application) : AndroidViewModel(application) {
    private val database = AppDatabase.getDatabase(application)
    private val repository = FitnessRepository(
        workoutDao = database.workoutDao(),
        dietDao = database.dietDao(),
        userProfileDao = database.userProfileDao()
    )
    private val geminiService = GeminiFitnessService()

    private val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    val todayStr: String = sdf.format(Date())

    private val _selectedDate = MutableStateFlow(todayStr)
    val selectedDate: StateFlow<String> = _selectedDate

    private val _selectedHistoryRange = MutableStateFlow("WEEK") // WEEK, MONTH, YEAR, ALL
    val selectedHistoryRange: StateFlow<String> = _selectedHistoryRange

    private val _aiParseState = MutableStateFlow<AiParseState>(AiParseState.Idle)
    val aiParseState: StateFlow<AiParseState> = _aiParseState

    private val _isAiAnalyzing = MutableStateFlow(false)
    val isAiAnalyzing: StateFlow<Boolean> = _isAiAnalyzing

    private val _aiOverloadInsight = MutableStateFlow<String>("")
    val aiOverloadInsight: StateFlow<String> = _aiOverloadInsight

    private val _progressiveOverloadAdvices = MutableStateFlow<List<ProgressiveOverloadAdvice>>(emptyList())
    val progressiveOverloadAdvices: StateFlow<List<ProgressiveOverloadAdvice>> = _progressiveOverloadAdvices

    val userProfile: StateFlow<UserProfile> = repository.userProfile
        .combine(MutableStateFlow(UserProfile())) { profile, default ->
            profile ?: default
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = UserProfile()
        )

    val allWorkoutLogs: StateFlow<List<WorkoutLog>> = repository.allWorkoutLogs
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val allDietLogs: StateFlow<List<DietLog>> = repository.allDietLogs
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    // Current selected day workouts
    val workoutsForSelectedDate: StateFlow<List<WorkoutLog>> = combine(
        allWorkoutLogs,
        _selectedDate
    ) { workouts, date ->
        workouts.filter { it.date == date }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    // Current selected day diet
    val dietLogsForSelectedDate: StateFlow<List<DietLog>> = combine(
        allDietLogs,
        _selectedDate
    ) { diets, date ->
        diets.filter { it.date == date }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    // Daily Summary (Deficit Calculation) for selected date
    val currentDaySummary: StateFlow<DailySummary> = combine(
        workoutsForSelectedDate,
        dietLogsForSelectedDate,
        userProfile,
        _selectedDate
    ) { workouts, diets, profile, date ->
        val totalCal = diets.sumOf { it.calories }
        val totalProtein = diets.sumOf { it.proteinG }
        val totalCarbs = diets.sumOf { it.carbsG }
        val totalFat = diets.sumOf { it.fatG }

        val workoutBurn = workouts.sumOf { it.caloriesBurned }
        val totalVolume = workouts.sumOf { it.totalVolumeKg }

        val tdee = profile.tdee
        val totalBurned = tdee + workoutBurn
        val deficit = totalBurned - totalCal // >0 means deficit

        DailySummary(
            date = date,
            totalCaloriesConsumed = totalCal,
            totalProteinG = totalProtein,
            totalCarbsG = totalCarbs,
            totalFatG = totalFat,
            workoutCaloriesBurned = workoutBurn,
            totalWorkoutVolumeKg = totalVolume,
            workoutCount = workouts.size,
            mealsCount = diets.size,
            tdee = tdee,
            totalBurned = totalBurned,
            calorieDeficit = deficit
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = DailySummary(
            date = todayStr,
            totalCaloriesConsumed = 0.0,
            totalProteinG = 0.0,
            totalCarbsG = 0.0,
            totalFatG = 0.0,
            workoutCaloriesBurned = 0.0,
            totalWorkoutVolumeKg = 0.0,
            workoutCount = 0,
            mealsCount = 0,
            tdee = 2200.0,
            totalBurned = 2200.0,
            calorieDeficit = 2200.0
        )
    )

    // Historical Summaries grouped by date within range
    val historySummaries: StateFlow<List<DailySummary>> = combine(
        allWorkoutLogs,
        allDietLogs,
        userProfile,
        _selectedHistoryRange
    ) { workouts, diets, profile, range ->
        val daysToInclude = when (range) {
            "WEEK" -> 7
            "MONTH" -> 30
            "YEAR" -> 365
            else -> 1000
        }

        val cal = Calendar.getInstance()
        val list = mutableListOf<DailySummary>()

        for (i in (daysToInclude - 1) downTo 0) {
            cal.time = Date()
            cal.add(Calendar.DAY_OF_YEAR, -i)
            val dStr = sdf.format(cal.time)

            val dayWorkouts = workouts.filter { it.date == dStr }
            val dayDiets = diets.filter { it.date == dStr }

            val totalCal = dayDiets.sumOf { it.calories }
            val totalProtein = dayDiets.sumOf { it.proteinG }
            val totalCarbs = dayDiets.sumOf { it.carbsG }
            val totalFat = dayDiets.sumOf { it.fatG }

            val workoutBurn = dayWorkouts.sumOf { it.caloriesBurned }
            val totalVolume = dayWorkouts.sumOf { it.totalVolumeKg }

            val tdee = profile.tdee
            val totalBurned = tdee + workoutBurn
            val deficit = totalBurned - totalCal

            // Only add if there is data or for weekly view
            if (dayWorkouts.isNotEmpty() || dayDiets.isNotEmpty() || daysToInclude <= 30) {
                list.add(
                    DailySummary(
                        date = dStr,
                        totalCaloriesConsumed = totalCal,
                        totalProteinG = totalProtein,
                        totalCarbsG = totalCarbs,
                        totalFatG = totalFat,
                        workoutCaloriesBurned = workoutBurn,
                        totalWorkoutVolumeKg = totalVolume,
                        workoutCount = dayWorkouts.size,
                        mealsCount = dayDiets.size,
                        tdee = tdee,
                        totalBurned = totalBurned,
                        calorieDeficit = deficit
                    )
                )
            }
        }
        list
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    init {
        refreshOverloadAdvices()
    }

    fun selectDate(date: String) {
        _selectedDate.value = date
    }

    fun selectHistoryRange(range: String) {
        _selectedHistoryRange.value = range
    }

    fun resetAiParseState() {
        _aiParseState.value = AiParseState.Idle
    }

    // Process Voice / Text dictation for Workout
    fun parseWorkoutVoice(voiceText: String) {
        if (voiceText.isBlank()) return
        viewModelScope.launch {
            _aiParseState.value = AiParseState.Processing
            try {
                val parsed = geminiService.parseWorkoutVoice(voiceText)
                if (parsed.isNotEmpty()) {
                    _aiParseState.value = AiParseState.WorkoutExtracted(parsed, voiceText)
                } else {
                    _aiParseState.value = AiParseState.Error("未能识别出健身项目，请尝试说清动作名称、组数和重量")
                }
            } catch (e: Exception) {
                _aiParseState.value = AiParseState.Error("解析异常: ${e.message}")
            }
        }
    }

    // Confirm & save extracted workouts
    fun saveExtractedWorkouts(items: List<ParsedWorkoutItem>, date: String = _selectedDate.value) {
        viewModelScope.launch {
            val entities = items.map { item ->
                WorkoutLog(
                    date = date,
                    timestamp = System.currentTimeMillis(),
                    exerciseName = item.exerciseName,
                    muscleGroup = item.muscleGroup,
                    sets = item.sets,
                    reps = item.reps,
                    weightKg = item.weightKg,
                    rpe = item.rpe,
                    caloriesBurned = item.estimatedCaloriesBurned,
                    rawVoiceInput = item.notes,
                    notes = item.notes
                )
            }
            repository.insertWorkouts(entities)
            _aiParseState.value = AiParseState.Idle
            refreshOverloadAdvices()
        }
    }

    // Process Voice / Text dictation for Diet
    fun parseDietVoice(voiceText: String) {
        if (voiceText.isBlank()) return
        viewModelScope.launch {
            _aiParseState.value = AiParseState.Processing
            try {
                val parsed = geminiService.parseDietVoice(voiceText)
                _aiParseState.value = AiParseState.DietExtracted(parsed, voiceText)
            } catch (e: Exception) {
                _aiParseState.value = AiParseState.Error("饮食解析异常: ${e.message}")
            }
        }
    }

    // Confirm & save extracted diet
    fun saveExtractedDiet(result: ParsedDietResult, date: String = _selectedDate.value) {
        viewModelScope.launch {
            val entity = DietLog(
                date = date,
                timestamp = System.currentTimeMillis(),
                mealType = result.mealType,
                foodSummary = result.foodSummary,
                calories = result.totalCalories,
                proteinG = result.proteinG,
                carbsG = result.carbsG,
                fatG = result.fatG,
                rawVoiceInput = result.advice,
                notes = result.advice
            )
            repository.insertDiet(entity)
            _aiParseState.value = AiParseState.Idle
        }
    }

    fun addManualWorkout(workout: WorkoutLog) {
        viewModelScope.launch {
            repository.insertWorkout(workout)
            refreshOverloadAdvices()
        }
    }

    fun deleteWorkout(id: Int) {
        viewModelScope.launch {
            repository.deleteWorkout(id)
            refreshOverloadAdvices()
        }
    }

    fun addManualDiet(diet: DietLog) {
        viewModelScope.launch {
            repository.insertDiet(diet)
        }
    }

    fun deleteDiet(id: Int) {
        viewModelScope.launch {
            repository.deleteDiet(id)
        }
    }

    fun updateUserProfile(profile: UserProfile) {
        viewModelScope.launch {
            repository.updateProfile(profile)
        }
    }

    fun refreshOverloadAdvices() {
        viewModelScope.launch {
            val advices = repository.computeProgressiveOverloadAdvices()
            _progressiveOverloadAdvices.value = advices
        }
    }

    fun generateAiOverloadAnalysis(targetExercise: String? = null) {
        viewModelScope.launch {
            _isAiAnalyzing.value = true
            try {
                val profile = userProfile.value
                val profileStr = "身高: ${profile.heightCm}cm, 体重: ${profile.weightKg}kg, 目标: ${if (profile.goalType == "fat_loss") "减脂塑形" else "增肌进阶"}, TDEE: ${profile.tdee.toInt()} kcal"

                val recentWorkouts = allWorkoutLogs.value.take(15).joinToString("\n") {
                    "日期: ${it.date} | 动作: ${it.exerciseName} | ${it.sets}组 x ${it.reps}次 @ ${it.weightKg}kg (RPE ${it.rpe}) | 备注: ${it.notes}"
                }

                val insight = geminiService.getAiOverloadCoachAdvice(profileStr, recentWorkouts, targetExercise)
                _aiOverloadInsight.value = insight
            } catch (e: Exception) {
                _aiOverloadInsight.value = "AI分析生成失败: ${e.message}"
            } finally {
                _isAiAnalyzing.value = false
            }
        }
    }
}
