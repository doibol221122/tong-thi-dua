// npm test: build lại lib.mjs (unit) -> build app -> preview 4177 ->
// chạy mọi suite -> tắt preview. Chạy được từ cả hai chỗ:
//   ~/workspace/tong-thi-dua-tests/  (bản làm việc)
//   ~/workspace/tong-thi-dua/tests/  (bản trong repo, cho CI)
// Thư mục app lấy từ APP_DIR, nếu không đặt thì tự tìm:
//   ../tong-thi-dua (bản làm việc) hoặc .. (bản trong repo).
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const HERE = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const candidates = [`${HERE}/../tong-thi-dua`, `${HERE}/..`];
const APP_DIR = process.env.APP_DIR || candidates.find(d => existsSync(`${d}/package.json`) && existsSync(`${d}/src/App.tsx`));
if (!APP_DIR) { console.error('Không tìm thấy thư mục app (tong-thi-dua). Đặt APP_DIR rồi chạy lại.'); process.exit(1); }

const SUITES = ['test-violnames.mjs', 'test-stepper.mjs', 'test-lock-names.mjs', 'test-week-norank.mjs', 'test-smoke.mjs'];

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

console.log('== 1. build lib.mjs (unit) ==');
let code = await run('npx', ['esbuild', `${APP_DIR}/src/lib.ts`, '--bundle', '--format=esm', `--outfile=${HERE}/lib.mjs`], { cwd: APP_DIR });
if (code !== 0) process.exit(code);

console.log('== 2. build app ==');
code = await run('npm', ['run', 'build'], { cwd: APP_DIR });
if (code !== 0) process.exit(code);

console.log('== 3. preview 4177 ==');
const preview = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], { cwd: APP_DIR, stdio: 'pipe' });
preview.stdout.on('data', d => process.stdout.write(`[preview] ${d}`));
preview.stderr.on('data', d => process.stderr.write(`[preview] ${d}`));
if (!await waitPreview('http://localhost:4177/')) {
  console.error('Preview không lên sau 20 giây (cổng 4177 có thể đang bị chiếm — tắt preview cũ rồi chạy lại).');
  preview.kill('SIGTERM');
  process.exit(1);
}

let failed = false;
for (const s of SUITES) {
  console.log(`== ${s} ==`);
  const c = await run('node', [s], { cwd: HERE });
  if (c !== 0) { failed = true; console.error(`!! ${s} FAIL (exit ${c})`); }
}
preview.kill('SIGTERM');
console.log(failed ? 'NPM TEST: CÓ SUITE FAIL.' : 'NPM TEST: TẤT CẢ PASS.');
process.exit(failed ? 1 : 0);
