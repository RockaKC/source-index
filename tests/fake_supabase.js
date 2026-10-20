// A simulated Supabase for the account tests: the auth calls (code sign-in, session, sign out) and the `saved` table, answered inside the browser
// with page.route, so no test touches a real project. fakeSupabase() returns its record (what the page sent, what is saved) for the test to inspect.
const SB = 'https://kc-test.supabase.test';
const CODE = '1234567';                               // the simulated project sends 7-digit codes

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor(email) {
  const exp = Math.floor(Date.now() / 1000) + 3600, user = {id: '0b7c2f10-1111-4222-8333-444455556666', aud: 'authenticated', role: 'authenticated', email,
    app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString()};
  return {access_token: `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp})}.sig`,
    token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh-1', user};
}

// A fake Supabase: auth (code sign-in, session, sign out) and the `saved` table. Returns its record, so tests can look at what the page sent.
async function fakeSupabase(page, opts = {}) {
  const st = {saved: [], otp: [], verify: [], rpc: [], failInsert: false, otpStatus: 200, email: null, config: opts.config || {url: SB, key: 'sb_publishable_test', public: true}};
  await page.route('**/profiles/site.js*', async route => {
    const res = await route.fetch(), body = (await res.text()).replace('accounts: null,', `accounts: ${JSON.stringify(st.config)},`);
    await route.fulfill({response: res, body});
  });
  const cors = (route, status, body) => route.fulfill({status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body),
    headers: {'access-control-allow-origin': '*', 'access-control-expose-headers': '*'}});
  await page.route(SB + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (req.method() === 'OPTIONS') {
      return route.fulfill({status: 204, headers: {'access-control-allow-origin': '*', 'access-control-allow-methods': '*',
        'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*'}});
    }
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    if (path === '/auth/v1/otp') {
      st.otp.push({body, redirect: url.searchParams.get('redirect_to')});
      if (st.otpStatus !== 200) return cors(route, st.otpStatus, {code: st.otpStatus, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded'});
      st.email = body.email; return cors(route, 200, {});
    }
    if (path === '/auth/v1/verify') {
      st.verify.push(body);
      if (body.token !== CODE) return cors(route, 403, {code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid'});
      return cors(route, 200, sessionFor(body.email));
    }
    if (path === '/auth/v1/user') return cors(route, 200, sessionFor(st.email || 'reader@example.com').user);
    if (path === '/auth/v1/token') return cors(route, 200, sessionFor(st.email || 'reader@example.com'));
    if (path === '/auth/v1/logout') return cors(route, 204);
    if (path === '/rest/v1/saved') {
      if (req.method() === 'GET') return cors(route, 200, st.saved.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
      if (req.method() === 'POST') {
        if (st.failInsert) return cors(route, 400, {code: 'P0001', message: 'Saved limit reached (2000).'});
        st.saved.push({kind: body.kind, item_key: body.item_key, created_at: new Date(Date.now() + st.saved.length * 1000).toISOString()}); return cors(route, 201);
      }
      if (req.method() === 'DELETE') {
        const kind = url.searchParams.get('kind').replace('eq.', ''), key = url.searchParams.get('item_key').replace('eq.', '');
        st.saved = st.saved.filter(r => !(r.kind === kind && r.item_key === key)); return cors(route, 204);
      }
    }
    if (path === '/rest/v1/rpc/delete_my_account') { st.rpc.push(path); st.saved = []; return cors(route, 200, null); }
    return cors(route, 404, {message: 'not simulated: ' + path});
  });
  return st;
}

module.exports = {SB, CODE, sessionFor, fakeSupabase};
