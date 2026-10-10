-- NCKH sinh viên: trạng thái "Đã nộp" (chờ chuyên viên duyệt).
-- Tách riêng: giá trị enum mới chỉ dùng được sau khi giao dịch thêm nó đã commit.
ALTER TYPE "StudentProjectStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED' AFTER 'DRAFT';
