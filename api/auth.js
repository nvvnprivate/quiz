// Đăng nhập / đăng ký bằng Google: GET = xem trạng thái, POST = đăng nhập, DELETE = đăng xuất.
const L = require('./_lib');
const limited = L.limiter(30);
const pub = u => ({ id: u.sub, email: u.email, name: u.name, picture: u.picture });
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!L.authEnabled) return res.status(200).json({ enabled: false, user: null, missing: L.missing });
  if (req.method === 'GET') {
    const u = L.readSession(req);
    return res.status(200).json({ enabled: true, clientId: L.CLIENT, user: u ? pub(u) : null });
  }
  if (!L.sameOrigin(req)) return res.status(403).json({ error: 'Nguồn gọi không hợp lệ.' });
  if (req.method === 'DELETE') { L.setSession(req, res, '', 0); return res.status(200).json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (limited(L.ipOf(req))) return res.status(429).json({ error: 'Thử đăng nhập quá nhiều lần, hãy thử lại sau.' });
  try {
    const u = await L.verifyGoogle(req.body && req.body.credential);
    L.setSession(req, res, L.makeSession(u), 30 * 86400);
    return res.status(200).json({ user: pub(u) });
  } catch (e) {
    return res.status(401).json({ error: 'Không xác minh được tài khoản Google, hãy thử lại.' });
  }
};
