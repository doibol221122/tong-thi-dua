# Bộ kiểm thử App Tổng Thi Đua (bền, trong workspace — /tmp hay bị xóa)

Chạy toàn bộ bằng một lệnh (từ thư mục này):

```bash
npm test
```

`npm test` chạy `run-all.mjs`: build lại `lib.mjs` (unit) → build app
(local) → mở preview ở cổng 4177 → chạy đủ 10 suite local → build lại
app với biến Supabase → preview lại 4177 → chạy 5 suite stub Supabase
→ tắt preview. Suite nào fail thì lệnh trả về exit 1. Chạy lẻ từng
suite: build app + mở preview 4177 trước rồi `node test-<tên>.mjs`
(suite stub cần build với biến Supabase, xem dưới).

- Trước khi chạy `npm test`, tắt mọi preview cũ trên cổng 4177
  (`fuser -k 4177/tcp`): preview cũ còn chạy thì preview của run-all
  không bind được (`--strictPort`) nhưng `waitPreview` vẫn thấy cổng
  có người trả lời nên tưởng preview của mình đã lên — các suite sẽ
  test nhầm bản cũ serve từ đĩa (đã gặp 25/11/2026, bộ test lần 2).
- `run-all.mjs` gỡ hẳn `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  khỏi môi trường của build local: nếu shell chạy test vô tình có 2
  biến này (rò từ lần build Supabase trước), vite nhúng Supabase vào
  bundle và mọi suite local đều thấy màn hình đăng nhập thay vì chọn
  vai trò (đã gặp 25/11/2026).
- Ở viewport 390px, hàng nút chọn lớp bị `display:none` (P2-06) nên
  `getByRole` KHÔNG thấy chúng (cây accessibility bỏ phần tử ẩn) —
  chọn lớp bằng dropdown `.class-select-wrap select` (selectOption
  theo label) hoặc CSS selector `.class-btns button` + evaluate(click)
  khi cần giữ nguyên focus (test H1 của autofill).

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
  `seed-duty2.json` = seed-duty + roster Trần Thị B trực 10B2 tuần 05
  (cho test-lock-duty, P1-08).
- `test-violnames.mjs` — unit (92 checks): tên HS theo mục, vắng tự tính,
  kiểm tra tên HS, dòng có điểm + dòng đã miễn, siết validation (P1-05),
  kiểm tra file JSON nhập (P0-08), điểm TB tháng + độ phủ nộp (D3),
  violLine khi tên/lượt lệch, phiếu trộn cũ+mới, tên file bỏ dấu,
  + 9 unit check `findDutyHolder` (P1-08).
- `test-lock-names.mjs` — Playwright: A–F tên HS + vắng tự tính
  + khóa phiếu đã duyệt + ô chọn lớp trực + 100% đầu phiếu; G duyệt/trả
  chỉ với phiếu Chờ duyệt đủ điều kiện + mở lại phiếu đã nộp; H chép tuần
  trước theo số tuần + độ phủ nộp tháng; I nhập JSON (file lỗi bị từ chối,
  file đúng nhập được + tải sao lưu trước). Bộ test lần 3 (25/11): fail
  tại H — bấm tab Tổng hợp khi bản nháp đang dirty (sau chép tuần trước)
  thì hộp thoại xác nhận trong app mở ra, test chưa bấm Xác nhận nên
  tab không chuyển, không thấy nút "Theo tháng" (thiếu 1 lần bấm
  `getByTestId('confirm-ok')`; xem pro2-progress.md).
- `test-stepper.mjs` — unit (7 checks): stepper tăng/giảm một lần mỗi bấm.
- `test-week-norank.mjs` — Playwright (20 checks): .docx không xếp hạng
  (đủ 14 lớp theo thứ tự), .docx xếp hạng chỉ gồm phiếu đã duyệt (P0-06),
  .docx tháng (không số hạng khi chưa nộp + cột NỘP), tuần trống in câu
  "Chưa có phiếu nào được nộp trong tuần này", tên file có dấu ngày giờ.
- `test-smoke.mjs` — hồi quy gọn: 5 mục dùng được, lịch trực,
  mời GVCN, cờ đỏ tự chọn, xếp hạng gọn; banner chế độ local + chip đồng
  bộ; mobile: thanh điểm không che ô cuối, tap target 44px, lưới xuất
  file 1 cột; stepper gõ rỗng hiện "nhập số"; dòng bản quyền cuối trang.
  Bộ test lần 3 (25/11): fail ở check lưới xuất file — cùng nguyên nhân
  như lock-names H (gõ Giờ Tốt làm dirty, bấm tab Xếp hạng mở hộp thoại
  xác nhận, test chưa bấm Xác nhận nên `.exportgrid` không có;
  thiếu 1 lần bấm `getByTestId('confirm-ok')`).
- `test-autofill.mjs` (pro-2, 4 checks) — lỗi "đang nhập mà tự động điền
  lỗi khác": giữ nút `+` ở một mục rồi bấm `+` ở mục khác / gõ tên HS thì
  mục kia không bị reset; đổi lớp rồi quay lại thì ô nhập hiện đúng số
  của phiếu đang mở.
- `test-lock-duty.mjs` (pro-2, 11 checks, seed `seed-duty2.json` = seed-duty
  + cờ đỏ thứ hai Trần Thị B trực 10B2 tuần 05) — P1-08: hai cờ đỏ cùng
  lớp/tuần thì người sau bị khóa + nêu tên người giữ (cả ở DutyPicker lẫn
  cảnh báo trong phiếu); chọn lại lớp mình thì mở; người giữ tự mở lớp
  mình thì không bị khóa.
- `test-mobile.mjs` (pro-2, 29 checks, viewport 390px + 1280px) — P2-04 +
  P2-06: header gọn ≤120px, dòng tóm tắt header, menu ⋮ (Đăng xuất / Đổi
  vai trò), dropdown chọn lớp, dấu mờ "còn nữa" ở mép phải tab, chữ phụ
  13px, Lịch sử chỉ render một bản log theo chiều rộng, không tràn ngang
  ở cả 5 tab; màn rộng giữ nguyên nút lớp + chip lẻ + log dạng bảng.
- `test-codo-tabs.mjs` (pro-2, 20 checks) — cờ đỏ chỉ 2 tab (Nhập điểm +
  Xếp hạng); banner trả phiếu vẫn thấy ngay khi đăng nhập; xếp hạng tháng
  (mặc định tháng mới nhất, chỉ tính phiếu duyệt, lớp chưa duyệt hiện "—",
  lọc khối đúng cả hai chế độ); admin 6 tab, chỉ xem 4 tab; guard đổi vai
  trò từ Tổng quan sang cờ đỏ không để trang trắng.
- `test-confirm.mjs` (pro-2, 10 checks) — P2-05: xóa tuần mở hộp thoại
  trong app nêu đúng số phiếu sẽ mất (4 phiếu tuần 05), nút Xác nhận đỏ;
  Hủy thì không đổi, Xác nhận thì xóa thật, tuần hiện tại lùi về tuần trước.

Chạy Supabase-stubbed: build với `VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...` trước.
Build local không có biến môi trường sẽ loại bỏ nhánh Supabase khỏi bundle
(`isSupabaseConfigured=false`, app chạy chế độ chọn vai trò) — kiểm chứng
chuỗi Supabase trên bundle build với biến môi trường trước khi chạy suite stub.
Đường dẫn Chromium headless shell mặc định:
`~/.cache/ms-playwright/chromium_headless_shell-1255/...`; đặt biến môi
trường `CHROMIUM_EXE` để đổi (dùng trong CI).

- `sb-stub.mjs` — helper dùng chung cho các suite stub: máy chủ Supabase giả
  (Auth + PostgREST) qua route Playwright, có trạng thái (users, profiles,
  dòng app_state + version). Dùng chung cho cả 5 suite stub.
- `test-supabase-register.mjs` — đăng ký (23 checks): tài khoản đầu thành admin/active,
  tài khoản sau thành pending đúng vai trò, requested_role lạ không leo thang,
  trùng email bị từ chối; phần E (pro-2, P2-09): dòng tài khoản của chính
  mình có badge "Tài khoản của bạn" và KHÔNG có nút Xóa tài khoản, dòng khác
  vẫn có nút Xóa; hàng hồ sơ dùng lưới `.prof-grid` (P2-04).
- `test-supabase-duty.mjs` — gán trực: A (17 checks, pass): roster tuần
  hiện tại ưu tiên (chip "Trực lớp", banner "(lớp bạn trực)"), cờ đỏ tự
  chọn lớp trực (ghi 1 dòng roster, đồng bộ remote), lớp đã nộp/duyệt bị
  khóa, chưa có roster thì vào DutyPicker. B/C (thêm 25/11/2026 theo yêu
  cầu làm rõ "lớp của cờ đỏ" vs "lớp trực" — cha làm trực tiếp, app đang
  sửa dở nên bộ test lần 3 fail tại B): cờ đỏ chỉ có lớp của mình trong
  hồ sơ (không có roster) thì vào thẳng DutyPicker với gợi ý theo lịch
  trực từ lớp của mình, KHÔNG tự khóa vào lớp của mình, header không
  hiện chip "Lớp ..." theo hồ sơ.
- `test-supabase-invite.mjs` (16 checks) — link mời GVCN: Ban thi đua chép link
  `?lop=...&vai-tro=chi-xem&dang-ky=1`, mở link ra form đăng ký Chỉ xem với
  lớp điền sẵn, đăng ký xong hồ sơ viewer + pending + lớp chủ nhiệm gán sẵn.
- `test-supabase-recovery.mjs` (16 checks) — đặt lại mật khẩu: gửi link (POST
  /auth/v1/recover), link `?code=` mở form (chỉ mở theo URL, flow implicit
  không đổi session), link hash `#access_token=...&type=recovery` mở form có
  session thật, kiểm tra mật khẩu ngắn/lệch, đặt xong updateUser + đăng xuất
  + đăng nhập lại bằng mật khẩu mới được, mật khẩu cũ hết dùng.
- `test-supabase-conflict.mjs` (16 checks) — banner xung đột: máy khác lưu mới hơn rồi
  máy này sửa + lưu -> banner hiện, dữ liệu local không mất, remote không bị
  ghi đè; "Xem bản mới" lấy bản remote; "Giữ bản của tôi" ghi đè có xác nhận.

QUY TẮC STUB (vi phạm là test sai — đã kiểm chứng bằng probe):
- Mọi response stub phải có header `access-control-allow-origin: *` và
  `access-control-expose-headers: content-range`.
- `.single()` stub bằng object trần, KHÔNG phải mảng (chỉ `maybeSingle()`
  mới unwrap mảng). Trả mảng cho `.single()` làm postgrest hiểu sai
  (profile thành mảng -> `p.status` undefined -> app kẹt ở màn hình đăng nhập).
- Token giả phải là JWT thực tế: base64url header + payload có
  sub/email/exp 4102444800/aud authenticated + '.sig'; signup stub gồm
  `expires_at` và user object đầy đủ.
- Pattern route kết thúc bằng `*` (vd `**/auth/v1/signup*`) để khớp query string.
- Đếm HEAD `select=id` trả `content-range: 0-0/N`, body rỗng.
- Lưu có điều kiện (PATCH app_state): khớp `version=eq.N` /
  `updated_at=eq.X` với bản remote hiện tại; lệch thì trả [] để
  `maybeSingle()` -> null -> app báo xung đột.
- Headless shell không ra được internet: stub TẤT CẢ request tới supabase.co
  (REST + auth). `navigator.clipboard.writeText` không chạy được trên
  headless shell — stub qua addInitScript vào `window.__copied` nếu cần.

LƯU Ý (24/11/2026): /tmp/pwshot bị xóa nên các file test cũ (test-duty.mjs,
test-duty-ui.mjs, test-duty-sb.mjs, test-5items.mjs, test-selfpick.mjs,
test-selfpick-sb.mjs, test-month-docx.mjs, test-duty-sb-dbg.mjs, dbg-*.mjs,
paths-*.txt, live-*.js) đã mất. Các bộ SB (stub Supabase) đã được khôi phục
lại ngày 25/11/2026 thành 5 suite test-supabase-*.mjs + sb-stub.mjs.
Bộ test lần 3 ngày 25/11/2026 (sau khi sửa run-all gỡ biến Supabase khỏi
build local + tắt preview cũ): 12/15 suite pass — register/invite/recovery/
conflict pass; duty fail tại phần B mới (app đang sửa dở, xem trên).
