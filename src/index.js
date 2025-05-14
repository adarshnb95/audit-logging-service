import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();
const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

async function start() {
  try {
    // Connect to MongoDB
    await client.connect();
    const db = client.db(); // uses the default database from the URI
    const auditCollection = db.collection('audit_logs');

    // Ingest audit events
    app.post('/audit', async (req, res) => {
      const { timestamp, service, eventType, userId, payload } = req.body;
      if (!timestamp || !service || !eventType || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      try {
        const result = await auditCollection.insertOne(req.body);
        return res.status(201).json({ _id: result.insertedId });
      } catch (err) {
        console.error('Insert error', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Query stored events with pagination & filters
    app.get('/logs', async (req, res) => {
      const { service, eventType, start, end, page = 1, limit = 20 } = req.query;

      // Build filter
      const filter = {};
      if (service)    filter.service    = service;
      if (eventType)  filter.eventType  = eventType;
      if (start || end) {
        filter.timestamp = {};
        if (start) filter.timestamp.$gte = new Date(start);
        if (end)   filter.timestamp.$lte = new Date(end);
      }

      // Pagination
      const pageNum  = parseInt(page,  10);
      const pageSize = parseInt(limit, 10);
      const skip     = (pageNum - 1) * pageSize;

      try {
        const total = await auditCollection.countDocuments(filter);
        const logs  = await auditCollection
          .find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();

        return res.json({ page: pageNum, limit: pageSize, total, logs });
      } catch (err) {
        console.error('Query error', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Health-check endpoint
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Start listening
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Listening on port ${PORT}`);
    });

  } catch (err) {
    console.error('Failed to start', err);
    process.exit(1);
  }
}

start();