// Danh sách nhà cung cấp AI. Khóa API đọc từ biến môi trường (Vercel → Settings → Environment Variables).
const P = {
  gemini: { name: 'Google Gemini', env: 'GEMINI_API_KEY', kind: 'gemini', note: 'có gói miễn phí giới hạn', fallback: ['gemini-3.6-flash', 'gemini-3.1-flash-lite'] },
  anthropic: { name: 'Anthropic Claude', env: 'ANTHROPIC_API_KEY', kind: 'anthropic', fallback: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] },
  openai: { name: 'OpenAI', env: 'OPENAI_API_KEY', kind: 'openai', base: 'https://api.openai.com/v1',
    inc: /^(gpt|o\d|chatgpt|chat-latest)/, exc: /(audio|realtime|image|tts|transcribe|embedding|moderation|search|instruct|codex|dall|whisper|sora|davinci|babbage|computer-use)/i, fallback: ['gpt-5.4'] },
  deepseek: { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY', kind: 'openai', base: 'https://api.deepseek.com', fallback: ['deepseek-chat', 'deepseek-reasoner'] },
  xai: { name: 'xAI Grok', env: 'XAI_API_KEY', kind: 'openai', base: 'https://api.x.ai/v1', exc: /(image|imagine|video)/i, fallback: [] },
  mistral: { name: 'Mistral', env: 'MISTRAL_API_KEY', kind: 'openai', base: 'https://api.mistral.ai/v1', exc: /(embed|ocr|moderation|voxtral|transcribe)/i, fallback: ['mistral-small-latest', 'mistral-large-latest'] },
  groq: { name: 'Groq', env: 'GROQ_API_KEY', kind: 'openai', base: 'https://api.groq.com/openai/v1', exc: /(whisper|tts|guard|orpheus|playai|safeguard)/i, note: 'có gói miễn phí giới hạn', fallback: [] },
  openrouter: { name: 'OpenRouter', env: 'OPENROUTER_API_KEY', kind: 'openai', base: 'https://openrouter.ai/api/v1', onlyFree: true, note: 'một khóa, chỉ liệt kê model miễn phí', fallback: [] }
};
// Chỉ cho dùng đúng 1 AI và 1 model.
const ONLY = { provider: 'gemini', model: 'gemini-3.8-flash' };
const cache = {};
const csv = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
const keyOf = id => process.env[P[id].env];
const enabled = () => Object.keys(P).filter(id => id === ONLY.provider && keyOf(id));

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
  return id === ONLY.provider ? [ONLY.model] : [];
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
