// Tiện ích dùng chung: Redis (Upstash REST), kiểm tra dữ liệu quiz, đăng nhập Google, phiên đăng nhập.
const crypto = require('crypto');
const RURL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const RTOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const CLIENT = process.env.GOOGLE_CLIENT_ID || '';
const SECRET = process.env.SESSION_SECRET || '';
const hasRedis = !!(RURL && RTOKEN);
const authEnabled = !!(hasRedis && CLIENT && SECRET.length >= 16);
const missing = [];
if (!hasRedis) missing.push('Upstash Redis (UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN, hoặc KV_REST_API_URL và KV_REST_API_TOKEN)');
if (!CLIENT) missing.push('GOOGLE_CLIENT_ID');
if (SECRET.length < 16) missing.push('SESSION_SECRET (chuỗi ngẫu nhiên từ 16 ký tự)');

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
function cleanList(arr) {
  if (!Array.isArray(arr) || arr.length > 300) return null;
  const out = [];
  for (const x of arr) {
    const id = String((x && x.id) || '');
    const qz = cleanQuiz(x);
    if (!/^[\w-]{1,40}$/.test(id) || !qz) continue;
    out.push({ id, title: qz.title, questions: qz.questions, created: Number.isFinite(+x.created) ? +x.created : Date.now() });
  }
  return out;
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

// ---- Xác minh ID token của Google (RS256), không cần thư viện ----
let certs = { t: 0, keys: [] };
async function googleKeys(force) {
  if (!force && certs.keys.length && Date.now() - certs.t < 3600e3) return certs.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('certs');
  certs = { t: Date.now(), keys: (await r.json()).keys || [] };
  return certs.keys;
}
async function verifyGoogle(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) throw new Error('bad');
  const head = JSON.parse(Buffer.from(p[0], 'base64url')), pay = JSON.parse(Buffer.from(p[1], 'base64url'));
  if (head.alg !== 'RS256') throw new Error('bad');
  const jwk = (await googleKeys()).find(k => k.kid === head.kid) || (await googleKeys(true)).find(k => k.kid === head.kid);
  if (!jwk) throw new Error('bad');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(p[2], 'base64url'));
  if (!ok || !['accounts.google.com', 'https://accounts.google.com'].includes(pay.iss) || pay.aud !== CLIENT
    || !(pay.exp * 1000 > Date.now()) || !(pay.email_verified === true || pay.email_verified === 'true') || !/^\w{4,64}$/.test(String(pay.sub))) throw new Error('bad');
  return { sub: String(pay.sub), email: str(pay.email, 200), name: str(pay.name || pay.email, 100), picture: /^https:\/\//.test(pay.picture || '') ? str(pay.picture, 500) : '' };
}

// ---- Phiên đăng nhập: cookie HttpOnly, ký HMAC bằng SESSION_SECRET ----
const mac = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeSession(u) {
  const p = Buffer.from(JSON.stringify({ ...u, exp: Date.now() + 30 * 864e5 })).toString('base64url');
  return p + '.' + mac(p);
}
function readSession(req) {
  const m = /(?:^|;\s*)quizai_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [p, s] = m[1].split('.');
  if (!p || !s) return null;
  const a = Buffer.from(mac(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const u = JSON.parse(Buffer.from(p, 'base64url')); return u.exp > Date.now() ? u : null; } catch (e) { return null; }
}
function setSession(req, res, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
  res.setHeader('Set-Cookie', `quizai_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
module.exports = { hasRedis, authEnabled, missing, CLIENT, redis, cleanQuiz, cleanList, sameOrigin, ipOf, limiter, verifyGoogle, makeSession, readSession, setSession };
