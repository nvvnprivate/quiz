# QuizAI

Web tạo quiz ôn tập từ tài liệu (PDF, Word, văn bản) bằng AI Gemini hoặc Claude. Chạy hoàn toàn trên trình duyệt, không cần máy chủ.

## Đặt lên GitHub Pages

1. Đăng nhập GitHub, bấm **New repository**, đặt tên (ví dụ `quizai`), chọn **Public**, tạo repo.
2. Bấm **Add file → Upload files**, kéo `index.html` (và `README.md`) vào, bấm **Commit changes**.
3. Vào **Settings → Pages**. Ở mục **Build and deployment**, chọn **Deploy from a branch**, nhánh **main**, thư mục **/(root)**, bấm **Save**.
4. Chờ 1–2 phút. Web có địa chỉ `https://<tên-github-của-bạn>.github.io/quizai/`.

## Lấy khóa API

- **Gemini:** vào aistudio.google.com, tạo API key. Xem hạn mức miễn phí hiện tại trên trang của Google.
- **Claude:** vào console.anthropic.com, tạo API key. Tính phí riêng theo lượng dùng, không dùng chung gói claude.ai.

Dán khóa vào bước 3 khi tạo quiz. Tên model có thể sửa ngay trong ô Model nếu Google hoặc Anthropic đổi tên.

## Lưu ý quan trọng

- **Không ghi khóa API vào file trong repo.** Web chỉ lưu khóa trong trình duyệt của bạn (localStorage).
- Quiz cũng lưu trong trình duyệt, mỗi máy một kho riêng. Dùng **Xuất tất cả (.json)** để sao lưu hoặc chuyển sang máy khác, và **Nhập file** để nạp lại.
- Nút 🔗 trên mỗi quiz tạo liên kết chứa toàn bộ nội dung quiz. Người nhận mở liên kết là làm được ngay và có thể lưu vào thư viện của họ. Quiz dài thì liên kết dài, nếu app chat cắt mất thì gửi file .json.
- PDF scan dạng ảnh không đọc được. File .doc cũ cần lưu lại thành .docx.
