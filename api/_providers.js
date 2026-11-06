// Danh sách nhà cung cấp AI. Khóa API đọc từ biến môi trường (Vercel → Settings → Environment Variables).
const P = {
  gemini: { name: 'Google Gemini', env: 'GEMINI_API_KEY', kind: 'gemini', note: 'có gói miễn phí giới hạn', fallback: ['gemini-3.8-flash','gemini-3.6-flash', 'gemini-3.1-flash-lite'] },
};
const cache = {};
const csv = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
const keyOf = id => process.env[P[id].env];
const enabled = () => Object.keys(P).filter(id => keyOf(id) && (!csv(process.env.ALLOWED_PROVIDERS).length || csv(process.env.ALLOWED_PROVIDERS).includes(id)));

async function getJson(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function fetchIds(id) {
  const p = P[id], key = keyOf(id);
  if (p.kind === 'gemini') {
    const j = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key });
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')).filter(i => !/(image|tts|live|audio|embed|veo|imagen|lyria|robotics|computer-use|aqa|omni)/i.test(i));
  }
  if (p.kind === 'anthropic') {
    const j = await getJson('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
    return (j.data || []).map(m => m.id);
  }
  const j = await getJson(p.base + '/models', { Authorization: 'Bearer ' + key });
  let ids = (j.data || []).map(m => m.id);
  if (p.inc) ids = ids.filter(i => p.inc.test(i));
  if (p.exc) ids = ids.filter(i => !p.exc.test(i));
  if (p.onlyFree) ids = ids.filter(i => i.endsWith(':free'));
  return ids;
}
// Lấy danh sách model trực tiếp từ nhà cung cấp (luôn cập nhật), cache 1 giờ.
async function listModels(id) {
  const c = cache[id];
  if (c && Date.now() - c.t < 3600e3) return c.models;
  let ids = [], failed = false;
  try { ids = await fetchIds(id); } catch (e) { failed = true; }
  if (!ids.length) ids = P[id].fallback.slice();
  const only = csv(process.env.ALLOWED_MODELS);
  if (only.length) ids = ids.filter(i => only.includes(i));
  ids = [...new Set(ids)].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  cache[id] = { t: Date.now() - (failed ? 3540e3 : 0), models: ids };
  return ids;
}
module.exports = { P, keyOf, enabled, listModels };
