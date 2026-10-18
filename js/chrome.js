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
function setMenu(open, dragged) {
  if (drawer) {
    if (open && !drawer.open) {
      if (!dragged) {                                       // a plain opening starts clean; a dragged one arrives with its own styles
        for (const k of ['--scrim', '--glide', 'animation', 'transition', 'transform']) drawer.style.removeProperty(k);
        drawer.classList.remove('swiped');
      }
      drawer.showModal(); menuBtn.setAttribute('aria-expanded', 'true');
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
  // Swipe the drawer: a drag to the left on the open drawer, or a drag to the right from the screen's left edge, moves it with the
  // finger and fades the dimmed page with it. Past a third of its width, or flicked, it finishes the way it was going, gliding on
  // from where the finger let go at the speed it was moving; otherwise it goes back. A drag that starts upward is the page's own scroll.
  const SLOP = 10, FLICK = 0.5, EASE = 'cubic-bezier(.2,.8,.2,1)';
  const drawerW = () => drawer.offsetWidth || Math.min(320, innerWidth * .85);
  let swipe = null, quiet = 0;
  const velocity = (pts, e) => {                       // pixels per millisecond over the last 100 ms, 0 if the finger had paused
    const last = pts[pts.length - 1], first = pts[0];
    return e.timeStamp - last[1] <= 100 && pts.length > 1 && last[1] > first[1] ? (last[0] - first[0]) / (last[1] - first[1]) : 0;
  };
  const follow = (x, w) => {                           // x: how far the drawer is from fully open, 0 to -w
    drawer.style.transform = `translateX(${x}px)`;
    drawer.style.setProperty('--scrim', String(Math.max(0, Math.min(1, 1 + x / w))));
  };
  function glide(open, x, w, v) {                      // finish the movement from x, at the finger's own pace, easing to a stop
    const left = open ? -x : w + x, ms = Math.round(Math.min(300, Math.max(150, left / Math.max(Math.abs(v), .8))));
    drawer.style.transition = `transform ${ms}ms ${EASE}`;
    drawer.style.setProperty('--glide', ms + 'ms');
    if (open) {
      drawer.style.setProperty('--scrim', '1'); drawer.style.transform = 'translateX(0)';
      setTimeout(() => { drawer.style.transform = drawer.style.transition = ''; }, ms + 40);
    } else {
      drawer.style.setProperty('--scrim', '0'); setMenu(false); drawer.style.transform = '';   // its closing keeps this curve until the next opening
    }
  }
  function startSwipe(e, from) {                            // one gesture, either direction; from: 'open' drawer or the screen's 'edge'
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    swipe = {id: e.pointerId, x: e.clientX, y: e.clientY, from, drag: false, w: drawerW(), pts: [[e.clientX, e.timeStamp]]};
  }
  function moveSwipe(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y, opening = swipe.from === 'edge';
    if (!swipe.drag) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }          // the page's scroll
      if ((opening ? dx < SLOP : dx > -SLOP) || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swipe.drag = true; drawer.classList.add('swiped'); drawer.style.animation = 'none'; drawer.style.transition = 'none';
      if (opening) { follow(-swipe.w, swipe.w); setMenu(true, true); }                           // parked off-screen, then shown
    }
    follow(opening ? Math.min(0, -swipe.w + dx) : Math.min(0, dx), swipe.w);
    swipe.pts.push([e.clientX, e.timeStamp]);
    swipe.pts = swipe.pts.filter(p => e.timeStamp - p[1] <= 100);
  }
  function endSwipe(e, cancelled) {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe; swipe = null;
    if (!s.drag) return;
    quiet = Date.now() + 400;                          // the lift is not a tap on whatever is under the finger
    const opening = s.from === 'edge', dx = e.clientX - s.x, v = cancelled ? 0 : velocity(s.pts, e);
    const x = opening ? Math.min(0, -s.w + dx) : Math.min(0, dx);
    const goes = !cancelled && (opening ? (dx > s.w / 3 || (v > FLICK && dx > 30)) : (dx < -s.w / 3 || (v < -FLICK && dx < -30)));
    glide(opening ? goes : !goes, x, s.w, v);
  }
  drawer.addEventListener('pointerdown', e => { if (drawer.open) startSwipe(e, 'open'); });
  const edge = document.createElement('div');          // a thin strip at the screen's left edge that starts the opening drag
  edge.className = 'edge'; edge.setAttribute('aria-hidden', 'true'); document.body.appendChild(edge);
  edge.addEventListener('pointerdown', e => { if (!drawer.open) startSwipe(e, 'edge'); });
  for (const el of [drawer, edge]) {
    el.addEventListener('pointermove', moveSwipe);
    el.addEventListener('pointerup', e => endSwipe(e, false));
    el.addEventListener('pointercancel', e => endSwipe(e, true));
  }
  drawer.addEventListener('click', e => { if (Date.now() < quiet) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  // A long press on a button or link must not raise Android's link preview or menu; the Bible's own text keeps its menu, to copy from.
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('a, button, .tab, .btn') && !e.target.closest('#rtext')) e.preventDefault(); });
} else {
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', e => { if (e.target.closest('a, button')) setMenu(false); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
}
window.addEventListener('hashchange', () => setMenu(false));
window.addEventListener('kcroute', () => setMenu(false));
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
