# QuizAI trên Vercel

Web tạo quiz ôn tập từ tài liệu bằng AI. Khóa API nằm trong **biến môi trường trên Vercel**, người dùng không cần nhập khóa và không thấy khóa.

## Cấu trúc

- `index.html`: giao diện.
- `api/models.js`: trả danh sách AI và model đang bật (lấy trực tiếp từ nhà cung cấp, luôn cập nhật).
- `api/generate.js`: nhận tài liệu, gọi AI bằng khóa của bạn, trả về quiz.
- `api/_providers.js`: danh sách nhà cung cấp.

## Triển khai

**Cách 1: qua GitHub (repo Public hay Private đều được)**
1. Đưa toàn bộ thư mục này lên một repo GitHub (giữ nguyên thư mục `api`).
2. Vào vercel.com, đăng nhập bằng GitHub, chọn **Add New → Project**, chọn repo, để Framework Preset là **Other**, bấm **Deploy**.

**Cách 2: dùng dòng lệnh**
```
npm i -g vercel
cd quizai-vercel
vercel
vercel --prod
```

## Gắn khóa API vào biến môi trường

Vào **Project → Settings → Environment Variables**, thêm biến cho AI bạn muốn bật (chỉ AI nào có khóa mới hiện trên web):

| AI | Tên biến |
|---|---|
| Google Gemini | `GEMINI_API_KEY` |
| Anthropic Claude | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| xAI Grok | `XAI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Sau khi thêm hoặc sửa biến, vào **Deployments → Redeploy** để áp dụng. Không bao giờ ghi khóa vào file trong repo.

## Chống lạm dụng (quan trọng khi cho mọi người dùng chung)

Mọi lượt tạo quiz đều tính vào tài khoản AI của bạn. Nên làm:

- Đặt **giới hạn chi tiêu** trong trang quản lý của từng nhà cung cấp.
- Ưu tiên AI có gói miễn phí hoặc model rẻ.
- Biến tùy chọn: `ALLOWED_PROVIDERS` (vd `gemini,groq`), `ALLOWED_MODELS` (liệt kê đúng tên model được phép, cách nhau dấu phẩy), `RATE_LIMIT_PER_HOUR` (mặc định 20 lượt/giờ/IP).
- Giới hạn theo IP trong code chỉ là mức cơ bản. Muốn chặt hơn, bật rate limiting trong Vercel Firewall.

## Chạy thử trên máy

```
vercel dev
```
Mở địa chỉ hiện ra. Không mở `index.html` trực tiếp vì sẽ không gọi được `/api`.

## Bảo mật khóa API: checklist

Code đã làm sẵn: khóa chỉ đọc từ biến môi trường ở phía máy chủ, không bao giờ gửi về trình duyệt, không nằm trong prompt gửi cho AI, không in ra log, được che nếu nhà cung cấp trả lỗi có chứa khóa, và gửi qua header (không nằm trên URL). API chỉ nhận yêu cầu từ chính trang web của bạn. Dự án không dùng thư viện npm nào nên không có rủi ro từ thư viện bên thứ ba.

Phần bạn cần tự làm (code không làm thay được):
1. **Không bao giờ dán khóa vào file trong repo** (kể cả repo Private). Chỉ nhập ở Vercel → Settings → Environment Variables. Nếu có tùy chọn **Sensitive**, hãy bật.
2. Chỉ bật biến cho môi trường **Production** nếu không cần chạy bản Preview.
3. **Đặt giới hạn chi tiêu** ở từng nhà cung cấp AI. Đây là lớp bảo vệ cứng nhất nếu có người lạm dụng.
4. Nếu nghi ngờ lộ khóa (lỡ dán lên GitHub, chat, ảnh chụp màn hình…): vào trang nhà cung cấp **xóa khóa cũ, tạo khóa mới**, cập nhật lên Vercel rồi Redeploy.
5. Dùng khóa riêng cho web này, đừng dùng chung với dự án khác, để thu hồi dễ.
