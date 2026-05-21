package com.manwon.app

import android.os.Handler
import android.os.Looper
import kotlin.concurrent.thread

private val mainHandler = Handler(Looper.getMainLooper())

fun <T> runAsync(block: () -> T, result: (Result<T>) -> Unit) {
    thread(start = true) {
        val output = runCatching(block)
        mainHandler.post { result(output) }
    }
}
