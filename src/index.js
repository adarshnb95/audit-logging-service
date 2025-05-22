import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { Client as ESClient } from '@elastic/elasticsearch';
import { Kafka } from 'kafkajs';
import Ajv from "ajv";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Resolve the JSON file path
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const schemaPath = new URL('./schema/auditEvent.json', import.meta.url);

// Load & parse
const auditEventSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));


const ajv = new Ajv({ allErrors: true });
const validateEvent = ajv.compile(auditEventSchema);
dotenv.config();
const app = express();
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGODB_URI);
const esClient = new ESClient({ node: process.env.ES_NODE || 'http://localhost:9200',
  headers: {
    accept: 'application/vnd.elasticsearch+json;compatible-with=8'
  },
  // turn off sniffing if you haven’t already
  sniffOnStart: false,
  sniffOnConnectionFault: false,
  sniffInterval: false
  });

async function start() {
  try {
    // Connect to MongoDB
    await mongoClient.connect();
    const db = mongoClient.db();
    const auditCollection = db.collection('audit_logs');

    // Initialize Elasticsearch index (ignore if exists)
    await esClient.indices.create(
      { index: 'audit-logs' },
      { ignore: [400] }
    );

    // Kafka consumer for pull-based ingestion
    const kafka = new Kafka({ brokers: ['localhost:9092'] });
    const admin = kafka.admin();
    await admin.connect();

    await admin.createTopics({
      topics: [{ topic: 'audit-events', numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true
    });
    await admin.disconnect();

    // Kafka consumer
    const consumer = kafka.consumer({ groupId: 'audit-service-group' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'audit-events', fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          // Remove any existing _id to avoid duplicate key errors
          delete event._id;
          // Validate the event against the schema
          // If validation fails, write to a dead-letter collection
          if (!validateEvent(event)) {
            await auditCollection.db.collection("audit_dead_letters").insertOne({
              error: validateEvent.errors,
              event,
              receivedAt: new Date()
            });
            return; // skip indexing
          }
          // Insert into MongoDB
          const result = await auditCollection.insertOne(event);
          // If the insert was successful, index into Elasticsearch
          // Create a TTL index on the dead-letter collection
          await db.collection("audit_dead_letters").createIndex(
            { receivedAt: 1 },
            { expireAfterSeconds: 60 * 60 * 24 * 7 } // one week
          );
          const id = result.insertedId.toString();
          // Index into Elasticsearch
          await esClient.index({
            index: 'audit-logs',
            id,
            document: event
          });
        } catch (err) {
          console.error('Kafka processing error:', err);
        }
      }
    });

    // POST /audit — ingest and index
    app.post('/audit', async (req, res) => {
      const { timestamp, service, eventType, userId, payload } = req.body;
      if (!timestamp || !service || !eventType || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const valid = validateEvent(req.body);
      if (!valid) {
        // write the bad payload + errors to a dead-letter colln
        await db.collection("audit_dead_letters").insertOne({
          error: validateEvent.errors,
          event: req.body,
          receivedAt: new Date()
        });
        return res.status(400).json({ error: "Invalid payload", details: validateEvent.errors });
      }
      try {
        const result = await auditCollection.insertOne(req.body);
        const id = result.insertedId.toString();
        try {
          await esClient.index({
            index: 'audit-logs',
            id,
            document: req.body
          });
        } catch (error) {
          console.error('Elasticsearch indexing error:', error);
        }
        return res.status(201).json({ _id: id });
      } catch (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /logs — fetch paginated, filtered events from MongoDB
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
      } catch (error) {
        console.error('Query error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /logs/search — full-text search via Elasticsearch
    app.get('/logs/search', async (req, res) => {
      const { q, service, eventType, start, end, page = 1, limit = 20 } = req.query;
      const must = [];
      if (q) {
        must.push({
          multi_match: {
            query: q,
            fields: ['service', 'eventType', 'payload'],
            fuzziness: 'AUTO'
          }
        });
      }
      if (service) must.push({ term: { service } });
      if (eventType) must.push({ term: { eventType } });
      if (start || end) {
        const range = {};
        if (start) range.gte = start;
        if (end) range.lte = end;
        must.push({ range: { timestamp: range } });
      }
      const pageNum = Math.max(1, parseInt(page, 10));
      const pageSize = Math.max(1, parseInt(limit, 10));
      const from = (pageNum - 1) * pageSize;
      try {
        const body = await esClient.search({
          index: 'audit-logs',
          from,
          size: pageSize,
          sort: [{ timestamp: 'desc' }],
          body: { query: { bool: { must } } }
        });
        const total = body.hits.total.value;
        const logs = body.hits.hits.map(hit => hit._source);
        return res.json({ page: pageNum, limit: pageSize, total, logs });
      } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /health — liveness check
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

start();
