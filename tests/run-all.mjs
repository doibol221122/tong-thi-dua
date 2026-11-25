// npm test: build lại lib.mjs (unit) -> build app (local) -> preview 4177 ->
// chạy 10 suite local -> build lại app (Supabase) -> preview 4178 ->
// chạy 5 suite stub Supabase -> tắt preview. Chạy được từ cả hai chỗ:
//   ~/workspace/tong-thi-dua-tests/  (bản làm việc)
//   ~/workspace/tong-thi-dua/tests/  (bản trong repo, cho CI)
// Thư mục app lấy từ APP_DIR, nếu không đặt thì tự tìm:
//   ../tong-thi-dua (bản làm việc) hoặc .. (bản trong repo).
// Phase 2 bắt buộc build với biến Supabase: build local không có biến môi
// trường sẽ loại bỏ nhánh Supabase khỏi bundle (isSupabaseConfigured=false).
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const HERE = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const candidates = [`${HERE}/../tong-thi-dua`, `${HERE}/..`];
const APP_DIR = process.env.APP_DIR || candidates.find(d => existsSync(`${d}/package.json`) && existsSync(`${d}/src/App.tsx`));
if (!APP_DIR) { console.error('Không tìm thấy thư mục app (tong-thi-dua). Đặt APP_DIR rồi chạy lại.'); process.exit(1); }

const SUITES = ['test-violnames.mjs', 'test-stepper.mjs', 'test-lock-names.mjs', 'test-week-norank.mjs', 'test-smoke.mjs', 'test-autofill.mjs', 'test-lock-duty.mjs', 'test-mobile.mjs', 'test-codo-tabs.mjs', 'test-confirm.mjs', 'test-closed-week.mjs'];
const SB_SUITES = ['test-supabase-register.mjs', 'test-supabase-duty.mjs', 'test-supabase-invite.mjs', 'test-supabase-recovery.mjs', 'test-supabase-conflict.mjs', 'test-supabase-tables.mjs'];
// Khóa anon public của project tong-thi-dua (dùng cho build test; khóa này
// vốn đã nằm trong bundle public, không phải service_role).
const SB_ENV = {
  VITE_SUPABASE_URL: 'https://iycprmfrysrcpsavlttl.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_IpNVmV0kb2cdSgcjlimCtA_x-ZQFf_C',
};

// Phase local chạy preview ở 4177, phase Supabase ở 4178 (khác cổng):
// trước đây cả hai phase cùng dùng 4177 — preview phase 1 chưa kịp chết
// (SIGTERM) thì preview phase 2 --strictPort rớt ngay, waitPreview chờ
// đủ 20s rồi exit 1 (CI fail 4 lần 25/11, bước test ~105–113s, khớp
// thời gian phase 1 + 20s chờ). Suite stub đọc cổng qua TEST_BASE_URL
// (sb-stub.mjs); suite local vẫn dùng 4177 mặc định.
const PORT_LOCAL = 4177;
const PORT_SB = 4178;
const BASE_LOCAL = `http://localhost:${PORT_LOCAL}/`;
const BASE_SB = `http://localhost:${PORT_SB}/`;

// Dọn cổng trước khi chạy: preview cũ còn sót (lần chạy trước bị ngắt)
// sẽ làm preview mới --strictPort rớt ngay hoặc làm suite test nhầm bản
// cũ. Best-effort: lệnh không có trên máy thì bỏ qua.
async function killPort(port) {
  await run('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
  await run('pkill', ['-f', `vite.*preview.*${port}`], { stdio: 'ignore' });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts });
    p.on('close', code => resolve(code ?? 1));
    p.on('error', err => { console.error(cmd, err.message); resolve(1); });
  });
}

async function waitPreview(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* chưa lên */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function startPreview(port) {
  // Chạy trực tiếp node vite (không qua npx): kill() phải trúng đúng tiến
  // trình server — kill npx chỉ giết wrapper, server node con bị rớt lại
  // và chiếm cổng làm phase sau test nhầm bản cũ.
  const viteBin = `${APP_DIR}/node_modules/vite/bin/vite.js`;
  const preview = spawn('node', [viteBin, 'preview', '--port', String(port), '--strictPort'], { cwd: APP_DIR, stdio: 'pipe' });
  preview.stdout.on('data', d => process.stdout.write(`[preview:${port}] ${d}`));
  preview.stderr.on('data', d => process.stderr.write(`[preview:${port}] ${d}`));
  return preview;
}

async function waitPortFree(port, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(`http://localhost:${port}/`); } catch { return true; }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function stopPreview(preview, port) {
  preview.kill('SIGTERM');
  if (!await waitPortFree(port)) console.error(`Cảnh báo: cổng ${port} chưa được giải phóng sau 10s — preview sau có thể test nhầm bản cũ.`);
}

async function runSuites(list, label, baseUrl) {
  let failed = false;
  for (const s of list) {
    console.log(`== ${label}: ${s} ==`);
    const c = await run('node', [s], { cwd: HERE, env: { ...process.env, TEST_BASE_URL: baseUrl } });
    if (c !== 0) { failed = true; console.error(`!! ${s} FAIL (exit ${c})`); }
  }
  return failed;
}

console.log('== 0. dọn cổng 4177/4178 ==');
await killPort(PORT_LOCAL);
await killPort(PORT_SB);

console.log('== 1. build lib.mjs (unit) ==');
let code = await run('npx', ['esbuild', `${APP_DIR}/src/lib.ts`, '--bundle', '--format=esm', `--outfile=${HERE}/lib.mjs`], { cwd: APP_DIR });
if (code !== 0) process.exit(code);

console.log('== 2. build app (local) ==');
// Gỡ hẳn biến Supabase khỏi môi trường của build local: nếu shell chạy
// test vô tình có VITE_SUPABASE_URL/ANON_KEY (rò từ lần build trước),
// vite sẽ nhúng Supabase vào bundle và mọi suite local đều thấy màn
// hình đăng nhập thay vì chọn vai trò (đã gặp 25/11/2026).
const LOCAL_ENV = { ...process.env };
delete LOCAL_ENV.VITE_SUPABASE_URL;
delete LOCAL_ENV.VITE_SUPABASE_ANON_KEY;
code = await run('npm', ['run', 'build'], { cwd: APP_DIR, env: LOCAL_ENV });

console.log('== 3. preview 4177 (local) ==');
let preview = startPreview(PORT_LOCAL);
if (!await waitPreview(BASE_LOCAL) || preview.exitCode !== null) {
  console.error('Preview không lên sau 20 giây (cổng 4177 có thể đang bị chiếm — tắt preview cũ rồi chạy lại).');
  try { preview.kill('SIGTERM'); } catch { /* đã thoát */ }
  process.exit(1);
}

let failed = await runSuites(SUITES, 'local', BASE_LOCAL);
await stopPreview(preview, PORT_LOCAL);

console.log('== 4. build app (Supabase) ==');
code = await run('npm', ['run', 'build'], { cwd: APP_DIR, env: { ...process.env, ...SB_ENV } });
if (code !== 0) process.exit(code);

console.log('== 5. preview 4178 (Supabase) ==');
preview = startPreview(PORT_SB);
if (!await waitPreview(BASE_SB) || preview.exitCode !== null) {
  console.error('Preview Supabase không lên sau 20 giây (cổng 4178 có thể đang bị chiếm).');
  try { preview.kill('SIGTERM'); } catch { /* đã thoát */ }
  process.exit(1);
}
if (await runSuites(SB_SUITES, 'supabase-stub', BASE_SB)) failed = true;
await stopPreview(preview, PORT_SB);
console.log(failed ? 'NPM TEST: CÓ SUITE FAIL.' : 'NPM TEST: TẤT CẢ PASS.');
process.exit(failed ? 1 : 0);
