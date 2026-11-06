// Cấu hình chỉ dùng duy nhất Google Gemini, ưu tiên phiên bản Gemini 3.8 Flash mới nhất
const P = {
  gemini: {
    name: 'Google Gemini',
    env: 'GEMINI_API_KEY',
    kind: 'gemini',
    pref: [/^gemini-3\.8-flash$/, /^gemini-3\.7-flash$/, /^gemini-2\.5-flash$/, /flash/],
    fallback: ['gemini-3.8-flash']
  }
};

const cache = {};
const keyOf = id => process.env[P[id] && P[id].env];
const enabled = () => Object.keys(P).filter(id => keyOf(id));

async function getJson(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function fetchIds(id) {
  const key = keyOf(id);
  const j = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key });
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, '')).filter(i => !/(image|tts|live|audio|embed|veo|imagen|lyria|robotics|computer-use|aqa|omni|pro)/i.test(i));
}

async function listModels(id) {
  const c = cache[id];
  if (c && Date.now() - c.t < 3600e3) return c.models;
  let ids = [], failed = false;
  try { ids = await fetchIds(id); } catch (e) { failed = true; }
  if (!ids.length) ids = P[id].fallback.slice();

  let chosen = null;
  for (const rx of (P[id].pref || [])) {
    chosen = ids.find(i => rx.test(i));
    if (chosen) break;
  }
  const finalModels = [chosen || ids[0] || P[id].fallback[0]];
  cache[id] = { t: Date.now() - (failed ? 3540e3 : 0), models: finalModels };
  return finalModels;
}

module.exports = { P, keyOf, enabled, listModels };
