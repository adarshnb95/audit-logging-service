import express from 'express';
import { getAuditCollection, getDeadLetterCollection } from '../services/mongo.js';
import { indexDocument } from '../services/elastic.js';
import { validateEvent } from './validation.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const payload = req.body;
  const { valid, errors } = validateEvent(payload);
  if (!valid) {
    // write the bad payload + errors to dead-letter collection
    await getDeadLetterCollection().insertOne({ error: errors, event: payload, receivedAt: new Date() });
    return res.status(400).json({ error: 'Invalid payload', details: errors });
  }

  try {
    const result = await getAuditCollection().insertOne(payload);
    const id = result.insertedId.toString();
    // strip _id before indexing to ES
    const { _id, ...doc } = payload;
    await indexDocument(id, doc);
    return res.status(201).json({ _id: id });
  } catch (err) {
    console.error('Insert or index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
