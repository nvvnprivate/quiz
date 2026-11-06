const { P, enabled, listModels } = require('./_providers');
module.exports = async (req, res) => {
  const ids = enabled();
  const rows = await Promise.all(ids.map(async id => ({ id, name: P[id].name, note: P[id].note || '', models: await listModels(id) })));
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).json({ providers: rows.filter(r => r.models.length) });
};
