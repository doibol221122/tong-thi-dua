# Hệ thống Tổng Thi Đua — THPT Hùng Vương-Quảng Phú

Hệ thống tổng kết thi đua tuần cho Ban thi đua. Chấm điểm theo phiếu giấy gốc:
điểm thi đua = 100 + điểm cộng − điểm trừ, xếp loại A (≥80), B (≥65), C (≥50), D (<50).

## Tính năng
- Nhập điểm 3 phần: Giờ học / Học tập / Nề nếp, đúng thang điểm phiếu giấy
  (100% giờ Tốt +20đ, không vắng/không muộn +10đ, các mức trừ -1/-2/-3/-5/-10/-20đ).
- Quản lý tuần, lớp (thêm cả khối, vd 10B1–10B5), tìm lớp, chép số liệu tuần trước.
- Phân quyền: Ban thi đua toàn quyền; Cờ đỏ chỉ nhập/nộp lớp được phân công;
  Chỉ xem chỉ xem. Lưu ai nhập/nộp và thời gian.
- Quy trình: Nháp → Cờ đỏ nộp → Ban thi đua duyệt/trả lại kèm lý do → chốt tuần.
  Chỉ phiếu đã duyệt mới vào xếp hạng chính thức.
- Tổng quan, Xếp hạng (bục top 3), Tổng hợp theo điểm trung bình qua các tuần,
  Lịch sử hoạt động, Cài đặt (tên trường, số văn bản, người ký, giờ chuẩn).
- Xuất CSV và .docx đúng mẫu TỔNG HỢP THI ĐUA TUẦN 04 (font Times New Roman).
- Responsive mọi thiết bị.

## Dữ liệu
Bản deploy tĩnh trên Vercel. Khi đã cấu hình Supabase (mục dưới), dữ liệu
tuần/lớp/phiếu và tài khoản lưu chung trên Supabase, mọi máy đều thấy.
Chưa cấu hình Supabase thì dữ liệu chỉ lưu trong trình duyệt (localStorage).
Dùng **Quản lý → Sao lưu dữ liệu** để xuất/nhập file JSON dự phòng.

## Đăng nhập dùng chung cho mọi máy (Supabase, miễn phí)
Chưa cấu hình Supabase thì app chạy chế độ cũ: mở lên chọn vai trò,
dữ liệu chỉ lưu trên máy đó. Để có đăng nhập + dữ liệu dùng chung:
1. Tạo project miễn phí tại https://supabase.com/dashboard → **New project**
   (chọn region gần nhất, đặt mật khẩu database rồi giữ lại).
2. Vào project → **SQL Editor** → **New query**, dán toàn bộ nội dung file
   `supabase/schema.sql` trong repo này rồi bấm **Run**. File này tạo 2 bảng
   `profiles` (hồ sơ tài khoản) và `app_state` (dữ liệu tuần/lớp/phiếu dùng chung)
   kèm Row Level Security.
3. Vào **Project Settings → API**, copy **Project URL** và **anon public key**.
4. Vào Vercel → project `tong-thi-dua` → **Settings → Environment Variables**,
   thêm `VITE_SUPABASE_URL` = Project URL và `VITE_SUPABASE_ANON_KEY` = anon key
   (chỉ dùng anon key, KHÔNG dùng service_role key), rồi **Redeploy**.
   Chạy tại chỗ thì copy `.env.example` thành `.env` rồi điền 2 giá trị trên.
5. Mở app, bấm **Đăng ký**: tài khoản **đầu tiên** đăng ký sẽ thành **Ban thi đua**
   (quản trị, được vào ngay). Các tài khoản sau đăng ký vai trò **Cờ đỏ trực**
   hoặc **Chỉ xem**, đều ở trạng thái **chờ duyệt** và chỉ vào được sau khi
   Ban thi đua bấm **Duyệt** ở **Quản lý → Tài khoản**. Ban thi đua cũng gán
   lớp/tuần cho cờ đỏ, đổi vai trò, khóa/mở tài khoản ở đó.
6. Quên mật khẩu: bấm **Quên mật khẩu** ở màn hình đăng nhập, Supabase gửi
   email đặt lại (cần bật email trong Supabase Auth; mặc định đã bật).
Lưu ý: tài khoản và dữ liệu dùng chung nằm trên Supabase, không còn trong
file JSON sao lưu cũ. Xuất JSON trong app vẫn dùng được để sao lưu dự phòng.

## Chạy tại chỗ
```bash
npm install
npm run dev
npm run build
```
