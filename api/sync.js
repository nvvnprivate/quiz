// Lưu / đọc thư viện quiz của người đã đăng nhập (mỗi tài khoản một khóa riêng).
const L = require('./_lib');
const limited = L.limiter(300);
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!L.authEnabled) return res.status(501).json({ error: 'Chưa bật đăng nhập.' });
  const u = L.readSession(req);
  if (!u) return res.status(401).json({ error: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.' });
  const key = 'user:' + u.sub;
  try {
    if (req.method === 'GET') {
      const v = await L.redis(['GET', key]);
      return res.status(200).json({ quizzes: v ? JSON.parse(v) : [] });
    }
    if (req.method !== 'PUT' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!L.sameOrigin(req)) return res.status(403).json({ error: 'Nguồn gọi không hợp lệ.' });
    if (limited(u.sub)) return res.status(429).json({ error: 'Lưu quá nhiều lần, hãy thử lại sau.' });
    const list = L.cleanList(req.body && req.body.quizzes);
    if (!list) return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
    const json = JSON.stringify(list);
    if (json.length > 900000) return res.status(413).json({ error: 'Thư viện quá lớn, hãy xóa bớt quiz.' });
    await L.redis(['SET', key, json]);
    return res.status(200).json({ ok: true, count: list.length });
  } catch (e) {
    return res.status(502).json({ error: 'Không kết nối được kho lưu trữ, hãy thử lại.' });
  }
};
