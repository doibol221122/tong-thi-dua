# Bộ kiểm thử App Tổng Thi Đua (bền, trong workspace — /tmp hay bị xóa)

Chạy toàn bộ bằng một lệnh (từ thư mục này):

```bash
npm test
```

`npm test` chạy `run-all.mjs`: build lại `lib.mjs` (unit) → build app →
mở preview ở cổng 4177 → chạy đủ 5 suite → tắt preview. Suite nào fail thì
lệnh trả về exit 1. Chạy lẻ từng suite: build app + mở preview 4177 trước
rồi `node test-<tên>.mjs`.

- `lib.mjs` — lib.ts bundle bằng esbuild (cho unit test). Build lại bằng
  đường dẫn TUYỆT ĐỐI: `npx esbuild src/lib.ts --bundle --format=esm
  --outfile=/home/hatch/workspace/tong-thi-dua-tests/lib.mjs` — đường dẫn
  `~/...` sau `--outfile=` sẽ lặng lẽ để lại bundle cũ.
- `run-all.mjs` — runner cho `npm test` (tìm thư mục app qua `APP_DIR`
  hoặc tự tìm `../tong-thi-dua` / `..` nên chạy được cả từ bản trong repo
  `tong-thi-dua/tests/`).
- `mkseed5.mjs` — tạo `seed5.json` (5 tuần, 14 lớp, 6 phiếu) + `seed-duty.json`
  (thêm roster Nguyễn Văn A trực 10B5 tuần 05). `seed-lock.json`/`seed-pick.json`
  do test-lock-names tự tạo từ seed5 (không commit, đã có trong .gitignore).
- `test-violnames.mjs` — unit (71 checks): tên HS theo mục, vắng tự tính,
  kiểm tra tên HS, dòng có điểm + dòng đã miễn, siết validation (P1-05),
  kiểm tra file JSON nhập (P0-08), điểm TB tháng + độ phủ nộp (D3),
  violLine khi tên/lượt lệch, phiếu trộn cũ+mới, tên file bỏ dấu.
- `test-lock-names.mjs` — Playwright (77 checks): A–F tên HS + vắng tự tính
  + khóa phiếu đã duyệt + ô chọn lớp trực + 100% đầu phiếu; G duyệt/trả
  chỉ với phiếu Chờ duyệt đủ điều kiện + mở lại phiếu đã nộp; H chép tuần
  trước theo số tuần + độ phủ nộp tháng; I nhập JSON (file lỗi bị từ chối,
  file đúng nhập được + tải sao lưu trước).
- `test-stepper.mjs` — unit (7 checks): stepper tăng/giảm một lần mỗi bấm.
- `test-week-norank.mjs` — Playwright (20 checks): .docx không xếp hạng
  (đủ 14 lớp theo thứ tự), .docx xếp hạng chỉ gồm phiếu đã duyệt (P0-06),
  .docx tháng (không số hạng khi chưa nộp + cột NỘP), tuần trống in câu
  "Chưa có phiếu nào được nộp trong tuần này", tên file có dấu ngày giờ.
- `test-smoke.mjs` — hồi quy gọn (35 checks): 5 mục dùng được, lịch trực,
  mời GVCN, cờ đỏ tự chọn, xếp hạng gọn; banner chế độ local + chip đồng
  bộ; mobile: thanh điểm không che ô cuối, tap target 44px, lưới xuất
  file 1 cột; stepper gõ rỗng hiện "nhập số".

Chạy Supabase-stubbed: build với `VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...` trước.
Đường dẫn Chromium headless shell mặc định:
`~/.cache/ms-playwright/chromium_headless_shell-1255/...`; đặt biến môi
trường `CHROMIUM_EXE` để đổi (dùng trong CI).

LƯU Ý (24/11/2026): /tmp/pwshot bị xóa nên các file test cũ (test-duty.mjs,
test-duty-ui.mjs, test-duty-sb.mjs, test-5items.mjs, test-selfpick.mjs,
test-selfpick-sb.mjs, test-month-docx.mjs, test-duty-sb-dbg.mjs, dbg-*.mjs,
paths-*.txt, live-*.js) đã mất. Các bộ SB (stub Supabase: đăng ký + gán trực +
link mời GVCN, màn hình đặt lại mật khẩu, banner xung đột) CHƯA được khôi phục
— còn là việc tồn đọng; nếu cần kiểm thử lại flow Supabase, viết lại từ
test-lock-names/test-smoke theo các quy tắc stub đã ghi trong MEMORY.md
(route pattern kết thúc bằng `*`, `.single()` trả object trần, count HEAD
cần header content-range, token JWT giả).
