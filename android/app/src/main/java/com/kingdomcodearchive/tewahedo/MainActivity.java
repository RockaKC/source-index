package com.kingdomcodearchive.tewahedo;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Opens the app in one smooth movement. The launch screen stays up until the first page has been drawn behind it, then fades
 * away to show the page, so there is no blank or grey screen between the launch screen and the app. Whatever happens, the
 * launch screen is gone after MAX_WAIT_MS, so a page that never finishes loading cannot keep the reader out.
 */
public class MainActivity extends BridgeActivity {
    private static final long MAX_WAIT_MS = 3000;   // the longest the launch screen is held
    private static final long FRAME_MS = 64;        // a few frames after the page loads, so it is painted before the fade
    private static final long FADE_MS = 220;

    private volatile boolean pageReady = false;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);                            // before super.onCreate, which starts the bridge
        SplashScreen splash = SplashScreen.installSplashScreen(this);   // before super.onCreate; also swaps in the app's own theme
        splash.setKeepOnScreenCondition(() -> !pageReady);
        splash.setOnExitAnimationListener(provider ->
            provider.getView().animate().alpha(0f).setDuration(FADE_MS).withEndAction(provider::remove).start());

        super.onCreate(savedInstanceState);

        main.postDelayed(this::markReady, MAX_WAIT_MS);
        if (getBridge() == null) { markReady(); return; }
        WebView web = getBridge().getWebView();
        if (web != null) web.setBackgroundColor(ContextCompat.getColor(this, R.color.splash_background));   // the page's own colour behind the page (values/ and values-night/), so nothing flashes white or grey while it loads
        getBridge().addWebViewListener(new WebViewListener() {
            @Override public void onPageLoaded(WebView view) { main.postDelayed(MainActivity.this::markReady, FRAME_MS); }
            @Override public void onReceivedError(WebView view) { markReady(); }
        });
    }

    private void markReady() {
        if (pageReady) return;
        pageReady = true;
        getWindow().getDecorView().postInvalidate();   // the launch screen is checked when the window next draws; make it draw
    }
}
