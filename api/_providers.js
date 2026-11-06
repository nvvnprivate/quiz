// Danh sách nhà cung cấp AI bản miễn phí. Khóa API đọc từ biến môi trường trên Vercel.
const P = {
  gemini: {
    name: 'Google Gemini (Free)',
    env: 'GEMINI_API_KEY',
    kind: 'gemini',
    note: 'model mặc định miễn phí',
    pref: [/^gemini-2\.5-flash$/, /^gemini-2\.0-flash$/, /flash-lite/, /flash/],
    fallback: ['gemini-2.5-flash']
  },
  groq: {
    name: 'Groq (Free)',
    env: 'GROQ_API_KEY',
    kind: 'openai',
    base: 'https://api.groq.com/openai/v1',
    exc: /(whisper|tts|guard|orpheus|playai|safeguard|vision)/i,
    note: 'model mặc định miễn phí',
    pref: [/^llama-3\.3-70b-versatile$/, /^llama-3\.1-8b-instant$/, /llama/i],
    fallback: ['llama-3.3-70b-versatile']
  },
  openrouter: {
    name: 'OpenRouter (Free)',
    env: 'OPENROUTER_API_KEY',
    kind: 'openai',
    base: 'https://openrouter.ai/api/v1',
    onlyFree: true,
    note: 'model mặc định miễn phí',
    pref: [/gemini.*:free/i, /llama-3\.3.*:free/i, /deepseek.*:free/i, /:free$/],
    fallback: ['meta-llama/llama-3.3-70b-instruct:free']
  }
};

const cache = {};
const csv = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
const keyOf = id => process.env[P[id] && P[id].env];
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
      .map(m => m.name.replace(/^models\//, '')).filter(i => !/(image|tts|live|audio|embed|veo|imagen|lyria|robotics|computer-use|aqa|omni|pro)/i.test(i));
  }
  const j = await getJson(p.base + '/models', { Authorization: 'Bearer ' + key });
  let ids = (j.data || []).map(m => m.id);
  if (p.inc) ids = ids.filter(i => p.inc.test(i));
  if (p.exc) ids = ids.filter(i => !p.exc.test(i));
  if (p.onlyFree) ids = ids.filter(i => i.endsWith(':free'));
  return ids;
}

// Chỉ trả về ĐÚNG 1 model mặc định bản free cho mỗi nhà cung cấp
async function listModels(id) {
  const c = cache[id];
  if (c && Date.now() - c.t < 3600e3) return c.models;
  let ids = [], failed = false;
  try { ids = await fetchIds(id); } catch (e) { failed = true; }
  if (!ids.length) ids = P[id].fallback.slice();
  const only = csv(process.env.ALLOWED_MODELS);
  if (only.length) ids = ids.filter(i => only.includes(i));
  ids = [...new Set(ids)];

  let chosen = null;
  for (const rx of (P[id].pref || [])) {
    chosen = ids.find(i => rx.test(i));
    if (chosen) break;
  }
  if (!chosen && ids.length) chosen = ids[0];
  const finalModels = chosen ? [chosen] : P[id].fallback.slice(0, 1);

  cache[id] = { t: Date.now() - (failed ? 3540e3 : 0), models: finalModels };
  return finalModels;
}

module.exports = { P, keyOf, enabled, listModels };
