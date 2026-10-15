package com.kingdomcodearchive.tewahedo;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Installs a newer version of the app without sending the reader to a browser. The page (js/updates.js) names the file and the
 * SHA-256 that GitHub lists for it; this downloads it into the app's private cache, reporting progress, checks the SHA-256,
 * and hands it to Android's installer. Android still shows its own "Update this app?" screen, and only installs the file if it
 * is signed with the same key as the app already on the phone. Nothing is fetched except an app release file from this
 * project's GitHub releases, and only when the reader taps Update.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String RELEASES = "https://github.com/RockaKC/source-index/releases/download/app-v";
    private static final String FILE = "updates/KC-Tewahedo-Bible.apk";
    private static final int MAX_REDIRECTS = 5;
    private static final long PROGRESS_MS = 100;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private File apk() { return new File(getContext().getCacheDir(), FILE); }

    /** download({url, sha256}): resolves {bytes} once the file is saved and its SHA-256 matches; emits "progress" {received, total}. */
    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url", "");
        final String want = call.getString("sha256", "").toLowerCase(Locale.ROOT);
        if (!url.startsWith(RELEASES) || !want.matches("[0-9a-f]{64}")) { call.reject("That is not an app release file."); return; }
        worker.execute(() -> {
            File out = apk();
            try {
                File dir = out.getParentFile();
                if (dir != null) dir.mkdirs();
                if (out.exists()) out.delete();
                HttpURLConnection c = open(url);
                long total = c.getContentLengthLong(), got = 0, last = 0;
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[32 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n); sha.update(buf, 0, n); got += n;
                        long now = System.currentTimeMillis();
                        if (now - last >= PROGRESS_MS) { last = now; progress(got, total); }
                    }
                } finally { c.disconnect(); }
                progress(got, total);
                StringBuilder hex = new StringBuilder();
                for (byte b : sha.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
                if (!hex.toString().equals(want)) { out.delete(); call.reject("The file did not download correctly. Try again."); return; }
                JSObject r = new JSObject(); r.put("bytes", got); call.resolve(r);
            } catch (Exception e) {
                out.delete();
                call.reject("The download did not finish. Check your connection and try again.");
            }
        });
    }

    /**
     * install(): opens Android's installer for the downloaded file. Resolves {state: "started"}, or {state: "permission"} after
     * opening the settings page where the reader allows this app to install updates (the file stays; call install() again).
     */
    @PluginMethod
    public void install(PluginCall call) {
        File f = apk();
        if (!f.isFile()) { call.reject("There is no downloaded update. Download it again."); return; }
        Context ctx = getContext();
        JSObject r = new JSObject();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(s);
                r.put("state", "permission"); call.resolve(r); return;
            }
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            r.put("state", "started"); call.resolve(r);
        } catch (Exception e) {
            call.reject("The installer could not be opened.");
        }
    }

    private void progress(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received); p.put("total", total);
        notifyListeners("progress", p);
    }

    /** Opens the url, following redirects (GitHub hands release files to another host) but only ever over https. */
    private HttpURLConnection open(String start) throws Exception {
        String url = start;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code == 200) return c;
            String next = c.getHeaderField("Location");
            c.disconnect();
            if (code / 100 != 3 || next == null || !next.startsWith("https://")) throw new Exception("unexpected answer " + code);
            url = next;
        }
        throw new Exception("too many redirects");
    }
}
