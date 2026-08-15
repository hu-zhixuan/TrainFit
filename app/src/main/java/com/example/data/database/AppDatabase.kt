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

@Database(
    entities = [WorkoutLog::class, DietLog::class, UserProfile::class],
    version = 2,
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
                    "trainfit_clean_db"
                )
                .fallbackToDestructiveMigration()
                .addCallback(object : Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        // Pure initial state: initialize clean default profile without any dummy history logs
                        CoroutineScope(Dispatchers.IO).launch {
                            val database = getDatabase(context)
                            database.userProfileDao().insertOrUpdateProfile(
                                UserProfile(
                                    id = 1,
                                    name = "训练者",
                                    gender = "male",
                                    age = 25,
                                    heightCm = 175.0,
                                    weightKg = 70.0,
                                    activityLevel = "moderate",
                                    targetDeficitKcal = 450.0,
                                    targetProteinG = 140.0,
                                    targetCarbsG = 220.0,
                                    targetFatG = 55.0,
                                    goalType = "fat_loss"
                                )
                            )
                        }
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
