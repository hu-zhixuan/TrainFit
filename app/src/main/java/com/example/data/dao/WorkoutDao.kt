package com.example.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.example.data.model.WorkoutLog
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutDao {
    @Query("SELECT * FROM workout_logs ORDER BY timestamp DESC")
    fun getAllWorkoutLogs(): Flow<List<WorkoutLog>>

    @Query("SELECT * FROM workout_logs WHERE date = :date ORDER BY timestamp ASC")
    fun getWorkoutsForDate(date: String): Flow<List<WorkoutLog>>

    @Query("SELECT * FROM workout_logs WHERE date = :date ORDER BY timestamp ASC")
    suspend fun getWorkoutsForDateOnce(date: String): List<WorkoutLog>

    @Query("SELECT * FROM workout_logs WHERE exerciseName = :exerciseName ORDER BY timestamp ASC")
    fun getWorkoutsForExercise(exerciseName: String): Flow<List<WorkoutLog>>

    @Query("SELECT * FROM workout_logs WHERE exerciseName = :exerciseName ORDER BY timestamp ASC")
    suspend fun getWorkoutsForExerciseOnce(exerciseName: String): List<WorkoutLog>

    @Query("SELECT DISTINCT exerciseName FROM workout_logs ORDER BY exerciseName ASC")
    fun getAllDistinctExercises(): Flow<List<String>>

    @Query("SELECT DISTINCT date FROM workout_logs ORDER BY date DESC")
    fun getAllWorkoutDates(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkout(workout: WorkoutLog): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkouts(workouts: List<WorkoutLog>): List<Long>

    @Update
    suspend fun updateWorkout(workout: WorkoutLog)

    @Query("DELETE FROM workout_logs WHERE id = :id")
    suspend fun deleteWorkoutById(id: Int)

    @Query("DELETE FROM workout_logs")
    suspend fun deleteAllWorkouts()
}
