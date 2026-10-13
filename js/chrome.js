// chrome.js: the page frame: menu, support window and theme
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- menu ----------
const KOFI_URL = 'https://ko-fi.com/kingdomcode/tip';   // linked from the About page
const KOFI_EMBED_URL = 'https://ko-fi.com/kingdomcode/?hidefeed=true&widget=true&embed=true&preview=true';   // Ko-fi's embeddable tip panel
const CONTACT_EMAIL = 'kingdomcode@proton.me';   // public contact address; the Contact item stays hidden until this is set
const menu = document.getElementById('menu'), menuBtn = document.getElementById('menubtn');
const drawer = document.getElementById('drawer');   // the app's side drawer (app.html); the site has the drop-down #menu
// The drawer adds one history entry while open, so the phone's Back button closes it instead of leaving the page.
let drawerEntry = false;
function setMenu(open) {
  if (drawer) {
    if (open && !drawer.open) {
      drawer.style.removeProperty('--scrim'); drawer.style.animation = ''; drawer.showModal(); menuBtn.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('drawer-open');   // the page behind stays still
      history.pushState({kcDrawer: true}, ''); drawerEntry = true;
    } else if (!open && drawer.open) drawer.close();
    return;
  }
  menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
if (drawer) {
  menuBtn.addEventListener('click', () => setMenu(true));
  document.getElementById('drawerx').addEventListener('click', () => setMenu(false));
  drawer.addEventListener('click', e => {
    const page = e.target.closest('a[href^="#"]');
    if (page && page.href !== location.href) {      // another page of the app: it takes the drawer's history entry
      e.preventDefault(); drawerEntry = false; drawer.close(); location.replace(page.getAttribute('href'));
    } else if (e.target === drawer || e.target.closest('a, button')) setMenu(false);   // the dimmed page, a link out, Support
  });
  drawer.addEventListener('close', () => {          // every way of closing it, Escape included
    menuBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('drawer-open');
    if (drawerEntry) { drawerEntry = false; history.back(); }
  });
  window.addEventListener('popstate', () => { if (drawer.open) { drawerEntry = false; drawer.close(); } });   // Back
  // Swipe the drawer shut: a sideways drag to the left moves it with the finger and fades the dimmed page. Past a third of its
  // width, or flicked, it closes; otherwise it springs back. A drag that starts upward is the page's own scroll and is left alone.
  const SLOP = 10, FLICK = 0.5;                       // pixels before a drag counts; pixels per millisecond that count as a flick
  let swipe = null, quiet = 0;
  const settle = () => { drawer.style.transition = drawer.style.transform = ''; };   // the entrance animation stays off until the next opening
  drawer.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !e.isPrimary || !drawer.open) return;
    swipe = {id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, w: drawer.offsetWidth, pts: [[e.clientX, e.timeStamp]]};
  });
  drawer.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.drag) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }          // the page's scroll
      if (dx > -SLOP || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swipe.drag = true; drawer.style.animation = 'none'; drawer.style.transition = 'none';
    }
    const x = Math.min(0, dx);
    drawer.style.transform = `translateX(${x}px)`;
    drawer.style.setProperty('--scrim', String(Math.max(0, 1 + x / swipe.w)));
    swipe.pts.push([e.clientX, e.timeStamp]);
    swipe.pts = swipe.pts.filter(p => e.timeStamp - p[1] <= 100);
  });
  const endSwipe = (e, cancelled) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe; swipe = null;
    if (!s.drag) return;
    quiet = Date.now() + 400;                          // the lift is not a tap on whatever is under the finger
    const dx = Math.min(0, e.clientX - s.x), last = s.pts[s.pts.length - 1], first = s.pts[0];
    const v = !cancelled && e.timeStamp - last[1] <= 100 && s.pts.length > 1 && last[1] > first[1] ? (last[0] - first[0]) / (last[1] - first[1]) : 0;
    if (!cancelled && (dx < -s.w / 3 || (v < -FLICK && dx < -30))) {
      drawer.style.transition = 'transform 180ms cubic-bezier(.4,0,1,1)';
      drawer.style.setProperty('--scrim', '0');
      setMenu(false); settle();                        // closes from where the finger let go, on the usual closing curve
    } else {
      drawer.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
      drawer.style.transform = 'translateX(0)'; drawer.style.removeProperty('--scrim');
      setTimeout(settle, 240);
    }
  };
  drawer.addEventListener('pointerup', e => endSwipe(e, false));
  drawer.addEventListener('pointercancel', e => endSwipe(e, true));
  drawer.addEventListener('click', e => { if (Date.now() < quiet) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
} else {
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', e => { if (e.target.closest('a, button')) setMenu(false); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
}
window.addEventListener('hashchange', () => setMenu(false));
if (CONTACT_EMAIL) { document.getElementById('contact').href = 'mailto:' + CONTACT_EMAIL; document.getElementById('contactli').classList.remove('nolink'); }

// ---------- support window (Ko-fi inside the page) ----------
const supportDlg = document.getElementById('support'), supportBody = document.getElementById('supportbody');
function openSupport() {
  if (!supportDlg.showModal) { window.open(KOFI_URL, '_blank', 'noopener'); return; }
  supportBody.innerHTML = `<iframe src="${esc(KOFI_EMBED_URL)}" title="Support Kingdom Code on Ko-fi" allow="payment"></iframe>
    <p class="cap dlgfoot">Trouble loading? <a href="${esc(KOFI_URL)}" target="_blank" rel="noopener">Open on Ko-fi</a></p>`;
  supportDlg.showModal();
}
document.addEventListener('click', e => { const s = e.target.closest('[data-support]'); if (s) { track('support/open', s.closest('#menu, #drawer') ? 'menu' : 'about'); openSupport(); } });
document.getElementById('supportx').addEventListener('click', () => supportDlg.close());
supportDlg.addEventListener('click', e => { if (e.target === supportDlg) supportDlg.close(); });
supportDlg.addEventListener('close', () => { supportBody.innerHTML = ''; });

// ---------- theme ----------
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : !!(darkMQ && darkMQ.matches); };
function syncTheme() {
  const btn = document.getElementById('theme'), d = isDark();
  btn.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode');
  btn.title = d ? 'Switch to light mode' : 'Switch to dark mode';
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = d ? '#111513' : '#ffffff';
}
document.getElementById('theme').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; store.set('kc-theme', next); syncTheme();
});
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', syncTheme);
syncTheme();
