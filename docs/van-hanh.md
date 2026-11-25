# Hướng dẫn vận hành — App Tổng Thi Đua

> Dành cho Ban thi đua (người quản trị, không cần biết code). App chạy tại
> https://tong-thi-dua.vercel.app — dữ liệu dùng chung lưu trên Supabase.
>
> **Lưu ý trạng thái (25/11/2026):** gói nâng cấp "pro-1" đã deploy
> ngày 24/11/2026 (code đã lên live); `migration-pro.sql` đã chạy
> xong ngày 25/11/2026 (chia 4 phần vì copy cả file trên điện thoại
> bị đơ) nên sao lưu/khôi phục, từ chối tài khoản đã dùng được. Đợt
> "pro-2" ngày 25/11/2026 (cờ đỏ 2 tab, xếp hạng tháng, hộp thoại xác nhận trong
> app, gọn header trên điện thoại, làm rõ "lớp của cờ đỏ" khác "lớp
> trực" — xem mục 9 và 11) đã deploy đủ qua 2 lần đẩy trong ngày
> 25/11. Cùng ngày 25/11, tab **Quản lý chia thành 5 mục** (Tuần & lớp /
> Tài khoản cờ đỏ / Tài khoản GVCN / Tài khoản BTĐ / Cài đặt) và
> **admin dự phòng đã chốt** (tài khoản dự phòng của thầy đã nâng lên
> Ban thi đua trong app — xem mục 6). Code tách dữ liệu phiếu sang bảng
> riêng (`migration-split.sql` "split-1") đã lên live ngày 25/11/2026;
> app vẫn chạy bằng `app_state` cho đến khi thầy chạy SQL này trong
> Supabase (xem mục 2). Mục không đánh dấu là đã có sẵn trong app.

## 1. Checklist Supabase Dashboard (kiểm tra sau mỗi lần deploy)

Làm trong [Supabase Dashboard](https://supabase.com/dashboard) → đúng project
`tong-thi-dua`, mục **Authentication → URL Configuration**:

- [x] **Site URL** = `https://tong-thi-dua.vercel.app` (đã xác nhận 25/11/2026)
- [x] **Redirect URLs** có chứa `https://tong-thi-dua.vercel.app`
      (cần cho email "Quên mật khẩu" quay lại đúng app) — đã xác nhận 25/11/2026
- [x] **Confirm email: BẬT** (Authentication → Providers → Email) — đã xác nhận 25/11/2026
- [x] **Schema đã chạy:** `migration-pro.sql` "pro-1" đã chạy ngày 25/11/2026 — xem bảng phiên bản ở mục 2
- [ ] **Schema bảng riêng:** chạy `migration-split.sql` "split-1" trong SQL Editor lúc không ai đang nhập điểm, xong tải lại app — xem mục 2
- [ ] **Khóa `service_role`: KHÔNG BAO GIỜ chia sẻ, không nhập vào app,
      không gửi qua chat/Zalo.** App chỉ dùng `VITE_SUPABASE_ANON_KEY`
      (khóa này nằm trong code là đúng thiết kế; an toàn nhờ RLS).

## 2. Phiên bản schema (ghi lại mỗi lần chạy SQL)

**Trước khi chạy `migration-pro.sql` (bước 0 — bắt buộc):**

- [x] Mở app, đăng nhập bằng **tài khoản của thầy** (tài khoản admin
      chính đã xác nhận), kiểm tra trong tab **Quản lý → Tài khoản BTĐ**
      tài khoản này hiện vai trò **Ban thi đua** và trạng thái **Đang dùng**
      (đã xác nhận 25/11/2026).
- [ ] Nếu tài khoản này **chưa phải admin**: nhờ một admin khác nâng vai
      trò cho bạn trong app, **hoặc** mở file
      `supabase/migration-pro.sql`, bỏ dấu `--` ở dòng `UPDATE profiles
      SET role = 'admin' ...` trong mục 0, điền email của thầy vào chỗ
      `<email-cua-ban>`, rồi chạy riêng dòng đó trong SQL Editor **trước**
      khi chạy phần còn lại. (Điền email lúc chạy, không sửa file trong repo.)
- [ ] Nếu tài khoản của bạn là hồ sơ **đầu tiên** từng được tạo thì nó
      đã là admin rồi (quy tắc khởi tạo) — chỉ cần kiểm tra lại cho chắc.
- [x] Kiểm tra không có email trùng trong `profiles` (truy vấn ghi trong
      mục 3 của file migration) rồi mới chạy — trùng email sẽ làm
      migration dừng giữa chừng (đã kiểm tra 25/11/2026: 0 email trùng).

| Phiên bản | Nội dung | Chạy ở | Ngày chạy | Người chạy |
|---|---|---|---|---|
| `schema.sql` (gốc) | Bảng `profiles`, `app_state`, RLS cơ bản | SQL Editor | _(ghi ngày đã chạy)_ | |
| `migration-pro.sql` "pro-1" ✅ | Siết RLS (chống tự lên admin), bảng `app_state_history`, trạng thái tài khoản `rejected`, cột `version` cho `app_state` | SQL Editor | 25/11/2026 | Thầy (tài khoản admin) |
| `migration-split.sql` "split-1" ⏳ | Tách tuần/lớp/phân công/phiếu/nhật ký/cài đặt thành bảng riêng, RLS theo vai trò (cờ đỏ chỉ ghi phiếu lớp mình trực); `app_state` giữ làm bản sao lưu | SQL Editor | _(chưa chạy)_ | |

Quy tắc: **mỗi lần đổi schema thì tăng số phiên bản và ghi ngày vào bảng
trên.** Không chạy SQL nào ngoài file đã chốt trong repo.

## 3. Sao lưu & khôi phục

**Trước mọi đợt nhập/xoá lớn** (nhập JSON, xoá tuần/lớp, gán lại cả tuần):

- [ ] Vào tab **Quản lý → Cài đặt** → **Xuất JSON** (nút "Tải JSON sao lưu") và lưu
      file vào máy. Đặt tên có ngày giờ, ví dụ
      `tong-thi-dua-sao-luu_2026-11-24-2100.json`.
- [ ] Chỉ sau đó mới làm thao tác lớn.

**Khôi phục về một bản cũ:**

- [ ] Tab **Quản lý → Cài đặt** → mục **Sao lưu tự động (Supabase)** → **Khôi phục phiên bản…**
      (liệt kê tối đa 30 bản gần nhất trong `app_state_history`, kèm ngày giờ
      và người đã lưu) → chọn bản cần → xác nhận. (Chỉ có sau khi chạy
      `migration-pro.sql` — chưa chạy thì mục này hiện hướng dẫn chạy SQL.)
- [ ] Mỗi lần khôi phục đều được ghi vào Nhật ký (tab **Lịch sử**).
- [ ] Quy trình tay (khi chưa có mục Khôi phục): vào **Quản lý → Cài đặt** → **Nhập JSON**,
      chọn file sao lưu đã tải trước đó → xác nhận (dữ liệu hiện tại bị thay toàn bộ).

## 4. Lỗi đồng bộ & xung đột

**Banner "Lỗi đồng bộ":**

- [ ] Đừng nhập tiếp. Kiểm tra mạng, tải lại trang (F5).
- [ ] Nếu vẫn lỗi: vào tab **Lịch sử** xem lần lưu cuối thành công lúc nào;
      dữ liệu trên máy mình vẫn còn trong trình duyệt — đừng xoá dữ liệu
      trình duyệt, đừng đăng xuất khi đang lỗi.
- [ ] Lỗi còn kéo dài thì tải một bản JSON sao lưu (mục 3) rồi báo người
      phụ trách kỹ thuật.

**Banner "Có máy khác vừa lưu mới hơn"** (hai người sửa cùng lúc):

- [ ] **Xem bản mới** — bỏ bản của mình, tải bản mới nhất trên máy chủ về
      rồi nhập lại phần mình vừa sửa.
- [ ] **Giữ bản của tôi** — ghi đè bản trên máy chủ bằng bản của mình.
      Chỉ bấm khi chắc chắn bản của mình mới và đúng; app sẽ hỏi xác nhận
      một lần nữa. Sau khi ghi đè, báo cho người kia kiểm tra lại phiếu
      của họ.

## 5. Tài khoản: đăng ký → duyệt / từ chối / khóa

Quy trình trong tab **Quản lý** (mục **Tài khoản cờ đỏ** / **Tài khoản GVCN** /
**Tài khoản BTĐ**, tùy vai trò của tài khoản cần xử lý):

1. Người mới tự đăng ký trong app (chọn vai trò **Cờ đỏ** hoặc **Chỉ xem**;
   tài khoản **đầu tiên** đăng ký sẽ tự thành **admin**).
2. Tài khoản mới ở trạng thái **Chờ duyệt** — chưa xem/sửa được dữ liệu.
   Cờ đỏ chờ duyệt tự chọn lớp của mình ngay ở màn hình chờ.
3. Admin bấm **Duyệt** → tài khoản được vào app. Lớp của cờ đỏ đã chọn
   lúc đăng ký được giữ cố định; lớp trực theo lịch trực, hoặc cờ đỏ
   tự chọn khi nhập điểm (xem mục 11).
4. Admin bấm **Từ chối** → nhập lý do → tài khoản đó đăng nhập lại chỉ
   thấy màn hình "Tài khoản của bạn đã bị từ chối, liên hệ Ban thi đua"
   và **không** được tạo lại thành chờ duyệt. (Cần chạy
   `migration-pro.sql` trước — trạng thái `rejected` chỉ có sau khi
   migration thêm nó vào ràng buộc CHECK.)
   - Quy trình tay (khi chưa chạy migration): xoá hồ sơ trong app, rồi xoá
     thêm tài khoản trong Dashboard → **Authentication → Users** — nếu
     không xoá ở đây, người đó đăng nhập lại sẽ hiện về danh sách chờ.
5. **Khóa / Mở lại:** tài khoản bị khóa thấy màn hình "Tài khoản đã bị khóa,
   liên hệ Ban thi đua". Mở lại để cho vào tiếp.

## 6. Admin dự phòng — ✅ ĐÃ CHỐT (quyết định D1)

- **Admin chính: tài khoản của thầy (người quản trị app).**
  Trước khi chạy migration "pro-1" phải kiểm tra tài khoản này đã là
  admin trong app (xem checklist bước 0 ở mục 2).
- **Admin dự phòng: tài khoản dự phòng của thầy, đã nâng lên Ban thi đua
  trong app (Quản lý → Tài khoản BTĐ) ngày 25/11/2026.** Có 2 admin
  (Ban thi đua + tài khoản dự phòng) để không bị khóa cứng nếu admin
  duy nhất mất tài khoản.
- Luật của app: **admin đang hoạt động cuối cùng không bao giờ bị hạ cấp,
  khóa hay xóa** — app chặn thao tác đó; muốn đổi admin thì phải có admin thứ hai đang hoạt động trước đã.

## 7. Cảnh báo chế độ local — "CHƯA CẤU HÌNH SUPABASE"

Nếu mở app thấy banner **"CHƯA CẤU HÌNH SUPABASE — dữ liệu chỉ lưu trên
máy này, không đồng bộ"**:

- [ ] **DỪNG NHẬP LIỆU.** Mọi phiếu nhập lúc này chỉ nằm trên máy đó, các
      máy khác không thấy, và sẽ mất khi đổi máy/xoá dữ liệu trình duyệt.
- [ ] Kiểm tra trên Vercel (người phụ trách kỹ thuật): Project
      `tong-thi-dua` → **Settings → Environment Variables** phải có đủ:
      `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (đúng project
      Supabase `tong-thi-dua`), rồi **Redeploy**.
- [ ] Sau khi deploy lại: mở app, banner biến mất, đăng nhập lại bằng tài
      khoản Supabase thì mới nhập tiếp.

## 8. Quy trình hằng ngày / hằng tuần (Ban thi đua)

**Hằng ngày:**

- [ ] Tab **Quản lý** (mục Tài khoản cờ đỏ / GVCN / BTĐ): duyệt/từ chối tài khoản mới đăng ký.
- [ ] Tab **Tổng quan → Cần xử lý ngay**: duyệt các phiếu đã nộp
      (nút **Duyệt tất cả N phiếu đã nộp** khi đã kiểm tra xong).
- [ ] Phiếu sai thì **Trả lại** và **bắt buộc ghi lý do** để cờ đỏ sửa rồi
      nộp lại. Chỉ duyệt phiếu đang ở trạng thái **Chờ duyệt** và đã nhập
      đủ số liệu (không duyệt phiếu nháp).

**Cuối tuần (chốt tuần):**

- [ ] Chỉ bấm **Nộp & chốt tuần này** khi **mọi lớp đã có phiếu đã duyệt**
      (app chặn chốt khi còn lớp chưa duyệt — kiểm tra lại danh sách lớp
      thiếu trong thẻ "Cần xử lý ngay").
- [ ] Mở lại một phiếu đã duyệt sẽ **mở lại cả tuần** cho tất cả các lớp —
      cân nhắc trước khi bấm **Hủy duyệt (lỡ duyệt nhầm)**.
- [ ] Xuất file: **.docx xếp hạng** (chỉ gồm phiếu **đã duyệt** — quyết
      định D2; file "không xếp hạng" dùng để rà soát trước khi duyệt),
      **.docx tổng hợp tháng**, **CSV xếp hạng**. Lưu file vào thư mục
      hồ sơ thi đua của tuần/tháng đó.
- [ ] Sao lưu JSON một bản (mục 3) rồi mới sang tuần mới.

## 9. Cờ đỏ: chỉ 2 tab + xếp hạng theo tháng (pro-2, 25/11/2026)

**Cờ đỏ chỉ thấy 2 tab: Nhập điểm và Xếp hạng.** Các tab Tổng quan, Tổng
hợp, Lịch sử (và Quản lý) không hiện với cờ đỏ — cờ đỏ vào app là thấy
ngay phiếu của lớp mình đang trực để nhập. Thông báo phiếu bị trả lại vẫn
hiện ngay ở đầu tab Nhập điểm ("Phiếu bị trả lại — lý do: … Sửa lại rồi
nộp lại nhé."), và chip ở header vẫn ghi "Trực lớp X".

**Tab Xếp hạng có thêm chuyển đổi Theo tuần | Theo tháng:**

- **Theo tuần:** như cũ (xếp hạng tuần, lọc khối, nút xuất file, chốt/mở
  tuần của Ban thi đua).
- **Theo tháng:** xếp các lớp theo điểm trung bình tháng (cứ 4 tuần là 1
  tháng: tuần 1–4 là Tháng 9, tuần 5–8 là Tháng 10…), chọn tháng ở ô
  "Tháng" (mặc định tháng mới nhất có tuần). Mỗi lớp một dòng: hạng, điểm
  trung bình, loại, "nộp n/m tuần". Lớp chưa có phiếu duyệt trong tháng
  thì không có số hạng (hiện "—"). Chỉ tính phiếu **đã duyệt**, giống mọi
  xếp hạng khác. Lọc khối (Tất cả / Tự nhiên / Xã hội) áp cho cả hai chế độ.

**Hộp thoại xác nhận trong app:** các thao tác phá hủy (xóa tuần/lớp/tài
khoản, chốt/mở tuần, duyệt tất cả, khôi phục sao lưu, ghi đè khi xung đột…)
nay hỏi bằng hộp thoại trong app, ghi rõ hệ quả (vd xóa tuần hiện đúng số
phiếu sẽ mất) — bấm **Hủy** thì không đổi, **Xác nhận** (nút đỏ) mới làm.

**Trên điện thoại (màn hẹp):** chọn lớp bằng ô dropdown gọn (màn hình lớn
vẫn là hàng nút bấm); header gọn thành một dòng tóm tắt (tuần • trực lớp •
vai trò • tên), nút Đăng xuất / Cài app nằm trong menu **⋮** ở góc phải.
Cuối trang có dòng "Bản quyền thuộc về Đoàn Trường THPT Hùng Vương -
Quảng Phú".

## 10. Các quyết định đã chốt (để khỏi hỏi lại)

| # | Quyết định |
|---|---|
| D2 | File .docx xếp hạng chính thức chỉ gồm phiếu đã duyệt. |
| D6 | Từ chối tài khoản bằng trạng thái `rejected` trong app (khuyến nghị); tạm thời xoá tay trong Dashboard (mục 5). |
| D11 | Đã làm ngày 25/11/2026: tách dữ liệu thành bảng riêng (`migration-split.sql` "split-1"); app tự dùng bảng riêng sau khi SQL được chạy, trước đó vẫn dùng `app_state`. |
| D1 | Tài khoản của thầy là admin chính (đã chốt); admin dự phòng là tài khoản dự phòng của thầy, đã nâng lên Ban thi đua trong app ngày 25/11/2026 (mục 6). |
| D3 | ⏳ Chưa chốt cách tính điểm trung bình tháng khi lớp nộp thiếu tuần. |
| D5 | ⏳ Chưa chốt trần điểm cộng/trừ đột xuất mỗi dòng (đề xuất: tối đa 20đ/dòng, bắt buộc ghi chú). |
| D8 | ⏳ Chưa chốt: người xem (GVCN) có được xuất .docx phiếu của lớp khác không — hiện tại được. |

## 11. Lớp của cờ đỏ ≠ lớp trực (làm rõ 25/11/2026)

Hai khái niệm khác nhau, đừng nhầm:

| Khái niệm | Nghĩa | Ở đâu |
|---|---|---|
| **Lớp của cờ đỏ** | Lớp mà tài khoản cờ đỏ đó thuộc về, **cố định**. Vd: Đỗ Thuỳ Dương — Cờ đỏ lớp 10B1. | Đăng ký ("Lớp của bạn"), Quản lý → Tài khoản cờ đỏ ("Lớp của cờ đỏ"), màn chờ duyệt. |
| **Lớp trực** | Lớp mà cờ đỏ đó **theo dõi trong tuần này**. Gán sau, theo lịch trực (roster) hoặc cờ đỏ tự chọn khi vào Nhập điểm. | Header ("Trực lớp 10B5"), banner Nhập điểm ("lớp bạn trực"), DutyPicker. |

- Lớp của cờ đỏ dùng để **tính lớp trực theo lịch** (vd cờ đỏ lớp 10B1 trực lớp 10B5 tuần 5) và hiển thị trong Quản lý ("Theo lịch trực: Tuần 5, cờ đỏ lớp 10B1 trực lớp 10B5").
- **Lớp trong hồ sơ không bao giờ tự thành lớp trực**: cờ đỏ chỉ có lớp của mình mà chưa có lịch trực thì vào Nhập điểm sẽ thấy DutyPicker để tự chọn lớp trực, không bị khóa vào lớp của mình.
- Khóa "ai giữ lớp trực" (P1-08) chỉ tính theo roster (lịch trực), không tính theo hồ sơ.
- Trường "Gán tuần" trong hồ sơ cờ đỏ đã bỏ (không còn tác dụng); tuần của lớp trực lấy theo tuần hiện tại.

_Cập nhật lần cuối: 25/11/2026 (đợt pro-2: cờ đỏ 2 tab, xếp hạng tháng, hộp thoại xác nhận, gọn mobile; theo bản audit `tong-thi-dua-tests/audit-pro.md`)._
