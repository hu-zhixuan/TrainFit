package com.trainfit.app

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File

/**
 * 备份和分享用到的文件操作（给 NativeBridge 调）：
 *  - 分享一个文件 / 一张图片：写到 cache/share/，用 FileProvider 交给系统分享面板（微信、网盘…）
 *  - 存到手机公共目录（下载 / 相册）：卸载 App 后文件还在，重装后从「从备份恢复」选它就能导回来。
 *    用 MediaStore，只支持 Android 10 及以上；更老的系统返回空字符串，网页那边会提示用分享
 *  - 读用户选的文件（「从备份恢复」）
 */
object FileShare {
    private const val DIR = "练食AI"
    private const val MAX_READ = 30 * 1024 * 1024

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

    /** 存到「下载/练食AI/」，同名的（这次安装写过的）直接覆盖。返回给用户看的位置，失败返回 "" */
    fun saveToDownloads(context: Context, name: String, mime: String, text: String): String {
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
