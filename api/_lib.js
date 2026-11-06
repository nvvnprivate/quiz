// Tiện ích dùng chung: Redis (Upstash REST), kiểm tra dữ liệu quiz, giới hạn lượt gọi.
// Tìm cặp biến Redis do Vercel/Upstash tạo, kể cả khi có tiền tố tùy chọn (vd STORAGE_KV_REST_API_URL).
function findRedis() {
  for (const [u, t] of [['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], ['KV_REST_API_URL', 'KV_REST_API_TOKEN']]) {
    for (const k of Object.keys(process.env)) {
      if (k !== u && !k.endsWith('_' + u)) continue;
      const tok = process.env[k.slice(0, k.length - u.length) + t];
      if (process.env[k] && tok) return [process.env[k], tok];
    }
  }
  return [];
}
const [RURL, RTOKEN] = findRedis();
const hasRedis = !!(RURL && RTOKEN);

async function redis(cmd) {
  const r = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('redis');
  return j.result;
}
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
// Chỉ giữ đúng các trường cần thiết của một quiz.
function cleanQuestions(arr) {
  if (!Array.isArray(arr) || !arr.length || arr.length > 100) return null;
  const out = [];
  for (const q of arr) {
    if (!q || !Array.isArray(q.options) || q.options.length !== 4) return null;
    const c = (Array.isArray(q.c) ? q.c : [q.a]).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 3);
    if (!c.length) return null;
    out.push({ q: str(q.q, 1000), options: q.options.map(o => str(o, 500)), c: [...new Set(c)], exp: str(q.exp, 1000) });
  }
  return out;
}
function cleanQuiz(b) {
  const questions = b && cleanQuestions(b.questions);
  return questions ? { title: str(b.title, 200) || 'Quiz', questions } : null;
}
function sameOrigin(req) {
  try { return !req.headers.origin || new URL(req.headers.origin).host === req.headers.host; } catch (e) { return false; }
}
const ipOf = req => ((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim();
function limiter(max) {
  const hits = new Map();
  return key => {
    const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < 3600e3);
    if (a.length >= max) { hits.set(key, a); return true; }
    a.push(now); hits.set(key, a);
    if (hits.size > 5000) hits.clear();
    return false;
  };
}

module.exports = { hasRedis, redis, cleanQuiz, sameOrigin, ipOf, limiter };
