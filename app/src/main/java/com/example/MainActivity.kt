package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.ui.components.DietConfirmationDialog
import com.example.ui.components.DictationMode
import com.example.ui.components.VoiceDictationSheet
import com.example.ui.components.WorkoutConfirmationDialog
import com.example.ui.screens.DashboardScreen
import com.example.ui.screens.DietScreen
import com.example.ui.screens.HistoryAnalyticsScreen
import com.example.ui.screens.ProfileSettingsScreen
import com.example.ui.screens.ProgressiveOverloadScreen
import com.example.ui.screens.WorkoutScreen
import com.example.ui.theme.ElectricLime
import com.example.ui.theme.EmberOrange
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.ObsidianBg
import com.example.ui.theme.RoyalPurple
import com.example.ui.theme.SurfaceCardDark
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary
import com.example.viewmodel.AiParseState
import com.example.viewmodel.FitnessViewModel

sealed class AppDestination(val route: String, val title: String, val icon: ImageVector) {
    object Diet : AppDestination("diet", "饮食 · 缺口", Icons.Default.Restaurant)
    object Workout : AppDestination("workout", "训练 · 加片", Icons.Default.FitnessCenter)
    object History : AppDestination("history", "历史走势", Icons.Default.CalendarMonth)
    object Profile : AppDestination("profile", "档案", Icons.Default.LocalFireDepartment)
}

class MainActivity : ComponentActivity() {
    private val viewModel: FitnessViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme(darkTheme = true) {
                MainFitnessApp(viewModel = viewModel)
            }
        }
    }
}

@Composable
fun MainFitnessApp(viewModel: FitnessViewModel) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: AppDestination.Diet.route
    val snackbarHostState = remember { SnackbarHostState() }

    var dictationMode by remember { mutableStateOf<DictationMode?>(null) }
    val aiParseState by viewModel.aiParseState.collectAsState()

    val bottomNavItems = listOf(
        AppDestination.Diet,
        AppDestination.Workout,
        AppDestination.History
    )

    // Handle AI Error SnackBar
    LaunchedEffect(aiParseState) {
        if (aiParseState is AiParseState.Error) {
            snackbarHostState.showSnackbar((aiParseState as AiParseState.Error).message)
            viewModel.resetAiParseState()
        }
    }

    // Modal Confirmation Dialogs for AI extracted items
    when (val state = aiParseState) {
        is AiParseState.WorkoutExtracted -> {
            WorkoutConfirmationDialog(
                initialItems = state.items,
                rawVoiceText = state.rawText,
                onConfirm = { editedItems ->
                    viewModel.saveExtractedWorkouts(editedItems)
                },
                onDismiss = {
                    viewModel.resetAiParseState()
                }
            )
        }
        is AiParseState.DietExtracted -> {
            DietConfirmationDialog(
                initialResult = state.result,
                rawVoiceText = state.rawText,
                onConfirm = { editedResult ->
                    viewModel.saveExtractedDiet(editedResult)
                },
                onDismiss = {
                    viewModel.resetAiParseState()
                }
            )
        }
        else -> Unit
    }

    // Voice Dictation Sheet Bottom Sheet
    if (dictationMode != null) {
        VoiceDictationSheet(
            mode = dictationMode!!,
            isProcessing = aiParseState is AiParseState.Processing,
            onDismiss = {
                dictationMode = null
            },
            onSubmitVoice = { voiceText ->
                if (dictationMode == DictationMode.WORKOUT) {
                    viewModel.parseWorkoutVoice(voiceText)
                } else {
                    viewModel.parseDietVoice(voiceText)
                }
                dictationMode = null
            }
        )
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = ObsidianBg,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            if (currentRoute != AppDestination.Profile.route) {
                NavigationBar(
                    containerColor = SurfaceCardDark,
                    tonalElevation = 8.dp,
                    modifier = Modifier.clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                ) {
                    bottomNavItems.forEach { screen ->
                        val isSelected = currentRoute == screen.route
                        val activeColor = when (screen) {
                            AppDestination.Diet -> EmberOrange
                            AppDestination.Workout -> NeonCyan
                            AppDestination.History -> ElectricLime
                            else -> NeonCyan
                        }

                        NavigationBarItem(
                            icon = {
                                Icon(
                                    imageVector = screen.icon,
                                    contentDescription = screen.title,
                                    modifier = Modifier.size(22.dp)
                                )
                            },
                            label = {
                                Text(
                                    text = screen.title,
                                    fontSize = 11.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            selected = isSelected,
                            onClick = {
                                if (currentRoute != screen.route) {
                                    navController.navigate(screen.route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = activeColor,
                                selectedTextColor = activeColor,
                                unselectedIconColor = TextMuted,
                                unselectedTextColor = TextMuted,
                                indicatorColor = activeColor.copy(alpha = 0.15f)
                            ),
                            modifier = Modifier.testTag("nav_item_${screen.route}")
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(ObsidianBg)
        ) {
            NavHost(
                navController = navController,
                startDestination = AppDestination.Diet.route,
                enterTransition = { fadeIn() },
                exitTransition = { fadeOut() }
            ) {
                composable(AppDestination.Diet.route) {
                    DietScreen(
                        viewModel = viewModel,
                        onOpenDictation = { mode -> dictationMode = mode }
                    )
                }

                composable(AppDestination.Workout.route) {
                    WorkoutScreen(
                        viewModel = viewModel,
                        onOpenDictation = { mode -> dictationMode = mode }
                    )
                }

                composable(AppDestination.Overload.route) {
                    ProgressiveOverloadScreen(
                        viewModel = viewModel
                    )
                }

                composable(AppDestination.History.route) {
                    HistoryAnalyticsScreen(
                        viewModel = viewModel
                    )
                }

                composable(AppDestination.Profile.route) {
                    ProfileSettingsScreen(
                        viewModel = viewModel,
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}
