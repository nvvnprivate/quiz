const { P, keyOf, enabled, listModels } = require('./_providers');
const hits = new Map();
function limited(ip) {
  const lim = +process.env.RATE_LIMIT_PER_HOUR || 20, now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (a.length >= lim) { hits.set(ip, a); return true; }
  a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return false;
}
const RULE = {
  'một đáp án': 'Mỗi câu CHỈ có 1 đáp án đúng (c có đúng 1 phần tử).',
  'nhiều đáp án': 'Mỗi câu có 2 hoặc 3 đáp án đúng (c có 2-3 phần tử), đề bài ghi rõ "chọn tất cả đáp án đúng".',
  'trộn': 'Khoảng 70% câu có 1 đáp án đúng, 30% câu có 2-3 đáp án đúng (đề bài ghi rõ "chọn tất cả đáp án đúng").'
};
const buildPrompt = (text, n, diff, type, lang) => `Bạn là giáo viên giỏi. Dựa HOÀN TOÀN vào tài liệu dưới đây, tạo ${n} câu hỏi trắc nghiệm, độ khó ${diff}, ngôn ngữ: ${lang}.
Mục đích: giúp người học ôn tập, ưu tiên kiến thức trọng tâm. Mỗi câu có đúng 4 đáp án (A, B, C, D), đáp án sai phải hợp lý. ${RULE[type]} Không bịa thông tin ngoài tài liệu.
Chỉ trả về JSON, không thêm chữ nào khác: {"title":"...","questions":[{"q":"...","options":["A","B","C","D"],"c":[0],"exp":"giải thích ngắn"}]} (c là mảng chỉ số 0-3 của các đáp án đúng).
TÀI LIỆU:
${text}`;

async function ask(id, model, prompt, key) {
  const p = P[id], signal = AbortSignal.timeout(55000), H = { 'Content-Type': 'application/json' };
  let r, pick;
  if (p.kind === 'gemini') {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal, headers: { ...H, 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000 } }) });
    pick = j => ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(x => x.text || '').join('');
  } else if (p.kind === 'anthropic') {
    r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { ...H, 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }) });
    pick = j => (j.content || []).map(x => x.text || '').join('');
  } else {
    r = await fetch(p.base + '/chat/completions', { method: 'POST', signal, headers: { ...H, Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }) });
    pick = j => (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }
  const j = await r.json().catch(() => ({}));
  return { r, j, text: r.ok ? pick(j) : '' };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try { // chỉ nhận yêu cầu từ chính trang web này, chặn web lạ gọi nhờ
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Nguồn gọi không hợp lệ.' });
  } catch (e) { return res.status(403).json({ error: 'Nguồn gọi không hợp lệ.' }); }
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim();
  if (limited(ip)) return res.status(429).json({ error: 'Bạn đã dùng quá nhiều lượt trong 1 giờ, hãy thử lại sau.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(b.provider || ''), model = String(b.model || '');
  if (!P[id] || !enabled().includes(id)) return res.status(400).json({ error: 'AI này chưa được bật.' });
  if (!/^[\w.\-:\/]{1,120}$/.test(model) || !(await listModels(id)).includes(model)) return res.status(400).json({ error: 'Model này không có trong danh sách cho phép.' });
  const text = String(b.text || '').trim().slice(0, 20000);
  if (text.length < 80) return res.status(400).json({ error: 'Tài liệu quá ngắn.' });
  const n = Math.min(50, Math.max(3, parseInt(b.n, 10) || 8));
  const diff = ['dễ', 'vừa', 'khó'].includes(b.diff) ? b.diff : 'vừa';
  const type = RULE[b.type] ? b.type : 'trộn';
  const lang = String(b.lang || 'Tiếng Việt').replace(/[\r\n]/g, ' ').slice(0, 30);
  const key = keyOf(id);
  try {
    const { r, j, text: out } = await ask(id, model, buildPrompt(text, n, diff, type, lang), key);
    if (!r.ok) {
      const m = r.status === 401 || r.status === 403 ? 'Khóa API của AI này bị từ chối, chủ web cần kiểm tra lại.'
        : r.status === 429 ? 'AI này đang quá tải hoặc hết hạn mức, hãy thử model hoặc AI khác.'
        : 'AI báo lỗi (' + r.status + '): ' + String((j.error && (j.error.message || j.error)) || '').split(key).join('***').slice(0, 200);
      return res.status(502).json({ error: m });
    }
    const a = out.indexOf('{'), z = out.lastIndexOf('}');
    if (a < 0 || z < a) return res.status(502).json({ error: 'AI không trả về JSON, hãy thử lại hoặc đổi model.' });
    return res.status(200).json(JSON.parse(out.slice(a, z + 1)));
  } catch (e) {
    return res.status(502).json({ error: e.name === 'TimeoutError' ? 'AI trả lời quá lâu, hãy thử model nhanh hơn hoặc giảm số câu.' : 'Không gọi được AI, hãy thử lại.' });
  }
};
