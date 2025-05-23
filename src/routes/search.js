// src/routes/search.js
import express from 'express';
import { searchLogs } from '../services/elastic.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const {
    q,
    service,
    eventType,
    start,
    end,
    page = 1,
    limit = 20
  } = req.query;

  // Build up the ES bool query
  const must = [];
  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['service', 'eventType', 'payload'],
        fuzziness: 'AUTO',
      },
    });
  }
  if (service) {
    must.push({ term: { service } });
  }
  if (eventType) {
    must.push({ term: { eventType } });
  }
  if (start || end) {
    const range = {};
    if (start) range.gte = start;
    if (end)   range.lte = end;
    must.push({ range: { timestamp: range } });
  }

  const pageNum  = Math.max(1, parseInt(page,  10));
  const pageSize = Math.max(1, parseInt(limit, 10));
  const from     = (pageNum - 1) * pageSize;

  try {
    // Delegate to the elastic service
    const result     = await searchLogs({ must, from, size: pageSize });
    const body       = result.body ?? result;               // support both v8 and v7 clients
    const hits       = body.hits;
    const total      = hits.total.value;
    const logs       = hits.hits.map(hit => hit._source);

    return res.json({
      page:  pageNum,
      limit: pageSize,
      total,
      logs
    });
  } catch (err) {
    console.error('Search error:', err.meta?.body?.error || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
