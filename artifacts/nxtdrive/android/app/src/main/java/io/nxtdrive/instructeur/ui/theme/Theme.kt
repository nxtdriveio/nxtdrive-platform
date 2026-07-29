package io.nxtdrive.instructeur.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BrandBlue = Color(0xFF625BF6)
private val BrandBlueDark = Color(0xFF9E9AFF)
private val Mint = Color(0xFF10B981)
private val Canvas = Color(0xFFF6F7FB)
private val Surface = Color(0xFFFFFFFF)
private val Ink = Color(0xFF171A2B)

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE8E7FF),
    onPrimaryContainer = Color(0xFF242066),
    secondary = Mint,
    onSecondary = Color.White,
    background = Canvas,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF0F1F7),
    outline = Color(0xFFD9DBE7),
    error = Color(0xFFBA1A1A),
)

private val DarkColors = darkColorScheme(
    primary = BrandBlueDark,
    secondary = Color(0xFF5EE6B4),
    background = Color(0xFF11121B),
    surface = Color(0xFF191B27),
    surfaceVariant = Color(0xFF252735),
)

@Composable
fun NxtDriveTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
