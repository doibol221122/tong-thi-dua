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
Bản deploy tĩnh trên Vercel, dữ liệu lưu trong trình duyệt (localStorage).
Dùng **Quản lý → Sao lưu dữ liệu** để xuất/nhập file JSON, tránh mất dữ liệu khi đổi máy.

## Chạy tại chỗ
```bash
npm install
npm run dev
npm run build
```
