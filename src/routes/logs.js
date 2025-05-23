// src/routes/logs.js
import express from 'express';
import { getAuditCollection } from '../services/mongo.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { service, eventType, start, end, page = 1, limit = 20 } = req.query;

  // Build the Mongo filter
  const filter = {};
  if (service)     filter.service   = service;
  if (eventType)   filter.eventType = eventType;
  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = new Date(start);
    if (end)   filter.timestamp.$lte = new Date(end);
  }

  // Pagination params
  const pageNum  = Math.max(1, parseInt(page,  10));
  const pageSize = Math.max(1, parseInt(limit, 10));
  const skip     = (pageNum - 1) * pageSize;

  try {
    const collection = getAuditCollection();
    const total = await collection.countDocuments(filter);
    const logs  = await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    return res.json({
      page:  pageNum,
      limit: pageSize,
      total,
      logs
    });
  } catch (err) {
    console.error('Query error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
