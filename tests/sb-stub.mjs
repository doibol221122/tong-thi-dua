// Helper dùng chung cho các suite stub Supabase (test-supabase-*.mjs).
// Mô phỏng máy chủ Supabase (Auth + PostgREST) bằng route của Playwright,
// vì headless shell không ra được internet: MỌI request tới supabase.co
// đều phải được chặn ở đây, không request nào được lọt ra mạng thật.
//
// QUY TẮC STUB (vi phạm là test sai — đã kiểm chứng bằng probe):
// - Mọi response đều có header `access-control-allow-origin: *` và
//   `access-control-expose-headers: content-range`.
// - `.single()` stub bằng OBJECT TRẦN, không phải mảng (chỉ `maybeSingle()`
//   mới unwrap mảng). Trả mảng cho `.single()` làm postgrest hiểu sai
//   (profile thành mảng -> p.status undefined -> app kẹt ở màn hình đăng nhập).
// - Token giả phải là JWT thực tế: base64url header + payload có
//   sub/email/exp 4102444800/aud authenticated + '.sig'.
// - Pattern route kết thúc bằng `*` để khớp query string.
// - Đếm HEAD `select=id` trả `content-range: 0-0/N`, body rỗng.
// - Lưu có điều kiện (PATCH app_state): khớp `version=eq.N` /
//   `updated_at=eq.X` với bản remote hiện tại; lệch thì trả [] để
//   maybeSingle() -> null -> app báo xung đột (conflict: true).
import { createHash } from 'crypto';

export const EXE = process.env.CHROMIUM_EXE || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
export const SB_URL = 'https://iycprmfrysrcpsavlttl.supabase.co';
export const STORAGE_KEY = 'sb-iycprmfrysrcpsavlttl-auth-token';
export const BASE = (process.env.TEST_BASE_URL || 'http://localhost:4177').replace(/\/$/, '');

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export function fakeJwt(sub, email) {
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, exp: 4102444800, aud: 'authenticated', role: 'authenticated', iat: 1700000000 })}.sig`;
}
export function decodeJwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8')); } catch { return null; }
}
// UUID ổn định theo email để test lặp lại được.
export function uuidFor(email) {
  const h = createHash('sha256').update(email).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function sessionFor(user) {
  return {
    access_token: fakeJwt(user.id, user.email),
    refresh_token: `refresh-${user.id}`,
    expires_in: 3600,
    expires_at: 4102444800,
    token_type: 'bearer',
    user: { ...user, app_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() },
  };
}
export function userObject(u) {
  return { id: u.id, email: u.email, user_metadata: u.user_metadata ?? {}, app_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
}

// Pattern route (kết thúc bằng `*` để khớp query string) -> regex.
function globToRegExp(glob) {
  const re = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000') // giữ chỗ cho ** trước khi thay * đơn
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}
const ROUTES = [
  ['**/auth/v1/signup*', 'signup'],
  ['**/auth/v1/token*', 'token'],
  ['**/auth/v1/user*', 'user'],
  ['**/auth/v1/recover*', 'recover'],
  ['**/auth/v1/resend*', 'resend'],
  ['**/auth/v1/logout*', 'logout'],
  ['**/rest/v1/profiles*', 'profiles'],
  ['**/rest/v1/app_state_history*', 'history'],
  ['**/rest/v1/app_state*', 'app_state'],
].map(([glob, name]) => ({ re: globToRegExp(glob), name }));

export class SbStub {
  // seedState: AppState dùng làm dữ liệu chung ban đầu (vd seed5/seed-duty).
  // opts.version: version khởi đầu của dòng app_state (mặc định 3).
  // opts.appStateNull: true -> chưa có dòng app_state (app sẽ upsert bản local).
  constructor(seedState, opts = {}) {
    this.users = new Map(); // email -> {id,email,password,user_metadata}
    this.profiles = []; // hàng profiles
    this._clock = Date.now();
    this.appState = opts.appStateNull ? null : {
      id: 'main',
      data: JSON.parse(JSON.stringify(seedState)),
      updated_at: new Date(this._clock).toISOString(),
      version: opts.version ?? 3,
    };
    this.requests = []; // {method, url, body}
    this.recoverRequests = [];
    this.passwordUpdated = []; // email đã đổi mật khẩu qua PUT /auth/v1/user
    this.recoveryEmail = null; // user cho flow ?code= (pkce)
    this.unhandled = [];
  }
  _stamp() { this._clock += 1000; return new Date(this._clock).toISOString(); }
  seedUser({ email, password, full_name, requested_role, requested_class }) {
    const u = { id: uuidFor(email), email, password, user_metadata: { full_name, requested_role, requested_class: requested_class ?? '' } };
    this.users.set(email, u);
    return u;
  }
  seedProfile({ user, role, status, assigned_class_id = null, assigned_week_id = null }) {
    const p = { id: user.id, email: user.email, full_name: user.user_metadata.full_name, role, status, assigned_class_id, assigned_week_id, created_at: new Date().toISOString() };
    this.profiles.push(p);
    return p;
  }
  profileByEmail(email) { return this.profiles.find(p => p.email === email); }
  // Giả lập "máy khác vừa lưu": đổi dữ liệu remote + tăng version + updated_at mới hơn.
  bumpRemote(mutator) {
    if (!this.appState) throw new Error('bumpRemote: chưa có dòng app_state');
    mutator(this.appState.data);
    this.appState.version += 1;
    this.appState.updated_at = this._stamp();
    return this.appState;
  }
  saw(method, substr) { return this.requests.some(r => r.method === method && r.url.includes(substr)); }
  sawPatchAppStateVersion(v) { return this.requests.some(r => r.method === 'PATCH' && r.url.includes('/rest/v1/app_state') && r.url.includes(`version=eq.${v}`)); }

  async install(page) {
    const stub = this;
    await page.route('**/*', async route => {
      const req = route.request();
      const url = req.url();
      if (!url.includes('supabase.co')) { await route.continue(); return; }
      const method = req.method();
      const bodyText = req.postData() || '';
      stub.requests.push({ method, url, body: bodyText });
      const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
      const json = (status, body, extra = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...headers, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
      const u = new URL(url);
      const hit = ROUTES.find(r => r.re.test(url.split('?')[0]));
      const kind = hit?.name;
      if (!kind) { stub.unhandled.push({ method, url }); return json(200, {}); }
      const body = bodyText ? JSON.parse(bodyText) : {};
      const bearerUser = () => {
        const auth = req.headers()['authorization'] || '';
        const tok = auth.replace(/^Bearer\s+/i, '');
        const payload = tok ? decodeJwtPayload(tok) : null;
        if (!payload?.sub) return null;
        return [...stub.users.values()].find(x => x.id === payload.sub) ?? null;
      };

      if (kind === 'signup') {
        if (stub.users.has(body.email)) return json(400, { msg: 'User already registered' });
        const user = stub.seedUser({ email: body.email, password: body.password, full_name: body.data?.full_name ?? '', requested_role: body.data?.requested_role, requested_class: body.data?.requested_class });
        // user_metadata lấy đúng từ body signup (đi qua AuthScreen).
        user.user_metadata = { ...(body.data ?? {}) };
        return json(200, { ...sessionFor(user), user: userObject(user) });
      }
      if (kind === 'token') {
        const grant = u.searchParams.get('grant_type');
        if (grant === 'password') {
          const user = stub.users.get(body.email);
          if (!user || user.password !== body.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
          return json(200, { ...sessionFor(user), user: userObject(user) });
        }
        if (grant === 'refresh_token') {
          const id = (body.refresh_token || '').replace(/^refresh-/, '');
          const user = [...stub.users.values()].find(x => x.id === id);
          if (!user) return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
          return json(200, { ...sessionFor(user), user: userObject(user) });
        }
        if (grant === 'pkce') {
          // Đổi ?code= (link khôi phục / xác nhận email) lấy session.
          const user = stub.recoveryEmail ? stub.users.get(stub.recoveryEmail) : [...stub.users.values()][0];
          if (!user) return json(400, { error: 'invalid_grant', error_description: 'Invalid code' });
          return json(200, { ...sessionFor(user), user: userObject(user) });
        }
        return json(400, { error: 'unsupported_grant_type' });
      }
      if (kind === 'user') {
        const user = bearerUser();
        if (method === 'GET') {
          if (!user) return json(401, { msg: 'Invalid token' });
          return json(200, userObject(user));
        }
        if (method === 'PUT') {
          if (!user) return json(401, { msg: 'Invalid token' });
          if (typeof body.password === 'string') { user.password = body.password; stub.passwordUpdated.push(user.email); }
          return json(200, userObject(user));
        }
        return json(200, {});
      }
      if (kind === 'recover') {
        stub.recoverRequests.push(body.email);
        return json(200, {});
      }
      if (kind === 'resend') return json(200, {});
      if (kind === 'logout') return route.fulfill({ status: 204, headers, body: '' });
      if (kind === 'history') return json(200, []);
      if (kind === 'profiles') {
        if (method === 'GET' || method === 'HEAD') {
          let rows = [...stub.profiles];
          const idEq = u.searchParams.get('id');
          if (idEq?.startsWith('eq.')) rows = rows.filter(p => p.id === idEq.slice(3));
          const extra = { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
          if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, ...extra }, body: '' });
          return json(200, rows, extra);
        }
        if (method === 'POST') {
          const row = { ...body, created_at: new Date().toISOString() };
          stub.profiles.push(row);
          return json(201, row); // .single() -> object trần
        }
        if (method === 'PATCH') {
          const idEq = u.searchParams.get('id');
          const id = idEq?.startsWith('eq.') ? idEq.slice(3) : null;
          const row = stub.profiles.find(p => p.id === id);
          if (row) Object.assign(row, body);
          return json(200, []);
        }
        if (method === 'DELETE') {
          const idEq = u.searchParams.get('id');
          const id = idEq?.startsWith('eq.') ? idEq.slice(3) : null;
          stub.profiles = stub.profiles.filter(p => p.id !== id);
          return route.fulfill({ status: 204, headers, body: '' });
        }
        return json(200, []);
      }
      if (kind === 'app_state') {
        if (method === 'GET') return json(200, stub.appState ? [{ ...stub.appState }] : []);
        if (method === 'POST') {
          // Upsert lần đầu: .single() -> object trần.
          stub.appState = { id: 'main', data: body.data, updated_by: body.updated_by, updated_at: stub._stamp(), version: body.version ?? 1 };
          return json(201, { ...stub.appState });
        }
        if (method === 'PATCH') {
          const cur = stub.appState;
          if (!cur) return json(200, []); // maybeSingle -> null -> conflict
          const vEq = u.searchParams.get('version');
          const tEq = u.searchParams.get('updated_at');
          if (vEq?.startsWith('eq.') && Number(vEq.slice(3)) !== cur.version) return json(200, []);
          if (tEq?.startsWith('eq.') && decodeURIComponent(tEq.slice(3)) !== cur.updated_at) return json(200, []);
          const next = { ...cur, ...body, updated_at: stub._stamp() };
          stub.appState = next;
          return json(200, [{ ...next }]); // maybeSingle unwrap mảng
        }
        return json(200, []);
      }
      return json(200, {});
    });
  }
}

// Mở 1 trang đã gắn stub. opts: {url, seedSession (user), clipboard, viewport}
export async function newSbPage(browser, stub, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await stub.install(page);
  if (opts.clipboard) {
    await page.addInitScript(() => {
      window.__copied = null;
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); }, readText: async () => window.__copied ?? '' },
          configurable: true,
        });
      } catch { /* headless shell: clipboard không ghi được, app sẽ hiện link trong note */ }
    });
  }
  if (opts.seedSession) {
    await page.addInitScript((s) => localStorage.setItem('sb-iycprmfrysrcpsavlttl-auth-token', JSON.stringify(s)), sessionFor(opts.seedSession));
  }
  await page.goto(opts.url ?? `${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  return { ctx, page };
}

export async function waitText(page, text, timeout = 15000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout });
}
