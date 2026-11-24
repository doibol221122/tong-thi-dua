# Audit — Nâng cấp toàn diện App Tổng Thi Đua (vận hành chuyên nghiệp)

- Ngày audit: 2026-11-24. Phạm vi: `~/workspace/tong-thi-dua` (`src/App.tsx` 1.312 dòng, `src/lib.ts` 442 dòng, `src/docxExport.ts` 211 dòng, `src/supabase.ts`, `src/AuthScreen.tsx`, `supabase/schema.sql`, `src/index.css`) + `~/workspace/tong-thi-dua-tests` (README + 5 suite hiện có).
- Phương pháp: đọc toàn bộ code (không chạy app live, không kiểm tra Supabase Dashboard — các mục cần Dashboard được đánh dấu riêng). Chỉ ghi nhận lỗi đã xác minh bằng dòng code cụ thể; không đưa lời khuyên chung chung.
- Cách đọc: **P0 = phải sửa trước khi gọi là vận hành chuyên nghiệp** (mất dữ liệu, lộ quyền admin, sai kết quả chính thức, khoá tài khoản). **P1 = nên có** (đúng quy trình, chống sai sót, dùng được trên điện thoại). **P2 = nên làm khi rảnh** (đánh bóng, dọn code). Mỗi mục có cách kiểm thử để sau này nghiệm thu.
- Thứ tự làm gợi ý: P0-01 + P0-02 (cùng một đợt SQL) → P0-03/04/05 (đồng bộ) → P0-06/07/08 (tính đúng) → P0-09/10 (tài khoản) → P1 theo cụm.

---

## P0 — Phải sửa

### P0-01. RLS hiện tại cho phép bất kỳ tài khoản nào tự lên admin, khoá admin thật, xoá tài khoản, đọc hết danh sách
- **Vấn đề:** Mọi kiểm tra quyền chỉ nằm ở giao diện. Ai đăng nhập rồi cũng gọi thẳng Supabase REST là làm được hết: tự sửa `role='admin', status='active'` cho chính mình; sửa/xoá hồ sơ của người khác (kể cả admin duy nhất); đọc toàn bộ tên/email/vai trò/trạng thái của mọi tài khoản.
- **Bằng chứng:** `supabase/schema.sql:60-62` policy update `using (true) with check (true)` (không có `auth.uid() = id`, không giới hạn cột); `:70-72` policy delete `using (true)`; `:49-51` select `using (true)`; `src/supabase.ts:119-126` `updateProfile()` là `update(patch)` trần, không kiểm tra vai trò người gọi; `src/App.tsx:1179-1192` chỉ giấu nút ở UI.
- **Đề xuất (SQL, chạy trong Dashboard → SQL Editor):**
  - `profiles` select: chỉ đọc được dòng của mình, hoặc toàn bộ nếu mình là admin: `using (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))`.
  - `profiles` update: người thường chỉ được sửa dòng của mình và chỉ cột `assigned_class_id` (để chọn lớp ở màn hình chờ duyệt); đổi `role`/`status`/`assigned_week_id` chỉ admin được làm (điều kiện `EXISTS … role='admin'`).
  - `profiles` delete: chỉ admin.
  - Thu hồi quyền bảng của `anon`: `revoke all on public.profiles, public.app_state from anon;` (hiện `schema.sql:43-44` cấp cả cho `anon`; RLS đang chặn anon nhưng chỉ cần một lần sửa policy nhầm là lộ).
  - Giữ nguyên: insert chỉ được tạo dòng của chính mình (`schema.sql:54-56` đã đúng); không dùng `service_role` trong app.
- **Kiểm thử:** Dùng token của một tài khoản cờ đỏ gọi REST: `PATCH /rest/v1/profiles?id=eq.<mình> {role:'admin'}` phải trả 403/0 dòng; `DELETE /rest/v1/profiles?id=eq.<admin>` phải thất bại; `GET /rest/v1/profiles` với tài khoản thường chỉ trả dòng của mình. Ghi các lệnh này thành checklist tay (RLS không test được bằng suite local hiện có).
- **Cần Dashboard:** có — chạy SQL mới trong SQL Editor rồi kiểm tra lại đăng nhập/đăng ký/duyệt tài khoản trên app live.

### P0-02. Không có sao lưu / lịch sử phiên bản cho dữ liệu dùng chung — một lần ghi đè là mất hết
- **Vấn đề:** Toàn bộ dữ liệu (tuần, lớp, phiếu, roster, nhật ký) nằm trong một dòng JSON duy nhất `app_state` id `'main'`. Không có bản sao, không có lịch sử, không có thùng rác. Ai ghi đè (lỗi đồng bộ, import JSON lỗi, tài khoản xấu — xem P0-01) thì không có cách nào khôi phục ngoài bản localStorage còn sót trên từng máy.
- **Bằng chứng:** `supabase/schema.sql:27-32` (một bảng, một dòng, không có bảng lịch sử); `src/supabase.ts:147-158` `saveSharedState` là upsert ghi đè toàn bộ, không điều kiện; không có trigger/backup nào trong schema.
- **Đề xuất:**
  - Thêm bảng `app_state_history (id, data jsonb, updated_at, updated_by)` + trigger `BEFORE UPDATE ON app_state` lưu bản cũ (giữ tối đa ~30 bản gần nhất, xoá bản cũ hơn bằng trigger hoặc job tay).
  - Thêm trong Quản lý: mục "Sao lưu & khôi phục" — nút "Tải JSON sao lưu" (đã có xuất JSON, cần đặt tên file có ngày giờ) và "Khôi phục phiên bản…" liệt kê các bản trong `app_state_history` (ngày giờ + người ghi) kèm xác nhận; mỗi lần khôi phục ghi log.
  - Quy trình tay cho tới khi có tính năng: trước mỗi đợt nhập/xoá lớn, admin tải một bản JSON sao lưu.
- **Kiểm thử:** Playwright (chế độ local + stub Supabase): sửa dữ liệu → kiểm tra `app_state_history` có thêm 1 bản; bấm Khôi phục bản cũ → dữ liệu trở về đúng bản đó; kiểm tra số bản không vượt giới hạn.
- **Cần Dashboard:** có — tạo bảng + trigger bằng SQL.

### P0-03. Lần tải đầu tiên lỗi có thể ghi đè dữ liệu chung bằng dữ liệu local (kể cả local trống)
- **Vấn đề:** Nếu lần đầu tải dữ liệu chung bị lỗi mạng (hoặc dòng remote bị hỏng), app vẫn đánh dấu "đã tải xong" rồi hiệu ứng lưu chạy và đẩy dữ liệu trên máy này lên — vì biến so sánh `remoteUpdatedAtRef` đang null nên bước kiểm tra xung đột bị bỏ qua. Một trình duyệt mới (local trống) có thể xoá sạch dữ liệu chung của cả trường.
- **Bằng chứng:** `src/App.tsx:200-212` — `.catch()` chỉ hiện lỗi rồi `.finally` vẫn `setRemoteLoaded(true)`; `:219-239` hiệu ứng lưu chạy khi `remoteLoaded`, guard ở `:224` yêu cầu `remoteUpdatedAtRef.current` khác null nên sau lần tải lỗi guard bị qua mặt và `:231` lưu local lên; `src/supabase.ts:143` trả `{data: null}` khi dòng remote thiếu `settings`/`weeks` nên `:205-209` coi như "chưa có dữ liệu" và tải local lên.
- **Đề xuất:** Chỉ set `remoteLoaded=true` khi tải thành công (kể cả trường hợp thật sự chưa có dòng nào — phân biệt "không có dòng" với "tải lỗi" bằng cờ riêng). Hiệu ứng lưu không chạy khi lần tải đầu chưa thành công. Dòng remote sai định dạng → màn hình lỗi rõ ràng ("Dữ liệu chung bị lỗi, chưa ghi đè — liên hệ Ban thi đua") và không tải gì lên.
- **Kiểm thử:** Playwright stub Supabase: giả lập `GET app_state` lỗi 500 → assert không có request upsert nào; giả lập dòng remote thiếu `settings` → assert không upsert và hiện banner lỗi. Test unit cho `fetchSharedState` với dòng hỏng → trả lỗi thay vì `null`.

### P0-04. "Đã lưu & nộp" hiện trước khi dữ liệu tới máy chủ; lỗi đồng bộ mất hút, không thử lại
- **Vấn đề:** Nút Lưu hiện thông báo thành công ngay sau khi lưu local; việc ghi lên Supabase chạy sau đó ~1 giây ở chế độ nền. Nếu ghi lỗi, người dùng chỉ thấy một banner lỗi — banner này biến mất khi chuyển lớp/tuần, không có nút thử lại, không có trạng thái "đang lưu/đã lưu lúc…". Một cờ đỏ có thể làm cả buổi mà dữ liệu chỉ nằm trên máy mình.
- **Bằng chứng:** `src/App.tsx:440-441` `saveScore` hiện thông báo thành công ngay sau `setState` local; `:233-235` lỗi lưu chỉ `setErrs([...])`, không thử lại, không cờ bẩn; `:313-318` đổi tuần/lớp là xoá `errs`; `:261-265` thông báo thành công tự ẩn sau 5 giây; không có chỉ báo đồng bộ nào trong UI (grep "Đã đồng bộ/Đang đồng bộ" = 0 kết quả).
- **Đề xuất:**
  - Thêm chỉ báo trạng thái đồng bộ cố định (gần header hoặc trên thanh điểm): `Đang lưu…` / `Đã đồng bộ lúc 21:04` / `Lỗi đồng bộ — Thử lại` (nút thử lại gọi lại lần lưu).
  - Chỉ hiện "Đã lưu & nộp" sau khi lần ghi (hoặc lần ghi debounce) thành công; khi đang chờ ghi thì hiện "Đang lưu…".
  - Lỗi đồng bộ không bị xoá khi chuyển tab/lớp/tuần; chỉ xoá khi đã đồng bộ thành công hoặc người dùng bấm bỏ qua.
  - Hàng đợi thử lại: lần lưu lỗi được thử lại tự động (tối đa 3 lần, cách nhau vài giây) rồi mới dừng ở trạng thái lỗi.
- **Kiểm thử:** Playwright stub: giả lập upsert lỗi → assert chỉ báo hiện "Lỗi đồng bộ" + nút Thử lại, không hiện "Đã lưu"; bấm Thử lại (stub đổi sang thành công) → chỉ báo chuyển "Đã đồng bộ lúc …". Test chuyển lớp khi đang lỗi → banner lỗi vẫn còn.

### P0-05. Xung đột ghi đè lặng lẽ: hai người sửa cùng lúc thì một bên mất việc không hay biết
- **Vấn đề:** Cơ chế "tránh ghi đè bản mới hơn" chỉ là đọc-kiểm tra-rồi-ghi bằng 2 request riêng, không có gì nguyên tử. Hai máy cùng qua bước kiểm tra thì máy ghi sau thắng, máy ghi trước mất. Ngược lại, khi máy chủ có bản mới hơn, hiệu ứng lưu thay toàn bộ state local bằng bản remote mà không báo gì — các thay đổi local chưa kịp lưu biến mất. Cả hai chiều đều im lặng.
- **Bằng chứng:** `src/supabase.ts:147-158` upsert không điều kiện, comment tự ghi "last-write-wins"; `src/App.tsx:221-232` — nếu remote mới hơn thì `setState(remote.data)` rồi `return` (không lưu local, không báo); `:244-257` làm mới 45 giây cũng `setState(remote.data)` vô điều kiện, không kiểm tra có thay đổi local đang chờ lưu hay lần lưu trước đã lỗi; `:257` `catch {}` nuốt lỗi.
- **Đề xuất:**
  - Lưu có điều kiện: dùng `update().eq('updated_at', lastSeen)` và kiểm tra số dòng bị ảnh hưởng; nếu 0 dòng → có xung đột → hiện banner "Có máy khác vừa lưu mới hơn — [Xem bản mới] [Giữ bản của tôi (ghi đè, có xác nhận)]", không tự thay state.
  - Dừng vòng làm mới 45 giây khi đang có lần lưu chờ xử lý hoặc đang lỗi đồng bộ; làm mới chỉ thay state khi không có thay đổi local chưa lưu.
  - Thêm cột version số nguyên cho `app_state` (thay cho so sánh chuỗi timestamp) để lần sau đối chiếu chắc chắn hơn.
- **Kiểm thử:** Playwright stub 2 client: client A sửa, client B sửa cùng lúc → assert client thua hiện banner xung đột và dữ liệu của mình không mất; test làm mới 45 giây không xoá thay đổi đang chờ lưu.
- **Cần Dashboard:** có (nhỏ) — thêm cột version nếu chọn hướng đó.

### P0-06. File .docx xếp hạng đang xếp cả phiếu chưa duyệt — khác hẳn CSV và bảng xếp hạng trong app
- **Vấn đề:** Nút "Xuất Word (.docx)" ở tab Xếp hạng xuất cả phiếu nháp/chờ duyệt/bị trả lại và xếp hạng chúng chung với phiếu đã duyệt. Cùng một tuần, file .docx và file CSV cho hai bảng xếp hạng khác nhau (CSV chỉ lấy phiếu đã duyệt). Một phiếu nháp có thể đứng trên phiếu đã duyệt trong văn bản chính thức.
- **Bằng chứng:** `src/docxExport.ts:72-75` `exportWeekDocx(s, week, approvedOnly)` lọc `(!approvedOnly || x.status === 'approved')`; `src/App.tsx:518` gọi với `approvedOnly=false`; ngược lại CSV `src/App.tsx:537-539` chỉ lấy `status === 'approved'` và bảng xếp hạng `src/App.tsx:570` cũng chỉ lấy phiếu đã duyệt. Dòng "Ưu điểm" trong file (`docxExport.ts:91`) cũng kể cả lớp chưa duyệt.
- **Đề xuất:** Nút Xuất Word xếp hạng gọi `exportWeekDocx(state, week, true)`. (File "không xếp hạng" đã có riêng cho việc rà soát trước duyệt — không đổi.)
- **Kiểm thử:** Mở rộng `test-week-norank.mjs`: tải file .docx xếp hạng của tuần có cả phiếu nháp/chờ duyệt/đã duyệt → assert chỉ có lớp đã duyệt trong bảng, số TT liên tục, không có lớp nháp.
- **Cần quyết định của người dùng:** xác nhận "file xếp hạng chính thức chỉ gồm phiếu đã duyệt" (gần như chắc chắn là đúng, nhưng đây là văn bản chính thức nên cần chốt).

### P0-07. Admin duyệt thẳng phiếu nháp được — vòng nộp/duyệt và validation bị qua mặt hoàn toàn
- **Vấn đề:** Nút "Duyệt phiếu" hiện với mọi phiếu chưa duyệt (nháp, chờ duyệt, bị trả lại) và hàm duyệt không kiểm tra trạng thái cũng không chạy validation. Một phiếu nháp nhập dở (0 giờ, số liệu vô lý) có thể thành "Đã duyệt" bằng một cú bấm rồi chui vào xếp hạng, CSV, điểm trung bình tháng. "Duyệt tất cả" cũng không validation phiếu nào.
- **Bằng chứng:** `src/App.tsx:442-447` `approveScore` chỉ kiểm tra admin + phiếu tồn tại; `:1115` nút Duyệt render cho mọi trạng thái chưa duyệt; `:474-481` `returnScore` cũng không kiểm tra trạng thái (phiếu nháp chưa nộp cũng thành "Bị trả lại", trả lại lần nữa ghi đè lý do cũ); `:449-458` duyệt tất cả không validation; `src/lib.ts:272-278` `validateDetails` chỉ chạy khi nộp (`App.tsx:425`).
- **Đề xuất:** `approveScore` chỉ chạy khi `status === 'submitted'` và `validateDetails` rỗng, nếu không báo rõ lý do; `returnScore` cũng chỉ khi `submitted`; nút Duyệt/Trả lại chỉ hiện khi phiếu đang chờ duyệt (phiếu nháp chỉ có Lưu/Nộp; phiếu bị trả lại chỉ có Sửa rồi Nộp lại). "Duyệt tất cả" bỏ qua/không duyệt phiếu nào lỗi validation và báo danh sách đó.
- **Kiểm thử:** Playwright (mở rộng Part E trong `test-lock-names.mjs`): mở phiếu nháp → assert không có nút Duyệt; phiếu chờ duyệt nhưng 0 giờ → bấm Duyệt → assert vẫn ở chờ duyệt + hiện lỗi; phiếu chờ duyệt hợp lệ → duyệt được.

### P0-08. Import JSON thay toàn bộ dữ liệu không xác nhận, không sao lưu, không kiểm tra gì
- **Vấn đề:** Chỉ cần file JSON có `settings` và `weeks` là mảng là toàn bộ dữ liệu bị thay thế: `scores`/`classes`/`roster`/`logs` không được kiểm tra; số âm, `NaN`, trùng id, phiếu trỏ tới lớp/tuần không tồn tại đều chui vào được; `NaN` ở một trường giờ còn vô hiệu luôn cả quy tắc validation duy nhất (vì `NaN === 0` là false) rồi làm điểm thành `NaN`, phá sắp xếp trong các file xuất. Không có xác nhận, không sao lưu trước, không ghi log, bản nháp đang sửa vẫn trỏ tới lớp/tuần có thể đã bị xoá.
- **Bằng chứng:** `src/App.tsx:547-554` `importJson` chỉ kiểm tra `p.settings` + `Array.isArray(p.weeks)` rồi `setState(p)`; `src/lib.ts:239-255` tính điểm không chặn âm; `src/lib.ts:274` `NaN === 0` false.
- **Đề xuất:** Trước khi import: `window.confirm` + tự động tải một bản JSON sao lưu của dữ liệu hiện tại + ghi log "Nhập JSON". Validator riêng (`validateImportedState` trong `lib.ts`): đủ các mảng đúng kiểu; id duy nhất; score trỏ tới class/week có thật; mọi số là số hữu hạn ≥ 0 và nguyên (trừ điểm cộng/trừ đột xuất theo quy tắc P1-05); trùng (class, tuần) thì giữ bản mới nhất theo `updatedAt`. Import lỗi → từ chối toàn bộ, giữ nguyên dữ liệu, báo rõ lỗi đầu tiên.
- **Kiểm thử:** Unit test cho `validateImportedState`: file thiếu `scores`, file có số âm, file có `NaN`, file trùng phiếu → assert bị từ chối hoặc được sửa đúng; Playwright: import file xấu → dữ liệu không đổi + hiện lỗi; import file tốt → có log.

### P0-09. Quên mật khẩu thì bế tắc: có gửi email đặt lại nhưng trong app không có chỗ đặt mật khẩu mới
- **Vấn đề:** Bấm "Quên mật khẩu" chỉ gửi email; bấm link trong email quay lại app thì app coi như đăng nhập thường, không có màn hình đặt mật khẩu mới. Người quên mật khẩu không tự lấy lại được tài khoản — phải nhờ admin can thiệp ngoài app.
- **Bằng chứng:** `src/AuthScreen.tsx:90-100` `onForgot` gửi `resetPasswordForEmail` với `redirectTo: window.location.origin`; tìm toàn repo không có `updateUser`, `PASSWORD_RECOVERY`, hay xử lý code đổi mật khẩu; `src/main.tsx:5-17` không xử lý recovery.
- **Đề xuất:** Thêm màn hình "Đặt mật khẩu mới" (lắng nghe `PASSWORD_RECOVERY` / kiểm tra `?code=` khi tải app) gọi `supabase.auth.updateUser({ password })` rồi chuyển về đăng nhập; kiểm tra lại Redirect URL trong Dashboard cho khớp origin.
- **Kiểm thử:** Playwright stub auth: giả lập session recovery → assert hiện form đặt mật khẩu mới; nhập mật khẩu ngắn → báo lỗi; nhập hợp lệ → gọi `updateUser` và về màn hình đăng nhập.
- **Cần Dashboard:** có — kiểm tra Redirect URLs có chứa `https://tong-thi-dua.vercel.app`.

### P0-10. Thiếu biến môi trường thì app lặng lẽ chạy chế độ local, ai cũng tự chọn vai trò admin
- **Vấn đề:** Nếu deploy Vercel thiếu/sai `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, app không báo gì mà chạy bằng localStorage, vai trò do người dùng tự chọn — ai cũng bấm được "Ban thi đua". Người dùng tưởng đang dùng đăng nhập chung Supabase trong khi dữ liệu chỉ nằm trên một máy.
- **Bằng chứng:** `src/supabase.ts:13-20` `isSupabaseConfigured = Boolean(url && anonKey)`, sai thì `supabase = null`; `src/App.tsx:73-76` chế độ này lấy phiên/vai trò từ `localStorage` (tự chọn); không có banner hay lỗi chặn nào cho chế độ này.
- **Đề xuất:** Khi build production mà không cấu hình Supabase: hiện banner cảnh báo cố định, không tự biến mất — "CHƯA CẤU HÌNH SUPABASE — dữ liệu chỉ lưu trên máy này, không đồng bộ" — và vô hiệu hoá nút tự chọn vai trò Ban thi đua (hoặc yêu cầu xác nhận rõ ràng). Chế độ local vẫn giữ cho dev, nhưng phải nhìn thấy được.
- **Kiểm thử:** Build không có biến môi trường, chạy preview local → assert banner cảnh báo hiện và nút chọn Ban thi đua bị chặn/có cảnh báo; build có biến môi trường → không có banner.

---

## P1 — Nên có

### P1-01. Lỗ ghi `app_state`: tài khoản thường vẫn ghi đè được toàn bộ dữ liệu (cần thay đổi mô hình dữ liệu mới chặn triệt để)
- **Vấn đề:** Vì mọi dữ liệu nằm chung một dòng JSON nên bất kỳ ai đăng nhập cũng có quyền ghi toàn bộ — không thể phân biệt "cờ đỏ chỉ được sửa phiếu lớp mình" với "admin được sửa mọi thứ" ở tầng database. P0-01 chặn được leo thang quyền tài khoản, nhưng lỗ này thì không.
- **Bằng chứng:** `supabase/schema.sql:75-85` policy `app_state` update/insert `using (true)`; `src/supabase.ts:149-158` upsert không kiểm tra vai trò.
- **Đề xuất (2 nấc):** Nấc 1 (làm ngay): P0-02 (lịch sử phiên bản + sao lưu) để mọi ghi đè đều khôi phục được; thêm bảng `audit_log` ngoài blob ghi lại ai ghi `app_state` lúc nào (trigger). Nấc 2 (refactor lớn, cần quyết định): tách `scores`/`weeks`/`classes`/`roster` thành bảng riêng với RLS theo vai trò (cờ đỏ chỉ insert/update phiếu của lớp mình, admin toàn quyền) — lúc đó mới hết lỗ.
- **Kiểm thử:** Nấc 1: ghi đè dữ liệu → `audit_log`/`app_state_history` ghi đủ ai/lúc nào/bản cũ. Nấc 2: test RLS như P0-01.
- **Cần quyết định:** có làm nấc 2 (refactor lớn, đổi cách đồng bộ) hay dừng ở nấc 1.

### P1-02. Điểm trung bình tháng thưởng cho lớp nộp thiếu tuần
- **Vấn đề:** Điểm trung bình tháng chia cho số phiếu đã duyệt, không phải số tuần trong tháng — lớp chỉ nộp 1/4 tuần được 120đ sẽ xếp trên lớp nộp đủ 4 tuần trung bình 110đ. Lớp không có phiếu đã duyệt vẫn nhận số TT xếp hạng bên cạnh dấu "—". Lớp có điểm trung bình thật dưới −1 (điểm không có sàn) còn xếp dưới cả lớp không có dữ liệu vì dùng −1 làm mốc "không có dữ liệu".
- **Bằng chứng:** `src/lib.ts:158-162` `classAvg` chia cho `list.length` (số phiếu đã duyệt); `src/docxExport.ts:156` sắp xếp `(y.a ?? -1) - (x.a ?? -1)`; `:165-169` vẫn đánh số TT `i+1` cho lớp `a === null`.
- **Đề xuất:** Chọn một quy tắc rồi ghi rõ trong file: hoặc trung bình trên tất cả tuần của tháng (tuần chưa có phiếu duyệt tính 0đ), hoặc chỉ xếp hạng lớp nộp đủ tuần (lớp thiếu tuần xuống nhóm "chưa đủ dữ liệu", không có TT). Không dùng −1 làm mốc; dùng `null` và sắp riêng.
- **Kiểm thử:** Unit test `classAvg` + test Playwright tải file .docx tháng: lớp nộp 1/4 tuần không đứng trên lớp nộp đủ; lớp không có dữ liệu không có số TT.
- **Cần quyết định:** chọn quy tắc nào (ảnh hưởng trực tiếp tới xếp hạng tháng).

### P1-03. Đồng bộ các chi tiết xuất file: nhãn trạng thái, dòng "Ưu điểm", phiếu lớp
- **Vấn đề:** (a) Phiếu bị trả lại ghi "Trả lại" trong .docx tuần nhưng "Bị trả lại" trong CSV và trong app. (b) Dòng "Ưu điểm" trong cả hai file tuần kể cả lớp chưa duyệt (đi kèm P0-06). (c) File .docx phiếu từng lớp xuất được cho cả phiếu nháp/bị trả lại mà không hiện trạng thái hay lý do trả lại, lại dùng khối ký tên khác với file tuần/tháng.
- **Bằng chứng:** `src/docxExport.ts:87,111` dùng `'Trả lại'`; `src/App.tsx:18` `STATUS_LABEL` + CSV dùng `'Bị trả lại'`; `docxExport.ts:91,135-136` dòng pros không lọc trạng thái; `:188-211` `exportClassDocx` không kiểm tra trạng thái, không hiện `returnReason`, ký tên kiểu khác (`:206-207` so với `signRows` chung).
- **Đề xuất:** Thống nhất `'Bị trả lại'` ở mọi nơi; dòng pros chỉ tính phiếu đã duyệt; `exportClassDocx` in thêm dòng "Trạng thái: …" (+ lý do trả lại nếu có) và dùng chung `signRows`.
- **Kiểm thử:** Mở rộng `test-week-norank.mjs`: assert nhãn "Bị trả lại" thống nhất giữa .docx và CSV; file phiếu lớp của phiếu bị trả lại có hiện lý do.

### P1-04. Dòng trong phiếu cộng lại không ra tổng điểm; giá trị đã "miễn" biến mất khỏi phiếu in
- **Vấn đề:** (a) Cộng các dòng trong phiếu không ra được (1)/(2) hiển thị: "Điểm tốt (≥5): 12" không ghi +12đ, "Giờ tốt: 100% tốt" không ghi +20đ (trong khi dòng +10đ không vắng thì có ghi). (b) Khi tích 100%, toàn bộ số liệu đã nhập ở mục đó biến mất khỏi phiếu: giờ Khá/TB/Yếu, số vắng (kể cả vắng có phép thật, không phải lỡ nhập) và tên HS vắng/muộn đều không còn — người duyệt phiếu in không thấy lớp từng có 3 giờ Khá, 2 đi muộn đã được miễn.
- **Bằng chứng:** `src/lib.ts:283-285` (giờ 100% không ghi +20đ, điểm tốt không ghi điểm); `:300-306` (tích 100% không vắng thì thay dòng Vắng và ẩn dòng `lateLate`/`late`); `src/lib.ts:239,243` điểm đã trừ 0 nên điểm số đúng — chỉ phiếu in thiếu thông tin.
- **Đề xuất:** (a) Ghi đủ điểm trên mọi dòng cộng/trừ ("Giờ tốt: 100% tốt (+20đ)", "Điểm tốt (≥5): 12 (+12đ)"). (b) Hiện các giá trị đã miễn dưới dạng dòng ghi chú, không tính điểm — ví dụ "Đi muộn: 2 lượt (đã miễn vì tích 100% không vắng)" và giữ dòng "Vắng: 3 (3p, 0Kp)" khi có vắng có phép thật. Điểm số không đổi.
- **Kiểm thử:** Unit test `hocTapLines`/`neNepLines`: cộng các số trong dòng = `plus`/`minus` của `calcScore`; phiếu tích 100% + có vắng có phép → vẫn thấy dòng Vắng.
- **Cần quyết định:** chốt mẫu câu cho dòng "đã miễn" trước khi làm.

### P1-05. Siết validation: chặn số vô lý, điểm cộng/trừ đột xuất vô hạn, tên không khớp số lượt
- **Vấn đề:** Validation hiện chỉ có một quy tắc (tổng giờ = 0). Gõ 999 giờ Khá, 60 lượt đi muộn, điểm tốt 500, hay một dòng "cộng khác" +500đ không ghi chú đều nộp và duyệt được. Điểm không có trần/sàn (âm hoặc >300 vẫn xếp loại A). Tên HS ghi cho mục 0 lượt thì biến mất khỏi phiếu không báo gì; nhiều tên hơn số lượt cũng không ai hay.
- **Bằng chứng:** `src/lib.ts:272-278` chỉ có một kiểm tra; `:261-271` `calcScore` không chặn; `src/App.tsx:964-980` dòng cộng/trừ đột xuất không bắt buộc ghi chú, không giới hạn điểm; `:987-997` ô tên hiện cả khi số lượt = 0.
- **Đề xuất:** Mở rộng `validateDetails`: mọi số nguyên ≥ 0; giờ mỗi loại ≤ 60/tuần, tổng giờ ≤ 60; mỗi lỗi vi phạm ≤ sĩ số lớp (cần biết sĩ số — nếu chưa có thì chặn mềm ở mức 100 lượt); dòng cộng/trừ đột xuất: có điểm thì bắt buộc có ghi chú, mỗi dòng tối đa 20đ (chốt số với người dùng), tối đa 5 dòng mỗi loại (đã ghi trong comment `lib.ts:69-70` nhưng chưa kiểm tra); tên HS chỉ được nhập khi số lượt > 0, số tên không vượt số lượt; điểm cuối ngoài khoảng 0–150 thì chặn duyệt (cảnh báo hiện tại ở `App.tsx:829` chỉ để xem).
- **Kiểm thử:** Unit test `validateDetails` với từng trường hợp trên (âm, phân số, 999, cộng khác không ghi chú, tên thừa); Playwright: nhập giờ Khá 999 → nộp bị chặn + báo lỗi.
- **Cần quyết định:** trần điểm cộng/trừ đột xuất mỗi dòng và có cần nhập sĩ số lớp không.

### P1-06. Trường cũ (gộp) và trường tách nhỏ đang cộng dồn — phiếu cũ sao chép sang có thể bị trừ 2 lần
- **Vấn đề:** Điểm cộng cả trường gộp cũ (`late`, `studyViol`, `food`…) lẫn trường tách nhỏ (`lateLate`, `studyNoLearn`…). Phiếu cũ chép sang tuần sau rồi nhập thêm bằng trường mới sẽ bị trừ trùng cho cùng một lỗi (vd `late=2` + `lateLate=2` = −8đ cho 2 lần đi muộn). Ngoài ra trường `absentTotal` nhập tay cũ đã bị bỏ hẳn: phiếu cũ nào chỉ có tổng vắng tay (5 buổi) mà `absentPermit`/`absentNoPermit` = 0 thì nay tính thành 0 vắng — điểm cũ không tái tạo được. Và hai cờ fallback (`allGood`/`noAbsLate` = `undefined` thì tự +20/+10) chỉ còn tác dụng với phiếu cũ/import — phiếu tạo mới qua `emptyDetails` (đặt `false`) với cùng số liệu sẽ thấp hơn 20–30đ.
- **Bằng chứng:** `src/lib.ts:241,243,246,248-249,251-252,254-255` cộng cả hai nhóm; `:21` `absentTotal` không còn chỗ nào đọc; `:216-220` fallback chỉ chạy khi flag `undefined`; `:164-185` `emptyDetails` đặt `false`.
- **Đề xuất:** Khi tải/import/sao chép phiếu: nếu một cụm có cả trường gộp và trường tách nhỏ > 0 thì cảnh báo trong phiếu ("phiếu này có cả số liệu cũ và mới, đang tính cả hai") và ưu tiên trường tách nhỏ; chạy một lần rà soát dữ liệu live: liệt kê phiếu có `absentTotal` > 0 mà `absentPermit + absentNoPermit` = 0 để Ban thi đua đối chiếu; chuẩn hoá flag `undefined` → `false` khi dữ liệu đã có đủ (giữ nguyên điểm phiếu đã duyệt — chỉ chuẩn hoá phiếu nháp/chưa duyệt).
- **Kiểm thử:** Unit test: phiếu có `late=2` + `lateLate=2` → cảnh báo; phiếu `absentTotal=5`, phép/không phép = 0 → lọt vào danh sách rà soát; test import chuẩn hoá flag.
- **Cần quyết định:** phiếu cũ đã duyệt có giữ nguyên điểm fallback hay chuẩn hoá lại (điểm có thể đổi).

### P1-07. Chống trùng lặp: phân công trực, tên lớp, phiếu trùng
- **Vấn đề:** (a) Thêm cờ đỏ bằng tay không kiểm tra trùng — cùng một tên có thể trực 2 lớp/tuần, hoặc 2 tên trực cùng một lớp/tuần; phân công tra bằng `.find()` nên hàng đầu tiên thắng một cách tuỳ tiện. (b) Thêm lớp bằng tay không kiểm tra trùng tên — hai lớp "10B1" khác id sẽ tách điểm, hỏng tra cứu theo tên (lịch trực, `dutyMonitored`). (c) Import JSON có thể tạo 2 phiếu đã duyệt cho cùng một lớp/tuần — điểm trung bình tháng tính cả hai nhưng ô tuần chỉ hiện phiếu đầu (xem thêm P1-02).
- **Bằng chứng:** `src/App.tsx:1252` thêm roster không kiểm tra (khác `confirmDutyPick` `:466-469` và gán cả tuần `:1265-1272` vốn upsert theo tên+tuần); `:1214` thêm lớp chỉ kiểm tra khác rỗng (thêm hàng loạt `:1215` và đổi tên `:1226-1229` thì có kiểm tra); `src/docxExport.ts:115,170` dùng `.find()` lấy phiếu đầu.
- **Đề xuất:** Kiểm tra trùng ở mọi chỗ thêm/sửa (tên + tuần cho roster, tên lớp, cặp lớp+tuần cho phiếu) và báo lỗi rõ; import thì gộp trùng theo `updatedAt` mới nhất; viết một lần dọn dữ liệu live để xoá các bản trùng đã có (giữ bản mới nhất).
- **Kiểm thử:** Playwright: thêm roster trùng → bị chặn + báo lỗi; thêm lớp trùng tên → bị chặn; unit test import có 2 phiếu trùng → chỉ còn 1.

### P1-08. Hai cờ đỏ có thể cùng sửa một phiếu (phân công qua hồ sơ không được kiểm tra)
- **Vấn đề:** `DutyPicker` chỉ chặn khi lớp/tuần đã có cờ đỏ khác trong roster; cờ đỏ được gán qua hồ sơ (`assigned_class_id`/`assigned_week_id`) không qua bước đó, nên hai cờ đỏ gán cùng một lớp/tuần đều sửa được — ai lưu sau thắng, lặng lẽ.
- **Bằng chứng:** `src/App.tsx:737` DutyPicker chỉ kiểm tra roster; `:323-332` `canEdit` chỉ so phân công của mình khớp lớp+tuần; `:430-438` `saveScore` upsert theo (tuần, lớp) không kiểm tra khoá/xung đột.
- **Đề xuất:** `canEdit` + DutyPicker kiểm tra cả hai nguồn phân công (roster và hồ sơ) — nếu lớp/tuần đã có cờ đỏ khác thì chặn và nêu tên người đó; `saveScore` kiểm tra lại khoá ngay trước khi lưu (phiếu đã nộp/duyệt trong lúc đang sửa thì báo và không ghi đè).
- **Kiểm thử:** Playwright: 2 tài khoản cờ đỏ cùng lớp/tuần → tài khoản thứ hai mở phiếu thấy bị khoá + tên người đang giữ; lưu đồng thời → chỉ một bản được ghi, bản kia báo xung đột.

### P1-09. "Chép số liệu tuần trước" ghi đè bản nháp không hỏi, chép cả trường cũ, có thể chép nhầm tuần
- **Vấn đề:** Bấm chép là bản nháp đang sửa bị thay toàn bộ không qua xác nhận; chép cả trường gộp cũ (dẫn tới trừ trùng, xem P1-06), cả tên HS, ý kiến, dòng cộng/trừ đột xuất và cả hai ô tích 100%; khi chưa đủ 2 tuần thì bấm không có phản hồi gì; "tuần trước" lấy theo vị trí trong mảng chứ không theo số tuần — sau khi xoá một tuần ở giữa thì chép nhầm tuần.
- **Bằng chứng:** `src/App.tsx:507-515` `copyPrevWeek` không kiểm tra `canEdit` trong hàm (chỉ nút bị `disabled` ở UI `:1009`), không gọi `confirmDirty` (`:413-415`), chép `details` nguyên vẹn; `:508` < 2 tuần thì im lặng; `:509-510` lấy `weeks[idx-1]`.
- **Đề xuất:** Có bản nháp đang sửa dở thì hỏi xác nhận trước khi chép; chép theo số tuần (`weekNumberOf` lớn nhất nhỏ hơn tuần hiện tại); khi chép thì bỏ trường gộp cũ nếu đã có trường tách nhỏ tương ứng; không có tuần trước thì báo "Chưa có tuần trước để chép".
- **Kiểm thử:** Playwright: sửa dở rồi bấm chép → hiện xác nhận, bấm huỷ thì bản nháp còn nguyên; xoá tuần giữa rồi chép → chép đúng tuần liền trước theo số tuần.

### P1-10. Xoá tuần/lớp/tài khoản để lại rác liên kết (phân công trực, hồ sơ gán lớp/tuần)
- **Vấn đề:** Xoá tuần chỉ xoá tuần + phiếu của tuần đó, còn trơ lại roster của tuần đó và `assigned_week_id` trong hồ sơ trỏ tới tuần đã mất. Xoá lớp (đã chặn đúng khi còn phiếu) vẫn không xoá `assigned_class_id` trong hồ sơ — cờ đỏ/GVCN bị gán tới lớp không còn tồn tại. Xoá tài khoản chỉ xoá hồ sơ, roster theo tên vẫn ở lại và có thể "nhận" nhầm người khác trùng tên đăng ký sau.
- **Bằng chứng:** `src/App.tsx:1211` xoá tuần chỉ lọc `weeks` + `scores`; `:1218,1235-1240` xoá lớp chặn khi có phiếu và xoá roster của lớp nhưng không dọn `assigned_class_id`; `:387-398` xoá tài khoản chỉ gọi `deleteProfile`; roster/phiếu gắn bằng tên chuỗi (`:286-300`, `:433` `updatedBy: session?.name`).
- **Đề xuất:** Mọi thao tác xoá dọn kèm: xoá tuần → xoá roster của tuần đó + gỡ `assigned_week_id` trỏ tới nó; xoá lớp → gỡ `assigned_class_id` trỏ tới nó; xoá tài khoản → xoá roster theo tên (và ghi log). Về lâu dài: lưu thêm `profileId` cạnh `name` trong roster/score để hết trùng tên (cần migrate dữ liệu cũ theo tên).
- **Kiểm thử:** Playwright: tạo phân công tuần 5 → xoá tuần 5 → assert roster tuần 5 hết và hồ sơ không còn trỏ tới tuần 5; xoá tài khoản → roster của người đó hết.

### P1-11. Xác nhận cho thao tác nguy hiểm + chốt không còn admin
- **Vấn đề:** Duyệt, trả lại, mở lại phiếu/tuần, chốt tuần, đổi vai trò/khoá tài khoản (chọn trong dropdown là áp dụng ngay), bật/tắt trực, gán cả tuần, đổi tên lớp — đều một cú bấm không xác nhận. Một admin có thể hạ cấp/khoá luôn admin còn lại, không còn ai quản trị (không có kiểm tra "còn ít nhất một admin").
- **Bằng chứng:** `src/App.tsx:442-447,474-481,483-493,494-501,502-506` không có confirm; `:355-367` đổi vai trò qua `onChange` của select; chỉ duyệt tất cả (`:453`), xoá tài khoản (`:391`), xoá tuần (`:1211`), xoá lớp (`:1237`) có `window.confirm`.
- **Đề xuất:** Thêm xác nhận cho duyệt/trả lại/mở lại/chốt tuần/đổi vai trò/khoá tài khoản (ghi rõ hệ quả trong hộp thoại, vd "Chốt tuần sẽ khoá toàn bộ phiếu"); chặn hạ cấp/khoá admin cuối cùng (đếm số admin còn active trước khi cho phép); xoá tài khoản của chính mình hiện thông báo thay vì im lặng (`:390-391` return không báo gì).
- **Kiểm thử:** Playwright: bấm duyệt phiếu → hộp xác nhận hiện, bấm huỷ thì không đổi trạng thái; hạ cấp admin cuối → bị chặn + báo lỗi.
- **Cần quyết định:** chốt có mấy admin (1 hay 2) để viết đúng luật "admin cuối cùng".

### P1-12. Mở lại một phiếu thì mở luôn cả tuần — không có cách sửa một phiếu mà giữ tuần chốt
- **Vấn đề:** Muốn sửa một phiếu trong tuần đã chốt thì buộc phải mở lại cả tuần cho 14 lớp, không có cảnh báo nào lúc bấm (chỉ có dòng chữ nhỏ trong nhánh phiếu đã duyệt). Ngoài ra `reopenScore` không xoá `submittedBy`/`submittedAt` nên phiếu về nháp mà vẫn mang dấu "đã nộp lúc…" ở vài chỗ hiển thị.
- **Bằng chứng:** `src/App.tsx:483-493` — về nháp chỉ xoá `returnReason`/`approvedBy`/`approvedAt`, không xoá `submittedBy`/`submittedAt`; `:486,490-491` tuần đã chốt thì xoá luôn `submittedAt`/`submittedBy` của tuần; `:1111` chỉ nhắc trong nhánh đã duyệt.
- **Đề xuất:** Hộp xác nhận nêu rõ "Mở lại phiếu này sẽ mở lại cả Tuần N cho tất cả các lớp"; `reopenScore` xoá cả `submittedBy`/`submittedAt` của phiếu; về lâu dài, cân nhắc cho phép sửa phiếu bị trả lại mà không mở tuần (cần quyết định, vì hiện tại tuần chốt là khoá cứng sửa).
- **Kiểm thử:** Playwright (mở rộng Part E2): tuần đã chốt + huỷ duyệt → hộp xác nhận nêu rõ mở lại cả tuần; sau khi mở lại, phiếu không còn dấu đã nộp cũ.
- **Cần quyết định:** có cho sửa phiếu lẻ trong tuần đã chốt không.

### P1-13. Tài khoản chờ duyệt vẫn tải được toàn bộ dữ liệu; người xem chờ duyệt không chọn được lớp
- **Vấn đề:** Tài khoản pending/disabled tải toàn bộ dữ liệu chung về máy ngay khi đăng nhập (màn hình chờ duyệt chỉ là tấm rèm ở UI) và vòng làm mới 45 giây cũng tải tiếp; dữ liệu còn nằm lại trong localStorage. Ngược lại, người xem (GVCN) ở màn hình chờ duyệt không có ô chọn lớp chủ nhiệm như cờ đỏ, phải chờ admin gán tay.
- **Bằng chứng:** `src/App.tsx:197-214` lần tải đầu chạy với mọi `profile` (comment `:193-196` nói pending chỉ tải để xem danh sách lớp) rồi `setState(row.data)` ở `:203`; `:244-257` vòng 45 giây chỉ cần `profile` tồn tại; `:371-386` `savePendingClass` chỉ dùng cho cờ đỏ; `src/App.tsx:584-610` màn hình chờ.
- **Đề xuất:** Chỉ tải dữ liệu chung khi `status === 'active'`; tài khoản chờ duyệt chỉ nhận danh sách lớp tối thiểu (từ `DUTY_CLASSES` cố định hoặc một bảng lớp đọc công khai); vòng 45 giây cũng chỉ chạy khi active; RLS: `app_state` select yêu cầu hồ sơ active (điều kiện `EXISTS … status='active'`); cho người xem chọn "Lớp chủ nhiệm" ngay ở màn hình chờ duyệt như cờ đỏ.
- **Kiểm thử:** Playwright stub: đăng nhập tài khoản pending → assert không có request đọc `app_state` đầy đủ, chỉ có danh sách lớp; tài khoản pending GVCN chọn được lớp chủ nhiệm.
- **Cần Dashboard:** có (nhỏ) — sửa policy select của `app_state`.

### P1-14. Phiên đăng nhập mong manh: lỗi lúc mở app thì kẹt ở "đang tải", đổi vai trò giữa chừng không có hiệu lực
- **Vấn đề:** `getSession()` lỗi thì app kẹt mãi ở "Đang kiểm tra phiên đăng nhập…" (không có `.catch`, không có nút thử lại). Hồ sơ tải lỗi cũng chỉ hiện "Đang tải hồ sơ…" + nút đăng xuất, không thử lại. Vai trò/trạng thái chỉ đọc lúc đăng nhập — admin khoá/hạ cấp ai đó giữa chừng thì tab đang mở của người đó vẫn dùng hồ sơ cũ, vẫn lưu đồng bộ được cho tới khi tải lại trang. Không có error boundary: lỗi render là trắng trang.
- **Bằng chứng:** `src/App.tsx:149-153` `getSession().then(...)` không `.catch()`; `:171-185` `ensureProfile` lỗi chỉ set `profileErr`, màn hình chờ không có nút thử lại; `:154-162` không xử lý token refresh lỗi; profile chỉ đánh giá lúc đăng nhập, vòng 45 giây chỉ tải `app_state`; `src/main.tsx:5-17` không có error boundary.
- **Đề xuất:** Thêm `.catch()` + màn hình lỗi có nút "Thử lại" cho cả hai bước; tải lại hồ sơ định kỳ (vd mỗi 5 phút và khi tab được focus) — nếu bị khoá/hạ cấp thì hiện thông báo và chuyển về màn hình chờ; bọc App trong error boundary có nút tải lại trang; đăng xuất xoá cả bản nháp/tuần/lớp đang chọn (hiện `handleSignOut` `:344-352` không xoá `draft`/`dirty`/`weekId`/`classId`).
- **Kiểm thử:** Playwright stub: `getSession` lỗi → assert hiện nút Thử lại, bấm thì tải lại được; đổi role giữa chừng (stub đổi profile) → tab đang mở cập nhật quyền sau lần tải lại hồ sơ.

### P1-15. Hạ tầng kiểm thử + CI: chưa có lệnh chạy test chung, nhiều luồng chưa từng được test, suite Supabase đã mất
- **Vấn đề:** Không có `npm test`; mỗi suite chạy tay (`build` + `preview` + `node <file>`); 4 suite ghim cứng đường dẫn trình duyệt headless-shell; không có CI nên lint/build lỗi chỉ phát hiện lúc deploy. Các suite Supabase-stub (đăng ký, gán trực, link mời GVCN) đã mất theo đợt xoá /tmp và chưa khôi phục. Chưa có test nào cho: đăng nhập/đăng ký/duyệt tài khoản, nút chốt/mở tuần (chỉ test gián tiếp qua huỷ duyệt), các luồng xoá, 3/6 đường xuất file (tháng, phiếu lớp, CSV, JSON, Zalo), sao chép tuần trước, trả lại thiếu lý do, lỗi đồng bộ/xuất file, chế độ Supabase (đồng bộ, debounce, xung đột, làm mới 45 giây — toàn bộ đường chạy production).
- **Bằng chứng:** `tong-thi-dua-tests/package.json` script test là `echo "Error: no test specified"`; README liệt kê thiếu `test-stepper.mjs` và `test-week-norank.mjs` (đã có trong thư mục); README thừa nhận suite Supabase "chưa được khôi phục"; `tong-thi-dua/package.json` không có `test`, không có `.github` (không CI), `vercel.json` build chỉ chạy `npm run build` nên lint không chặn được deploy.
- **Đề xuất:** Thêm `npm test` ở thư mục test (chạy build + preview + toàn bộ suite rồi tắt preview; tạo lại `lib.mjs` tự động thay vì build tay); khôi phục các suite Supabase-stub từ quy tắc đã ghi trong README (stub REST/auth, header CORS, `.single()` trả object trần, token JWT giả); bổ sung test cho các luồng kể trên theo từng mục P0/P1; thêm GitHub Actions: `npm run build` + `oxlint` + `npm test` trên mỗi push (hoặc tối thiểu một check build trước khi Vercel deploy).
- **Kiểm thử (của chính mục này):** chạy `npm test` từ checkout mới → toàn bộ suite pass; cố tình làm hỏng một test → CI báo đỏ.

### P1-16. Mobile 390px: bảng phải cuộn ngang, thanh điểm đè nội dung, ô tích 22px
- **Vấn đề:** (a) Mọi bảng (tổng hợp tuần/tháng, lịch trực 17 cột) có `min-width:560px` trong khung 366px nên phải cuộn ngang; bảng tổng hợp càng thêm tuần càng rộng. (b) Thanh điểm cố định dưới màn hình: chừa 72px ở ≤480px nhưng thanh có thể cao hơn khi nút/điểm xuống dòng → đè lên các trường cuối và nút lưu. (c) Hai ô tích 100% (quyết định 20đ/10đ) chỉ 22×22px, không có CSS nào quy định kích thước vùng bấm; nút lọc khối 34px, nút đăng xuất 30px — đều dưới chuẩn 44px. (d) Header dính 2 tầng (banner + header) + 6 tab cuộn ngang không có dấu hiệu còn tab ẩn.
- **Bằng chứng:** `src/index.css:68-70` `.tablewrap table{min-width:560px}`; `:98` scorebar fixed ≤760px vs `:165` `.wrap{padding-bottom:72px}`; `src/App.tsx:1013,1040` checkbox inline `22×22`; `src/index.css:75` `.seg{min-height:34px}`, `:148` logout 30px; `:17-18` hai sticky header; `:145-150` tabs/userbox cuộn ngang giấu scrollbar; không có breakpoint nào cho 390px (chỉ 760/480).
- **Đề xuất:** Thanh điểm: đo chiều cao thật hoặc dùng `padding-bottom` lớn hơn + kiểm tra nút Lưu không bị che ở 390px; bảng tổng hợp/lịch trực: bản mobile dạng thẻ (mỗi lớp một thẻ) hoặc cố định cột đầu; ô tích/stepper/nút chính đạt 44px vùng bấm (giữ kích thước hiển thị, mở rộng vùng bấm bằng padding); thêm breakpoint 390px; dấu hiệu "còn tab" ở mép phải.
- **Kiểm thử:** Playwright 390px: assert nút "Lưu & nộp" nhìn thấy được và bấm được khi cuộn cuối phiếu; assert không tràn ngang ở Nhập điểm/Tổng hợp/Lịch sử (hiện chỉ Quản lý, Tổng quan, Xếp hạng có test tràn ngang); chụp ảnh các tab đã sửa để nhìn bằng mắt.

### P1-17. Nhật ký phình vô hạn trong blob đồng bộ; đọc/ghi localStorage không có kiểm tra đầy đủ
- **Vấn đề:** Nhật ký thêm mãi không giới hạn, nằm trong cùng blob đồng bộ nên dung lượng đồng bộ và localStorage tăng theo thời gian; `localStorage.setItem` mỗi lần đổi state không có try/catch — đầy quota là văng lỗi khỏi effect; `loadState` và import JSON chỉ kiểm tra `settings` + `weeks` là mảng, còn `scores`/`classes`/`roster`/`logs` dùng luôn — dữ liệu hỏng có thể làm sập giao diện.
- **Bằng chứng:** `src/App.tsx:402-407` thêm log không giới hạn; `:116` `setItem` không try/catch (khác `loadState` `:21` có catch); `:20-23` chỉ kiểm tra `settings` + `weeks`.
- **Đề xuất:** Giới hạn log (giữ 300 mục gần nhất, cắt bớt khi lưu); bọc `setItem` trong try/catch và báo lỗi khi đầy; `loadState`/`importJson` kiểm tra đủ hình dạng (mảng + trường bắt buộc) — sai thì dùng `emptyState()` + báo lỗi rõ thay vì render sập.
- **Kiểm thử:** Unit test `loadState` với localStorage hỏng (JSON sai, thiếu `scores`, `scores` không phải mảng) → không crash, về trạng thái rỗng + báo lỗi; test log vượt 300 mục thì bị cắt.

### P1-18. Kiểm tra "chưa lưu" bị qua mặt ở nhiều đường đi
- **Vấn đề:** Có đường chuyển lớp/tuần không qua xác nhận mất bản nháp: bấm vào một lớp ở Tổng quan (đổi lớp trước rồi mới hỏi), xác nhận phân công trực, và tuần đang chọn bị xoá (đồng bộ từ máy khác) thì app lặng lẽ nhảy sang tuần cuối rồi reset bản nháp không báo gì.
- **Bằng chứng:** `src/App.tsx:673` `onEnterScores` đổi `weekId`/`classId` trước khi gọi `switchTab` (huỷ xác nhận vẫn mất bản nháp); `:461-472` `confirmDutyPick` đổi tuần/lớp không gọi `confirmDirty`; `:271` tuần bị xoá thì `week = find(weekId) ?? weeks[last]`; `:313-318` effect reset bản nháp khi đổi tuần/lớp, không kiểm tra dirty.
- **Đề xuất:** Mọi đường đổi tuần/lớp/tab đều đi qua `confirmDirty` trước khi đổi state; khi tuần đang chọn biến mất thì báo "Tuần … đã bị xoá ở máy khác" và hỏi trước khi nhảy tuần (giữ bản nháp lại nếu người dùng muốn).
- **Kiểm thử:** Playwright: sửa dở → bấm lớp khác ở Tổng quan → huỷ xác nhận → assert vẫn ở lớp cũ và bản nháp còn nguyên; stub đồng bộ xoá tuần đang sửa → assert có thông báo.

### P1-19. Lớp đăng ký không gán được thì im lặng
- **Vấn đề:** Khi đăng ký, app tra tên lớp trong dữ liệu chung để gán sẵn; tra lỗi (mạng lỗi, lớp chưa tồn tại, trùng tên sau khi đổi tên) thì lặng lẽ để trống, không thử lại, không báo — tới lúc duyệt tài khoản mới thấy không có lớp.
- **Bằng chứng:** `src/supabase.ts:67-72` `catch {}` nuốt lỗi, `assignedClassId` ở lại `null`; `src/App.tsx:299-310` màn hình chờ tự suy lại lớp từ metadata nhưng chỉ chạy khi `state.classes` đã tải xong nên có thể trượt ở lần tải đầu chậm.
- **Đề xuất:** Báo rõ ở màn hình chờ ("Không tìm thấy lớp … — chọn lại") + nút thử lại; màn hình chờ tra lại lớp mỗi khi dữ liệu chung tải xong.
- **Kiểm thử:** Playwright stub: đăng ký với lớp chưa tồn tại → màn hình chờ hiện cảnh báo + cho chọn lại; đăng ký khi tải dữ liệu lỗi → vẫn gán được lớp sau khi tải lại thành công.

### P1-20. Không có "từ chối" thật — tài khoản bị xoá lại hiện về danh sách chờ
- **Vấn đề:** Quản lý chỉ có Duyệt / Khoá / Mở lại / Xoá. Xoá chỉ gỡ dòng hồ sơ, tài khoản đăng nhập vẫn còn nên người đó đăng nhập lại là hồ sơ pending được tạo lại — "từ chối" bằng cách xoá thực chất không từ chối được.
- **Bằng chứng:** `src/App.tsx:1179-1192` không có nút Từ chối; `:388-402` `removeProfile` chỉ xoá `profiles`; `supabase/schema.sql:66-69` ghi rõ Auth còn lại; `schema.sql:20` trạng thái chỉ có `pending/active/disabled`.
- **Đề xuất:** Thêm trạng thái `rejected` (kèm lý do) — tài khoản rejected đăng nhập chỉ thấy màn hình "Tài khoản của bạn đã bị từ chối, liên hệ Ban thi đua" và không được tạo lại pending; hoặc quy trình tay: xoá thêm trong Dashboard → Authentication → Users (ghi vào hướng dẫn vận hành).
- **Kiểm thử:** Playwright: từ chối một tài khoản pending → đăng nhập lại bằng tài khoản đó → assert thấy màn hình bị từ chối, không tạo pending mới.
- **Cần quyết định:** chọn hướng trạng thái `rejected` hay xoá tay trong Dashboard (cần quyền Dashboard cho hướng 2).

### P1-21. Các bước Dashboard Supabase chưa ai xác minh được từ repo
- **Vấn đề:** Toàn bộ deploy dựa vào các bước làm tay trong Dashboard mà repo không kiểm tra được: đã chạy `schema.sql` chưa, Site URL, Redirect URLs có chứa origin Vercel không, bật/tắt "Confirm email", mẫu email. Hỏng một bước thì app vẫn "trông như chạy" rồi lỗi ở bước đăng ký/đăng nhập.
- **Bằng chứng:** `supabase/schema.sql:1-3` hướng dẫn chạy tay; `src/AuthScreen.tsx:65,95` dùng `window.location.origin` làm redirect; không có code nào đọc/kiểm tra cấu hình Dashboard; lỗi schema chỉ hiện chung chung ở `src/App.tsx:183,211`.
- **Đề xuất:** Lập checklist vận hành (file `docs/van-hanh.md` trong repo): Site URL = `https://tong-thi-dua.vercel.app`, Redirect URLs gồm origin đó, Confirm email bật, đã chạy `schema.sql` bản mới nhất (ghi số phiên bản schema vào file), khoá `service_role` không chia sẻ. Mỗi lần đổi schema thì tăng số phiên bản và ghi ngày chạy.
- **Kiểm thử:** Kiểm tra tay theo checklist sau mỗi lần deploy; bổ sung màn hình chẩn đoán nhỏ trong app (hiện trạng thái cấu hình Supabase: đã kết nối/không, số hồ sơ đọc được).
- **Cần Dashboard:** có — người có quyền Dashboard đối chiếu và xác nhận.

### P1-22. Vệ sinh schema: thiếu ràng buộc, thiếu chỉ mục, so sánh "mới hơn" bằng chuỗi
- **Vấn đề:** `profiles.email` không unique, `assigned_class_id/week_id` không có khoá ngoại (cũng không thể có vì lớp/tuần nằm trong JSON), `app_state.data` là jsonb không giới hạn hình dạng, không có `updated_at` ở `profiles`, không có bảng kiểm toán. Việc quyết định "bản nào mới hơn" dựa vào so sánh chuỗi timestamp (đúng với định dạng Postgres hiện tại nhưng không có gì bảo đảm).
- **Bằng chứng:** `supabase/schema.sql:15-32` chỉ có enum role/status; `:87-99` trigger chỉ set `updated_at` khi UPDATE.
- **Đề xuất:** Thêm unique index cho `profiles.email`; thêm cột `version integer` cho `app_state` (tăng mỗi lần ghi, dùng để so sánh thay cho chuỗi thời gian — đi kèm P0-05); thêm `updated_at` cho `profiles`; cân nhắc bảng `audit_log` (ai, làm gì, lúc nào) tách khỏi blob (đi kèm P1-01).
- **Kiểm thử:** SQL: insert 2 profile trùng email → lỗi; ghi `app_state` 2 lần → `version` tăng 1 mỗi lần.
- **Cần Dashboard:** có (nhỏ) — chạy SQL.

---

## P2 — Nên làm khi rảnh

### P2-01. Tên file xuất trùng nhau mỗi lần tải
- **Vấn đề:** Tên file chỉ từ tên tuần/lớp/tháng (`TONG_HOP_THI_DUA_Tuần_04.docx`, `XEP_HANG_Tuần_04.csv`) nên tải lại là ghi đè file cũ trong Downloads; file .docx phiếu lớp nhúng tên lớp thô chưa chuẩn hoá.
- **Bằng chứng:** `src/App.tsx:518,523,527,532,540`.
- **Đề xuất:** Thêm ngày giờ vào tên file (`…_Tuần_04_20261124-2105.docx`); chuẩn hoá tên lớp trong tên file.
- **Kiểm thử:** Playwright: tải 2 lần → 2 tên file khác nhau.

### P2-02. Đánh bóng file .docx: độ rộng cột, lặp lại hàng tiêu đề, câu nhận xét mặc định sai khi tuần trống
- **Vấn đề:** Mọi ô đều `AUTO` nên Word tự chia cột (cột HỌC TẬP/NỀ NẾP rộng lấn cột điểm); bảng nhiều trang không lặp hàng tiêu đề; tuần chưa có phiếu nào vẫn in câu "Vẫn còn một số học sinh vi phạm…" (sai sự thật); file phiếu lớp đánh số mục `(1)`, `(2)`, `3.` không đều.
- **Bằng chứng:** `src/docxExport.ts:18,28` width AUTO, không có `tableHeader: true`; `:92` câu cons mặc định; `:196-198` đánh số không đều.
- **Đề xuất:** Đặt độ rộng cột theo tỷ lệ (LỚP hẹp, HỌC TẬP/NỀ NẾP rộng, điểm vừa); `tableHeader: true` cho hàng đầu; tuần không có phiếu thì in "Chưa có phiếu nào được nộp trong tuần này" thay cho câu mặc định; sửa đánh số mục phiếu lớp thành `1.`, `2.`, `3.`.
- **Kiểm thử:** Mở rộng `test-week-norank.mjs`: assert XML có `tblHeader` và tuần trống không chứa câu mặc định.

### P2-03. Hiển thị tên/số lượt chưa khớp: tên nhiều hơn số lượt, hậu tố vắng `(-0)`
- **Vấn đề:** `violLine` ẩn hẳn số lượt khi đã có tên (2 tên, 1 lượt → in `(-2)` mà không ai biết chỉ tính 1 lượt); lớp chỉ vắng có phép nhưng còn sót tên ở mục vắng không phép thì in `Vắng: 3 (3p, 0Kp) — Minh (-0)`.
- **Bằng chứng:** `src/lib.ts:204-210` chỉ hiện số lượt khi `count > nNames`; `:212-215` hậu tố vắng chỉ kiểm tra có tên, không kiểm tra `absentNoPermit > 0`.
- **Đề xuất:** Luôn hiện số lượt khi tên và số lượt không khớp; hậu tố vắng chỉ in khi `absentNoPermit > 0` (kèm P1-05 kiểm tra tên↔số lượt lúc nhập).
- **Kiểm thử:** Unit test các trường hợp tên/số lượt lệch nhau.

### P2-04. Dọn CSS mobile: quy tắc chết, chữ nhỏ, nút xuất file, thanh cuộn ẩn
- **Vấn đề:** Hai khối `@media(max-width:480px)` cho `.field` mâu thuẫn nhau (khối sau thắng, khối trước thành code chết — tên vi phạm và stepper dồn một hàng); chữ 11–12px ở nhiều chỗ; nút xuất file 2 cột không co lại ở 390px nên nhãn xuống 2–3 dòng không đều; tab/chip cuộn ngang giấu scrollbar nên người dùng không biết còn tab ẩn; `minWidth:150-160` inline ở Quản lý có thể tràn thẻ 366px; bảng log render cả hai bản (bảng + danh sách) rồi giấu một bản bằng CSS.
- **Bằng chứng:** `src/index.css:62` so với `:157-162`; `:144,53,61,72,87,147` chữ 11–12px; `:95-96` exportgrid không có media query; `:145-150` giấu scrollbar; `src/App.tsx:1000-1001,1179-1185` minWidth inline; `src/App.tsx:714-715` render cả hai bản log.
- **Đề xuất:** Xoá khối `.field` chết, giữ một quy tắc duy nhất; tăng chữ phụ lên 13px; export grid 1 cột ở ≤480px; thêm dấu hiệu "còn nữa" ở mép phải tab; bỏ minWidth inline, dùng grid co được; chỉ render một bản log theo chiều rộng.
- **Kiểm thử:** Playwright 390px chụp ảnh các màn đã sửa để nhìn bằng mắt + test tràn ngang.

### P2-05. Thay hộp thoại `window.confirm` bằng hộp thoại trong app cho thao tác phá huỷ
- **Vấn đề:** Mọi xác nhận đều là hộp thoại gốc của trình duyệt — không có ngữ cảnh app, không hiện chi tiết (vd xoá tuần sẽ xoá bao nhiêu phiếu), hiển thị khác nhau giữa các trình duyệt điện thoại.
- **Bằng chứng:** `src/index.css` không có CSS modal/dialog nào; `src/App.tsx:391,415,453,650,1211,1237` dùng `window.confirm`.
- **Đề xuất:** Một component Confirm dùng chung (tiêu đề, nội dung, danh sách hệ quả, nút Huỷ/Xác nhận màu đỏ cho thao tác phá huỷ); dùng cho xoá tuần/lớp/tài khoản, chốt/mở tuần, duyệt tất cả trước (các thao tác P1-11).
- **Kiểm thử:** Playwright: bấm xoá tuần → assert hộp thoại trong app hiện đúng số phiếu sẽ mất (thay vì dialog trình duyệt).

### P2-06. Nút chọn lớp và chip header trên điện thoại
- **Vấn đề:** 14 nút lớp xếp một hàng dài, mỗi lần bấm là một lần chuyển lớp có thể kích hoạt xác nhận mất bản nháp; hàng chip header (tuần, lớp trực, vai trò, tên, cài app, đăng xuất) + 6 tab chiếm nhiều chiều cao trên điện thoại.
- **Bằng chứng:** `src/App.tsx:1003` render 14 nút lớp trong một `.row`; `:659-667` header + tabs.
- **Đề xuất:** Ở ≤480px, chọn lớp bằng dropdown gọn (giữ nút bấm ở màn hình lớn); gộp chip header thành một dòng tóm tắt, nút đăng xuất/cài app vào menu.
- **Kiểm thử:** Playwright 390px: chọn lớp bằng dropdown hoạt động; header sau khi gọn không chiếm quá ~120px chiều cao.

### P2-07. Khoá phiên bản phụ thuộc + dự phòng cho bước build
- **Vấn đề:** Phụ thuộc dùng `^` (React, Vite, supabase-js, docx…) nên `npm update` có thể kéo minor mới làm đổi hành vi mà không có test nào chặn; `engines` ghi Node 22.x nhưng không có `.nvmrc`; `prebuild` chạy 2 script (tạo icon, tạo version) — một script lỗi là deploy lỗi theo, không có dự phòng.
- **Bằng chứng:** `tong-thi-dua/package.json:5-30`.
- **Đề xuất:** Ghim chính xác phiên bản trong `package.json` (bỏ `^`, giữ `package-lock.json` làm chuẩn); thêm `.nvmrc` = 22; `prebuild` bỏ qua lỗi tạo icon khi file đã có (hoặc tách icon ra khỏi đường build bắt buộc).
- **Kiểm thử:** `npm ci` từ checkout mới → build pass; xoá `node_modules` + đổi Node 20 → báo lỗi phiên bản rõ ràng thay vì lỗi lạ.

### P2-08. Tài liệu vận hành + README kiểm thử đang lỗi thời
- **Vấn đề:** README của thư mục test liệt kê thiếu 2 suite đã có (`test-stepper.mjs`, `test-week-norank.mjs`) nên người làm theo sẽ chạy thiếu; chưa có tài liệu vận hành (sao lưu/khôi phục, xử lý khi mất đồng bộ, checklist Dashboard, quy trình duyệt tài khoản, ai là admin dự phòng).
- **Bằng chứng:** `tong-thi-dua-tests/README.md:10-14,16-22`.
- **Đề xuất:** Cập nhật README (đủ danh sách suite + một lệnh `npm test` duy nhất — đi kèm P1-15); thêm `docs/van-hanh.md` (sao lưu, khôi phục từ lịch sử, xử lý xung đột, checklist Dashboard P1-21, liên hệ admin dự phòng).
- **Kiểm thử:** Người mới làm theo README chạy được toàn bộ suite từ checkout mới.

### P2-09. Phản hồi nhỏ: xoá tài khoản của chính mình im lặng, số lượt gõ "e"/rỗng thành 0 không báo
- **Vấn đề:** Bấm xoá chính mình thì không có gì xảy ra và không có thông báo nào. Gõ "e" hoặc để trống ô stepper thì `Number(...) || 0` lặng lẽ lưu thành 0, không phân biệt được 0 cố ý với nhập lỗi.
- **Bằng chứng:** `src/App.tsx:390-391` return im lặng; `:57` `Number(e.target.value) || 0`.
- **Đề xuất:** Xoá chính mình → hiện "Không xoá được tài khoản của chính mình."; ô stepper rỗng/không hợp lệ → để trống và báo "nhập số" thay vì tự thành 0 (chỉ lưu 0 khi người dùng gõ số 0).
- **Kiểm thử:** Playwright: hai trường hợp trên đều hiện phản hồi rõ ràng.

---

## Cần người dùng quyết định (tổng hợp)

| # | Quyết định | Liên quan | Gợi ý |
|---|-----------|-----------|-------|
| D1 | Có mấy admin? Ai là admin dự phòng nếu admin chính bị khoá/mất tài khoản? | P0-01, P1-11 | Nên có 2 admin (Ban thi đua + thầy) để không bị khoá cứng |
| D2 | File .docx xếp hạng chính thức có chỉ gồm phiếu đã duyệt? | P0-06 | Có (file "không xếp hạng" đã phục vụ rà soát trước duyệt) |
| D3 | Điểm trung bình tháng: tuần chưa nộp tính 0đ hay loại khỏi trung bình / không xếp hạng? | P1-02 | Tính 0đ cho tuần thiếu (công bằng nhất) hoặc xếp riêng nhóm "chưa đủ dữ liệu" |
| D4 | Phiếu cũ (trước khi có ô tích) có giữ điểm +20/+10 tự động hay chuẩn hoá lại? | P1-06 | Giữ nguyên điểm phiếu đã duyệt; chỉ chuẩn hoá phiếu nháp/chưa duyệt |
| D5 | Trần điểm cộng/trừ đột xuất mỗi dòng (vd 20đ) và có bắt buộc ghi chú? | P1-05 | Tối đa 20đ/dòng, bắt buộc ghi chú khi có điểm |
| D6 | Từ chối tài khoản thì làm thế nào? | P1-20 | Thêm trạng thái `rejected` trong app (khuyến nghị) hoặc xoá tay trong Dashboard |
| D7 | Có cho sửa một phiếu lẻ trong tuần đã chốt mà không mở cả tuần? | P1-12 | Trước mắt chỉ cần hộp xác nhận nêu rõ "sẽ mở lại cả tuần" |
| D8 | Người xem (GVCN) có được xuất .docx phiếu của lớp khác? | — | Hiện tại được (xem được thì xuất được); nếu muốn hạn chế thì chỉ cho xuất lớp của mình |
| D9 | Phiếu in có hiện các giá trị đã được miễn vì tích 100%? | P1-04 | Có, dưới dạng dòng ghi chú "(đã miễn…)" — điểm không đổi |
| D10 | Xác nhận cấu hình Dashboard: Site URL, Redirect URLs, Confirm email, đã chạy `schema.sql` mới nhất | P0-01, P0-02, P0-09, P1-21 | Cần người có quyền Dashboard đối chiếu theo checklist `docs/van-hanh.md` |
| D11 | Tách dữ liệu phiếu khỏi blob dùng chung (refactor lớn) hay giữ blob + lịch sử/sao lưu? | P1-01 | Trước mắt giữ blob + lịch sử (P0-02); tách bảng khi có thời gian |

## Đã kiểm tra và không phải lỗi (để khỏi lo)

- Tự đăng ký làm admin qua `requested_role` không được (`src/supabase.ts:56-58` chỉ nhận `codo`/`viewer`, còn lại về `viewer`).
- Tạo hồ sơ chỉ được tạo dòng của chính mình (`schema.sql:54-56`).
- Không có `service_role` key trong repo/bundle; anon key nằm trong bundle là đúng thiết kế — toàn bộ biên an toàn nằm ở RLS (đó chính là lý do P0-01 quan trọng).
- Đang gõ bản nháp không bị vòng làm mới 45 giây xoá (bản nháp nằm riêng khỏi `state`).
- Chốt tuần chặn đúng khi còn lớp chưa có phiếu duyệt; DutyPicker chặn đúng khi lớp đã có cờ đỏ khác trực hoặc phiếu đã nộp/duyệt; trả lại phiếu bắt buộc có lý do.
- CSV dùng `toCsv` đúng chuẩn (quote, nhân đôi `"`, BOM, CRLF); chỉ nội dung đưa vào mới có vấn đề (P0-06, P1-03).
