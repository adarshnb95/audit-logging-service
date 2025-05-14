import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { Client as ESClient } from '@elastic/elasticsearch';

dotenv.config();
const app = express();
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGODB_URI);
const esClient = new ESClient({ node: process.env.ES_NODE || 'http://localhost:9200' });

async function start() {
  try {
    // Connect to MongoDB
    await mongoClient.connect();
    const db = mongoClient.db();
    const auditCollection = db.collection('audit_logs');

    // Initialize Elasticsearch index (ignore if it exists)
    await esClient.indices.create(
      { index: 'audit-logs' },
      { ignore: [400] }
    );

    // POST /audit — ingest and index
    app.post('/audit', async (req, res) => {
      const { timestamp, service, eventType, userId, payload } = req.body;
      if (!timestamp || !service || !eventType || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      try {
        // Write to MongoDB
        const result = await auditCollection.insertOne(req.body);
        const id = result.insertedId.toString();

        // Write to Elasticsearch
        try {
          await esClient.index({
            index: 'audit-logs',
            id,
            document: req.body
          });
        } catch (err) {
          console.error('Elasticsearch indexing error:', err);
        }

        return res.status(201).json({ _id: id });
      } catch (err) {
        console.error('Insert error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /logs — fetch paginated, filtered audit events
    app.get('/logs', async (req, res) => {
      const { service, eventType, start, end, page = 1, limit = 20 } = req.query;

      const filter = {};
      if (service) filter.service = service;
      if (eventType) filter.eventType = eventType;
      if (start || end) {
        filter.timestamp = {};
        if (start) filter.timestamp.$gte = new Date(start);
        if (end) filter.timestamp.$lte = new Date(end);
      }

      const pageNum = Math.max(1, parseInt(page, 10));
      const pageSize = Math.max(1, parseInt(limit, 10));
      const skip = (pageNum - 1) * pageSize;

      try {
        const total = await auditCollection.countDocuments(filter);
        const logs = await auditCollection
          .find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();

        return res.json({ page: pageNum, limit: pageSize, total, logs });
      } catch (err) {
        console.error('Query error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /health — liveness check
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start service:', err);
    process.exit(1);
  }
}

start();