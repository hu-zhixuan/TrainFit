package com.trainfit.app

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File

/**
 * 备份和分享用到的文件操作（给 NativeBridge 调）：
 *  - 分享一个文件 / 一张图片：写到 cache/share/，用 FileProvider 交给系统分享面板（微信、网盘…）
 *  - 存到手机公共目录（下载 / 相册）：卸载 App 后文件还在。
 *    用 MediaStore，只支持 Android 10 及以上；更老的系统返回空字符串，网页那边会提示用分享
 *  - 重装后一键找回（照 Mihon 的做法）：系统的文件夹授权页一打开就停在「下载/练食AI」，
 *    用户点「使用此文件夹」→「允许」，我们在里面挑记录最多的那份备份读出来。授权会记住，
 *    之后的自动备份也写进这个文件夹的同一个文件（重装后 MediaStore 认不出以前的文件，会另起一个「(1)」）
 *  - 读用户选的文件 / 从微信「用其他应用打开」过来的文件
 */
object FileShare {
    private const val DIR = "练食AI"
    private const val MAX_READ = 30 * 1024 * 1024
    private const val PREFS = "trainfit_files"
    private const val KEY_TREE = "backup_tree"
    private const val EXTERNAL_DOCS = "com.android.externalstorage.documents"
    private const val BACKUP_PREFIX = "练食AI备份"

    private fun shareDir(context: Context): File = File(context.cacheDir, "share").apply { mkdirs() }

    /** 把文件交给系统分享面板 */
    fun share(context: Context, file: File, mime: String, title: String) {
        val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, title).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    fun shareText(context: Context, name: String, mime: String, text: String, title: String) {
        val file = File(shareDir(context), safeName(name))
        file.writeText(text, Charsets.UTF_8)
        share(context, file, mime, title)
    }

    fun shareImage(context: Context, name: String, base64Png: String, title: String) {
        val file = File(shareDir(context), safeName(name))
        file.writeBytes(decodePng(base64Png))
        share(context, file, "image/png", title)
    }

    /**
     * 存到「下载/练食AI/」，同名的直接覆盖。返回给用户看的位置，失败返回 ""。
     * 用户授权过文件夹（一键找回时）就写进那个文件夹；否则用 MediaStore（只认得这次安装写过的文件）
     */
    fun saveToDownloads(context: Context, name: String, mime: String, text: String): String {
        savedTree(context)?.let { tree ->
            try {
                val where = saveToTree(context, tree, name, mime, text)
                if (where.isNotEmpty()) return where
            } catch (e: Exception) {
                // 文件夹被删了、授权被收回：退回 MediaStore
            }
        }
        if (Build.VERSION.SDK_INT < 29) return ""
        return try {
            val uri = upsert(context, MediaStore.Downloads.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_DOWNLOADS, name, mime) ?: return ""
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) } ?: return ""
            "下载/$DIR/$name"
        } catch (e: Exception) {
            ""
        }
    }

    /** 存到相册「Pictures/练食AI/」。返回位置，失败返回 "" */
    fun saveImageToGallery(context: Context, name: String, base64Png: String): String {
        if (Build.VERSION.SDK_INT < 29) return ""
        return try {
            val uri = upsert(context, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_PICTURES, name, "image/png") ?: return ""
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(decodePng(base64Png)) } ?: return ""
            "相册/$DIR/$name"
        } catch (e: Exception) {
            ""
        }
    }

    /** 读用户选的文件；太大或读不了返回 null */
    fun readText(context: Context, uri: Uri): String? = try {
        context.contentResolver.openInputStream(uri)?.use { input ->
            val bytes = input.readBytes()
            if (bytes.size > MAX_READ) null else String(bytes, Charsets.UTF_8)
        }
    } catch (e: Exception) {
        null
    }

    // ================= 一键找回：用户授权的文件夹 =================

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 文件夹授权页一打开就停在「下载/练食AI」（Android 8 及以上） */
    fun backupFolderUri(): Uri = DocumentsContract.buildDocumentUri(EXTERNAL_DOCS, "primary:${Environment.DIRECTORY_DOWNLOADS}/$DIR")

    /** 记住用户给的文件夹（重启手机后也还能用） */
    fun rememberTree(context: Context, tree: Uri) {
        try {
            context.contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        } catch (e: Exception) {
            // 有的文件管理器不给长期授权：这次照样能读，只是自动备份还走 MediaStore
        }
        prefs(context).edit().putString(KEY_TREE, tree.toString()).apply()
    }

    private fun savedTree(context: Context): Uri? {
        val s = prefs(context).getString(KEY_TREE, null) ?: return null
        val uri = Uri.parse(s)
        val ok = context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isWritePermission }
        return if (ok) uri else null
    }

    private class Doc(val uri: Uri, val name: String, val modified: Long)

    private fun children(context: Context, tree: Uri): List<Doc> {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        val cols = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )
        val out = mutableListOf<Doc>()
        context.contentResolver.query(childrenUri, cols, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val id = c.getString(0) ?: continue
                val name = c.getString(1) ?: ""
                val modified = if (c.isNull(2)) 0L else c.getLong(2)
                out.add(Doc(DocumentsContract.buildDocumentUriUsingTree(tree, id), name, modified))
            }
        }
        return out
    }

    /**
     * 在用户给的文件夹里挑记录最多的那份备份读出来（一样多就挑最新的）；没有返回 null。
     * 不能只看最新：重装后新装的 App 认不出以前的文件，一记东西就另存一份「练食AI备份 (1).json」，
     * 里面只有重装后的几条，最新的反而是最小的（v3.7 用户踩到：恢复了个寂寞，提示「记录这里都有了」）。
     */
    fun readBestBackup(context: Context, tree: Uri): String? {
        val json = children(context, tree).filter { it.name.endsWith(".json", ignoreCase = true) }
        val mine = json.filter { it.name.startsWith(BACKUP_PREFIX) }.ifEmpty { json }
        var best: String? = null
        var bestCount = -1
        var bestTime = -1L
        for (doc in mine.sortedByDescending { it.modified }.take(30)) {
            val text = readText(context, doc.uri) ?: continue
            val n = recordCount(text)
            if (n < 0) continue // 不是我们的备份
            if (n > bestCount || (n == bestCount && doc.modified > bestTime)) {
                best = text
                bestCount = n
                bestTime = doc.modified
            }
        }
        return best
    }

    /** 备份里有几条记录（饮食 + 训练 + 体重）；不是练食AI的备份返回 -1 */
    private fun recordCount(text: String): Int = try {
        val data = org.json.JSONObject(text).optJSONObject("data")
        if (data == null) -1
        else listOf("fit_diet", "fit_workouts", "fit_weights").sumOf { data.optJSONArray(it)?.length() ?: 0 }
    } catch (_: Exception) { -1 }

    /** 写进用户给的文件夹，同名的覆盖。返回给用户看的位置 */
    private fun saveToTree(context: Context, tree: Uri, name: String, mime: String, text: String): String {
        val resolver = context.contentResolver
        val uri = children(context, tree).firstOrNull { it.name == name }?.uri
            ?: DocumentsContract.createDocument(
                resolver,
                DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)),
                mime,
                name
            )
            ?: return ""
        val bytes = text.toByteArray(Charsets.UTF_8)
        val out = try { resolver.openOutputStream(uri, "wt") } catch (e: Exception) { resolver.openOutputStream(uri, "rwt") }
        out?.use { it.write(bytes) } ?: return ""
        val folder = DocumentsContract.getTreeDocumentId(tree).substringAfter(':')
            .replaceFirst(Environment.DIRECTORY_DOWNLOADS, "下载")
        return if (folder.isBlank()) name else "$folder/$name"
    }

    /** 找这次安装自己写过的同名文件（覆盖它），没有就新建 */
    private fun upsert(context: Context, collection: Uri, topDir: String, name: String, mime: String): Uri? {
        val resolver = context.contentResolver
        val rel = "$topDir/$DIR/"
        resolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns._ID),
            "${MediaStore.MediaColumns.DISPLAY_NAME}=? AND ${MediaStore.MediaColumns.RELATIVE_PATH}=?",
            arrayOf(name, rel),
            null
        )?.use { c ->
            if (c.moveToFirst()) return ContentUris.withAppendedId(collection, c.getLong(0))
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, rel)
        }
        return resolver.insert(collection, values)
    }

    private fun decodePng(base64Png: String): ByteArray =
        Base64.decode(base64Png.substringAfter("base64,"), Base64.DEFAULT)

    private fun safeName(name: String) = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "trainfit" }
}
