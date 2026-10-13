// Draw the Android app's launcher icons and splash mark: the site's "KC" monogram in white on its green.
//   node tools/android_icons.js
// Writes into android/app/src/main/res/: mipmap-*/ic_launcher.png (rounded square, for older phones),
// mipmap-*/ic_launcher_round.png (circle), mipmap-*/ic_launcher_foreground.png (the letters alone, for the
// adaptive icon on a green background) and drawable/splash_mark.png (the monogram on the launch screen).
// Uses the same drawing as icons/ (the site's icons), so the two stay alike. Needs the test tools (npm install).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const RES = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const GREEN = '#1c6944';
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// shape: 'square' (rounded corners), 'circle', or 'none' (transparent; letters only). text: letter height as a share of the size.
const html = (size, shape, text) => {
  const bg = shape === 'none' ? 'transparent' : GREEN, r = shape === 'circle' ? '50%' : shape === 'square' ? `${size * 0.22}px` : 0;
  return `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${r};background:${bg};display:flex;align-items:center;justify-content:center"><span style="font:700 ${size * text}px/1 Georgia,'Palatino Linotype',Palatino,'Times New Roman',serif;color:#fff;letter-spacing:-0.02em">KC</span></div></body></html>`;
};

(async () => {
  const browser = await chromium.launch();
  const draw = async (file, size, shape, text) => {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(html(size, shape, text));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  };
  for (const [name, d] of Object.entries(DENSITY)) {
    const dir = path.join(RES, `mipmap-${name}`);
    await draw(path.join(dir, 'ic_launcher.png'), Math.round(48 * d), 'square', 0.42);
    await draw(path.join(dir, 'ic_launcher_round.png'), Math.round(48 * d), 'circle', 0.36);
    await draw(path.join(dir, 'ic_launcher_foreground.png'), Math.round(108 * d), 'none', 0.26);   // inside the adaptive icon's safe zone
  }
  await draw(path.join(RES, 'drawable', 'splash_mark.png'), 288, 'square', 0.42);
  await browser.close();
  console.log('icons written to', RES);
})();
