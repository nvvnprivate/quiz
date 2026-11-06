// Rút ngắn link chia sẻ: lưu quiz vào Upstash Redis, trả về mã ngắn (đọc lại qua GET ?id=).
const crypto = require('crypto');
const L = require('./_lib');
const TTL = (+process.env.SHARE_TTL_DAYS || 365) * 86400;
const ID_RE = /^[\w-]{6,16}$/;
const limited = L.limiter(+process.env.SHARE_LIMIT_PER_HOUR || 30);
module.exports = async (req, res) => {
  if (!L.hasRedis) return res.status(501).json({ error: 'Chưa cấu hình lưu trữ link ngắn.' });
  if (req.method === 'GET') {
    const id = String((req.query && req.query.id) || '');
    if (!ID_RE.test(id)) return res.status(400).json({ error: 'Mã không hợp lệ.' });
    try {
      const v = await L.redis(['GET', 'quiz:' + id]);
      if (!v) return res.status(404).json({ error: 'Link không tồn tại hoặc đã hết hạn.' });
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(JSON.parse(v));
    } catch (e) { return res.status(502).json({ error: 'Không đọc được quiz, hãy thử lại.' }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!L.sameOrigin(req)) return res.status(403).json({ error: 'Nguồn gọi không hợp lệ.' });
  if (limited(L.ipOf(req))) return res.status(429).json({ error: 'Bạn tạo link quá nhiều lần trong 1 giờ, hãy thử lại sau.' });
  const data = L.cleanQuiz(req.body && typeof req.body === 'object' ? req.body : {});
  if (!data) return res.status(400).json({ error: 'Dữ liệu quiz không hợp lệ.' });
  const json = JSON.stringify(data);
  if (json.length > 200000) return res.status(413).json({ error: 'Quiz quá lớn để chia sẻ.' });
  try {
    for (let k = 0; k < 4; k++) {
      const id = crypto.randomBytes(6).toString('base64url').slice(0, 8);
      if (await L.redis(['SET', 'quiz:' + id, json, 'EX', TTL, 'NX']) === 'OK') return res.status(200).json({ id });
    }
    return res.status(502).json({ error: 'Không tạo được link, hãy thử lại.' });
  } catch (e) { return res.status(502).json({ error: 'Không lưu được quiz, hãy thử lại.' }); }
};
