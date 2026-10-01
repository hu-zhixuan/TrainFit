package com.trainfit.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var rootContainer: FrameLayout? = null
    private var barsLight = false
    private var pendingPermissionRequest: PermissionRequest? = null
    private lateinit var nativeBridge: NativeBridge
    private var pendingNativeMicCallback: ((Boolean) -> Unit)? = null
    private var pendingNotifCallback: ((Boolean) -> Unit)? = null
    private var pendingDocCallback: ((android.net.Uri?) -> Unit)? = null
    private var pendingTreeCallback: ((android.net.Uri?) -> Unit)? = null

    // 从备份恢复：让用户选文件（微信、网盘里存下来的）；选择器一打开就停在「下载/练食AI」
    private val openDocumentLauncher = registerForActivityResult(
        object : ActivityResultContracts.OpenDocument() {
            override fun createIntent(context: Context, input: Array<String>): Intent =
                super.createIntent(context, input).apply {
                    if (Build.VERSION.SDK_INT >= 26) putExtra(DocumentsContract.EXTRA_INITIAL_URI, FileShare.backupFolderUri())
                }
        }
    ) { uri ->
        val cb = pendingDocCallback
        pendingDocCallback = null
        cb?.invoke(uri)
    }

    // 一键找回：让用户授权「下载/练食AI」这个文件夹，我们自己在里面找记录最多的那份备份
    private val openTreeLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        val cb = pendingTreeCallback
        pendingTreeCallback = null
        cb?.invoke(uri)
    }

    // 通知权限（Android 13+）
    private val notifPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val cb = pendingNotifCallback
        pendingNotifCallback = null
        cb?.invoke(granted)
    }

    // 原生语音识别用的麦克风权限申请
    private val nativeMicPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        val cb = pendingNativeMicCallback
        pendingNativeMicCallback = null
        cb?.invoke(isGranted)
    }

    // Register runtime permission launcher for RECORD_AUDIO
    private val requestAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        val request = pendingPermissionRequest
        if (request != null) {
            if (isGranted) {
                request.grant(request.resources)
            } else {
                request.deny()
            }
            pendingPermissionRequest = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Configure Edge-to-Edge Dark Theme (#09090B)
        setupEdgeToEdgeDarkTheme()

        // 2. Native bridge (speech recognition + LLM calls) exposed to JS as window.TrainFitNative
        nativeBridge = NativeBridge(
            activity = this,
            evalJs = { js ->
                if (::webView.isInitialized) webView.evaluateJavascript(js, null)
            },
            requestMicPermission = { onResult ->
                pendingNativeMicCallback = onResult
                nativeMicPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            },
            onSystemBarsLight = { light -> applySystemBars(light) },
            requestNotifPermission = { onResult ->
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    pendingNotifCallback = onResult
                    notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    onResult(true)
                }
            },
            pickDocument = { onResult ->
                pendingDocCallback = onResult
                try {
                    openDocumentLauncher.launch(arrayOf("*/*"))
                } catch (e: Exception) {
                    pendingDocCallback = null
                    onResult(null)
                }
            },
            pickFolder = { onResult ->
                pendingTreeCallback = onResult
                try {
                    // 系统的授权页上没有说明，先提示一句要点哪里
                    Toast.makeText(this, "点下面的「使用此文件夹」，再点「允许」", Toast.LENGTH_LONG).show()
                    openTreeLauncher.launch(if (Build.VERSION.SDK_INT >= 26) FileShare.backupFolderUri() else null)
                } catch (e: Exception) {
                    pendingTreeCallback = null
                    onResult(null)
                }
            }
        )
        Reminders.ensureChannels(this)
        Reminders.scheduleAll(this)

        // 3. Instantiate and Configure Native WebView Container
        setupWebView()

        // 3. Configure Back Press Navigation for WebView History
        setupBackNavigation()

        // 4. 从微信等「用其他应用打开」备份文件（切深浅色重建时不再处理一遍）
        if (savedInstanceState == null) handleOpenIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOpenIntent(intent)
    }

    /** 别的 App 打开 / 分享过来的文件（备份）：读出来交给网页恢复 */
    private fun handleOpenIntent(intent: Intent?) {
        if (intent == null) return
        val uri: Uri? = when (intent.action) {
            Intent.ACTION_VIEW -> intent.data
            Intent.ACTION_SEND ->
                if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else getStreamLegacy(intent)
            else -> null
        }
        if (uri != null) nativeBridge.openedFile(uri)
    }

    @Suppress("DEPRECATION")
    private fun getStreamLegacy(intent: Intent): Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)

    private fun setupEdgeToEdgeDarkTheme() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        applySystemBars(false)
    }

    /** 状态栏、导航栏和页面留白跟随网页的深浅色 */
    private fun applySystemBars(light: Boolean) {
        barsLight = light
        val color = Color.parseColor(if (light) "#F4F4F3" else "#0B0B0D")
        window.statusBarColor = color
        window.navigationBarColor = color
        window.decorView.setBackgroundColor(color)
        rootContainer?.setBackgroundColor(color)
        if (::webView.isInitialized) webView.setBackgroundColor(color)

        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = light
        insetsController.isAppearanceLightNavigationBars = light
    }

    private fun setupWebView() {
        val darkBgColor = Color.parseColor(if (barsLight) "#F4F4F3" else "#0B0B0D")

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(darkBgColor)
        }

        // Configure WebSettings for high performance & offline persistence
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true // Prevent audio hijack on launch
            allowFileAccess = false
            allowContentAccess = false
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(false)
            displayZoomControls = false
            builtInZoomControls = false
        }

        webView.addJavascriptInterface(nativeBridge, "TrainFitNative")

        // Build WebViewAssetLoader mapping /assets/ to local app assets
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // Intercept asset requests & handle background render process crash recovery
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: RenderProcessGoneDetail?
            ): Boolean {
                // Prevent black screen & app crash if render process was killed in background
                if (view != null) {
                    val parent = view.parent as? ViewGroup
                    parent?.removeView(view)
                    view.destroy()
                    setupWebView()
                }
                return true
            }
        }

        // Handle On-Demand Audio Capture permission requests only
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return

                val resources = request.resources
                var requiresAudio = false
                for (resource in resources) {
                    if (resource == PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
                        requiresAudio = true
                        break
                    }
                }

                if (requiresAudio) {
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(resources)
                    } else {
                        pendingPermissionRequest = request
                        requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                } else {
                    request.grant(resources)
                }
            }
        }

        // 网页放进一个容器里，容器按系统栏和键盘的高度留边，避免内容被状态栏/键盘挡住
        val container = FrameLayout(this).apply {
            setBackgroundColor(darkBgColor)
            addView(webView)
        }
        ViewCompat.setOnApplyWindowInsetsListener(container) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
        rootContainer = container
        setContentView(container)
        ViewCompat.requestApplyInsets(container)

        // Load entry SPA from local assets
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onPause() {
        super.onPause()
        if (::nativeBridge.isInitialized) nativeBridge.cancelSystemSpeech()
        if (::webView.isInitialized) {
            webView.onPause()
            webView.pauseTimers()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::nativeBridge.isInitialized) nativeBridge.onAppResume()
        if (::webView.isInitialized) {
            webView.onResume()
            webView.resumeTimers()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) {
            webView.saveState(outState)
        }
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        if (::webView.isInitialized) {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onDestroy() {
        if (::nativeBridge.isInitialized) nativeBridge.shutdown()
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
