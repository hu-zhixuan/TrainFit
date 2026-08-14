package com.example.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.example.data.model.DietLog
import kotlinx.coroutines.flow.Flow

@Dao
interface DietDao {
    @Query("SELECT * FROM diet_logs ORDER BY timestamp DESC")
    fun getAllDietLogs(): Flow<List<DietLog>>

    @Query("SELECT * FROM diet_logs WHERE date = :date ORDER BY timestamp ASC")
    fun getDietLogsForDate(date: String): Flow<List<DietLog>>

    @Query("SELECT * FROM diet_logs WHERE date = :date ORDER BY timestamp ASC")
    suspend fun getDietLogsForDateOnce(date: String): List<DietLog>

    @Query("SELECT DISTINCT date FROM diet_logs ORDER BY date DESC")
    fun getAllDietDates(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDiet(diet: DietLog): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDietLogs(diets: List<DietLog>): List<Long>

    @Update
    suspend fun updateDiet(diet: DietLog)

    @Query("DELETE FROM diet_logs WHERE id = :id")
    suspend fun deleteDietById(id: Int)

    @Query("DELETE FROM diet_logs")
    suspend fun deleteAllDietLogs()
}
