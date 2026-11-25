# Hướng dẫn vận hành — App Tổng Thi Đua

> Dành cho Ban thi đua (người quản trị, không cần biết code). App chạy tại
> https://tong-thi-dua.vercel.app — dữ liệu dùng chung lưu trên Supabase.
>
> **Lưu ý trạng thái (25/11/2026):** gói nâng cấp "pro-1" đã làm xong
> trong code ngày 24/11/2026 nhưng **chưa deploy** — các mục đánh dấu ⏳
> chỉ chạy được sau khi deploy bản mới (và, với sao lưu/từ chối, sau khi
> chạy `migration-pro.sql` trong Supabase). Đợt "pro-2" ngày 25/11/2026
> (cờ đỏ 2 tab, xếp hạng tháng, hộp thoại xác nhận trong app, gọn header
> trên điện thoại — xem mục 9) cũng đã làm xong trong code và **chưa
> deploy**. Cho tới lúc đó, làm theo bước "quy trình tay" ghi kèm. Mục
> không đánh dấu là đã có sẵn trong app.

## 1. Checklist Supabase Dashboard (kiểm tra sau mỗi lần deploy)

Làm trong [Supabase Dashboard](https://supabase.com/dashboard) → đúng project
`tong-thi-dua`, mục **Authentication → URL Configuration**:

- [ ] **Site URL** = `https://tong-thi-dua.vercel.app`
- [ ] **Redirect URLs** có chứa `https://tong-thi-dua.vercel.app`
      (cần cho email "Quên mật khẩu" quay lại đúng app)
- [ ] **Confirm email: BẬT** (Authentication → Providers → Email)
- [ ] **Schema đã chạy:** xem bảng phiên bản ở mục 2, đối chiếu ngày chạy
- [ ] **Khóa `service_role`: KHÔNG BAO GIỜ chia sẻ, không nhập vào app,
      không gửi qua chat/Zalo.** App chỉ dùng `VITE_SUPABASE_ANON_KEY`
      (khóa này nằm trong code là đúng thiết kế; an toàn nhờ RLS).

## 2. Phiên bản schema (ghi lại mỗi lần chạy SQL)

**Trước khi chạy `migration-pro.sql` (bước 0 — bắt buộc):**

- [ ] Mở app, đăng nhập bằng **tài khoản của thầy** (tài khoản admin
      chính đã xác nhận), kiểm tra trong tab **Quản lý → Tài khoản**
      tài khoản này hiện vai trò **Ban thi đua** và trạng thái **Đang dùng**.
- [ ] Nếu tài khoản này **chưa phải admin**: nhờ một admin khác nâng vai
      trò cho bạn trong app, **hoặc** mở file
      `supabase/migration-pro.sql`, bỏ dấu `--` ở dòng `UPDATE profiles
      SET role = 'admin' ...` trong mục 0, điền email của thầy vào chỗ
      `<email-cua-ban>`, rồi chạy riêng dòng đó trong SQL Editor **trước**
      khi chạy phần còn lại. (Điền email lúc chạy, không sửa file trong repo.)
- [ ] Nếu tài khoản của bạn là hồ sơ **đầu tiên** từng được tạo thì nó
      đã là admin rồi (quy tắc khởi tạo) — chỉ cần kiểm tra lại cho chắc.
- [ ] Kiểm tra không có email trùng trong `profiles` (truy vấn ghi trong
      mục 3 của file migration) rồi mới chạy — trùng email sẽ làm
      migration dừng giữa chừng.

| Phiên bản | Nội dung | Chạy ở | Ngày chạy | Người chạy |
|---|---|---|---|---|
| `schema.sql` (gốc) | Bảng `profiles`, `app_state`, RLS cơ bản | SQL Editor | _(ghi ngày đã chạy)_ | |
| `migration-pro.sql` "pro-1" ⏳ | Siết RLS (chống tự lên admin), bảng `app_state_history`, trạng thái tài khoản `rejected`, cột `version` cho `app_state` | SQL Editor | _(ghi ngày chạy — chưa chạy)_ | |

Quy tắc: **mỗi lần đổi schema thì tăng số phiên bản và ghi ngày vào bảng
trên.** Không chạy SQL nào ngoài file đã chốt trong repo.

## 3. Sao lưu & khôi phục

**Trước mọi đợt nhập/xoá lớn** (nhập JSON, xoá tuần/lớp, gán lại cả tuần):

- [ ] Vào tab **Quản lý** → **Xuất JSON** (nút "Tải JSON sao lưu") và lưu
      file vào máy. Đặt tên có ngày giờ, ví dụ
      `tong-thi-dua-sao-luu_2026-11-24-2100.json`.
- [ ] Chỉ sau đó mới làm thao tác lớn.

**Khôi phục về một bản cũ:**

- [ ] Tab **Quản lý** → mục **Sao lưu & khôi phục** → **Khôi phục phiên bản…**
      (liệt kê tối đa 30 bản gần nhất trong `app_state_history`, kèm ngày giờ
      và người đã lưu) → chọn bản cần → xác nhận. (Chỉ có sau khi chạy
      `migration-pro.sql` — chưa chạy thì mục này hiện hướng dẫn chạy SQL.)
- [ ] Mỗi lần khôi phục đều được ghi vào Nhật ký (tab **Lịch sử**).
- [ ] Quy trình tay (khi chưa có mục Khôi phục): vào **Quản lý** → **Nhập JSON**,
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

Quy trình trong tab **Quản lý → Tài khoản**:

1. Người mới tự đăng ký trong app (chọn vai trò **Cờ đỏ** hoặc **Chỉ xem**;
   tài khoản **đầu tiên** đăng ký sẽ tự thành **admin**).
2. Tài khoản mới ở trạng thái **Chờ duyệt** — chưa xem/sửa được dữ liệu.
   Cờ đỏ chờ duyệt tự chọn lớp của mình ngay ở màn hình chờ.
3. Admin bấm **Duyệt** → tài khoản được vào app, admin gán lớp/tuần trực.
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

## 6. Admin dự phòng — ⚠️ CHƯA CHỐT (quyết định D1, một phần)

- **Admin chính đã chốt: tài khoản của thầy (người quản trị app).**
  Trước khi chạy migration "pro-1" phải kiểm tra tài khoản này đã là
  admin trong app (xem checklist bước 0 ở mục 2).
- **Admin dự phòng: hiện tại chưa chọn ai.** Nên có 2 admin (Ban thi đua +
  một thầy/cô) để không bị khóa cứng nếu admin duy nhất mất tài khoản.
- Cho tới khi chốt: ghi tên admin dự phòng vào đây: _(chưa có)_.
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

- [ ] Tab **Quản lý → Tài khoản**: duyệt/từ chối tài khoản mới đăng ký.
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
| D11 | Trước mắt giữ dữ liệu trong một blob `app_state` + lịch sử/sao lưu; tách thành bảng riêng khi có thời gian. |
| D1 | Tài khoản của thầy là admin chính (đã chốt); admin dự phòng chưa chốt (mục 6). |
| D3 | ⏳ Chưa chốt cách tính điểm trung bình tháng khi lớp nộp thiếu tuần. |
| D5 | ⏳ Chưa chốt trần điểm cộng/trừ đột xuất mỗi dòng (đề xuất: tối đa 20đ/dòng, bắt buộc ghi chú). |
| D8 | ⏳ Chưa chốt: người xem (GVCN) có được xuất .docx phiếu của lớp khác không — hiện tại được. |

_Cập nhật lần cuối: 25/11/2026 (đợt pro-2: cờ đỏ 2 tab, xếp hạng tháng, hộp thoại xác nhận, gọn mobile; theo bản audit `tong-thi-dua-tests/audit-pro.md`)._
