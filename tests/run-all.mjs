// npm test: build lại lib.mjs (unit) -> build app (local) -> preview 4177 ->
// chạy 5 suite local -> build lại app (Supabase) -> preview 4177 ->
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

const SUITES = ['test-violnames.mjs', 'test-stepper.mjs', 'test-lock-names.mjs', 'test-week-norank.mjs', 'test-smoke.mjs', 'test-autofill.mjs', 'test-lock-duty.mjs', 'test-mobile.mjs', 'test-codo-tabs.mjs', 'test-confirm.mjs'];
const SB_SUITES = ['test-supabase-register.mjs', 'test-supabase-duty.mjs', 'test-supabase-invite.mjs', 'test-supabase-recovery.mjs', 'test-supabase-conflict.mjs'];
// Khóa anon public của project tong-thi-dua (dùng cho build test; khóa này
// vốn đã nằm trong bundle public, không phải service_role).
const SB_ENV = {
  VITE_SUPABASE_URL: 'https://iycprmfrysrcpsavlttl.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_IpNVmV0kb2cdSgcjlimCtA_x-ZQFf_C',
};

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

function startPreview() {
  // Chạy trực tiếp node vite (không qua npx): kill() phải trúng đúng tiến
  // trình server — kill npx chỉ giết wrapper, server node con bị rớt lại
  // và chiếm cổng 4177 làm phase sau test nhầm bản cũ.
  const viteBin = `${APP_DIR}/node_modules/vite/bin/vite.js`;
  const preview = spawn('node', [viteBin, 'preview', '--port', '4177', '--strictPort'], { cwd: APP_DIR, stdio: 'pipe' });
  preview.stdout.on('data', d => process.stdout.write(`[preview] ${d}`));
  preview.stderr.on('data', d => process.stderr.write(`[preview] ${d}`));
  return preview;
}

async function waitPortFree(tries = 20) {
  for (let i = 0; i < tries; i++) {
    try { await fetch('http://localhost:4177/'); } catch { return true; }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function stopPreview(preview) {
  preview.kill('SIGTERM');
  if (!await waitPortFree()) console.error('Cảnh báo: cổng 4177 chưa được giải phóng sau 10s — preview sau có thể test nhầm bản cũ.');
}

async function runSuites(list, label) {
  let failed = false;
  for (const s of list) {
    console.log(`== ${label}: ${s} ==`);
    const c = await run('node', [s], { cwd: HERE });
    if (c !== 0) { failed = true; console.error(`!! ${s} FAIL (exit ${c})`); }
  }
  return failed;
}

console.log('== 1. build lib.mjs (unit) ==');
let code = await run('npx', ['esbuild', `${APP_DIR}/src/lib.ts`, '--bundle', '--format=esm', `--outfile=${HERE}/lib.mjs`], { cwd: APP_DIR });
if (code !== 0) process.exit(code);

console.log('== 2. build app (local) ==');
code = await run('npm', ['run', 'build'], { cwd: APP_DIR });
if (code !== 0) process.exit(code);

console.log('== 3. preview 4177 (local) ==');
let preview = startPreview();
if (!await waitPreview('http://localhost:4177/') || preview.exitCode !== null) {
  console.error('Preview không lên sau 20 giây (cổng 4177 có thể đang bị chiếm — tắt preview cũ rồi chạy lại).');
  try { preview.kill('SIGTERM'); } catch { /* đã thoát */ }
  process.exit(1);
}

let failed = await runSuites(SUITES, 'local');
await stopPreview(preview);

console.log('== 4. build app (Supabase) ==');
code = await run('npm', ['run', 'build'], { cwd: APP_DIR, env: { ...process.env, ...SB_ENV } });
if (code !== 0) process.exit(code);

console.log('== 5. preview 4177 (Supabase) ==');
preview = startPreview();
if (!await waitPreview('http://localhost:4177/') || preview.exitCode !== null) {
  console.error('Preview Supabase không lên sau 20 giây (hoặc đã thoát — cổng 4177 có thể đang bị preview cũ chiếm).');
  try { preview.kill('SIGTERM'); } catch { /* đã thoát */ }
  process.exit(1);
}
if (await runSuites(SB_SUITES, 'supabase-stub')) failed = true;
await stopPreview(preview);
console.log(failed ? 'NPM TEST: CÓ SUITE FAIL.' : 'NPM TEST: TẤT CẢ PASS.');
process.exit(failed ? 1 : 0);
