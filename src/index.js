import express from 'express';
import { PORT } from './config.js';
import auditRouter from './routes/audit.js';
import logsRouter from './routes/logs.js';
import searchRouter from './routes/search.js';

import { connect as connectMongo, getAuditCollection, getDeadLetterCollection } from './services/mongo.js';
import { initIndex, indexDocument, searchLogs } from './services/elastic.js';
import { initConsumer } from './services/kafka.js';
import { validateEvent } from './routes/validation.js';
async function main() {
  // 1) MongoDB and Elasticsearch setup
  await connectMongo();
  await initIndex();

  // 2) HTTP server setup
  const app = express();
  app.use(express.json());
  app.use('/audit', auditRouter);
  app.use('/logs', logsRouter);
  app.use('/logs/search', searchRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));

  // 3) Kafka consumer for audit-events
  await initConsumer(async ({ message }) => {
    try {
      const event = JSON.parse(message.value.toString());
      delete event._id;

      const { valid, errors } = validateEvent(event);
      if (!valid) {
        await getDeadLetterCollection().insertOne({ error: errors, event, receivedAt: new Date() });
        return;
      }

      const result = await getAuditCollection().insertOne(event);
      const id = result.insertedId.toString();
      const { _id, ...doc } = event;
      await indexDocument(id, doc);
    } catch (err) {
      console.error('Kafka processing error:', err);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


// Old code for reference


// import express from 'express';
// import dotenv from 'dotenv';
// import { MongoClient } from 'mongodb';
// import { Client as ESClient } from '@elastic/elasticsearch';
// import { Kafka } from 'kafkajs';
// import Ajv from "ajv";
// import { readFileSync } from 'fs';
// import { fileURLToPath } from 'url';
// import addFormats from 'ajv-formats';

// // Resolve the JSON file path
// const __dirname = fileURLToPath(new URL('.', import.meta.url));
// const schemaPath = new URL('./schema/auditEvent.json', import.meta.url);

// // Load & parse
// const auditEventSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));


// const ajv = new Ajv({ allErrors: true });
// addFormats(ajv);
// const validateEvent = ajv.compile(auditEventSchema);
// dotenv.config();
// const app = express();
// app.use(express.json());

// const mongoClient = new MongoClient(process.env.MONGODB_URI);
// const esClient = new ESClient({ node: process.env.ES_NODE || 'http://localhost:9200',
//   headers: {
//     accept: 'application/vnd.elasticsearch+json;compatible-with=8'
//   },
//   // turn off sniffing if you haven’t already
//   sniffOnStart: false,
//   sniffOnConnectionFault: false,
//   sniffInterval: false
//   });
// await esClient.cluster.health({ wait_for_status: 'yellow', timeout: '30s' });

// // Initialize Elasticsearch index (ignore if exists)
// await esClient.indices.delete({ index: 'audit-logs' }, { ignore: [404] });
// await esClient.indices.create({
//   index: 'audit-logs',
//   body: {
//     mappings: {
//       properties: {
//         timestamp: { type: 'date' },
//         service:   { type: 'keyword' },
//         eventType: { type: 'keyword' },
//         userId:    { type: 'keyword' },
//         payload:   { type: 'object' }
//       }
//     }
//   }
// });

// async function start() {
//   try {
//     // Connect to MongoDB
//     await mongoClient.connect();
//     const db = mongoClient.db();
//     const auditCollection = db.collection('audit_logs');
//     await db.collection('audit_dead_letters')
//     .createIndex({ receivedAt: 1 }, { expireAfterSeconds: 60*60*24*7 });

    

//     // Kafka consumer for pull-based ingestion
//     const kafka = new Kafka({ brokers: ['localhost:9092'] });
//     const admin = kafka.admin();
//     await admin.connect();

//     await admin.createTopics({
//       topics: [{ topic: 'audit-events', numPartitions: 1, replicationFactor: 1 }],
//       waitForLeaders: true
//     });
//     await admin.disconnect();

//     // Kafka consumer
//     const consumer = kafka.consumer({ groupId: 'audit-service-group' });
//     await consumer.connect();
//     await consumer.subscribe({ topic: 'audit-events', fromBeginning: true });
    

//     await consumer.run({
//       eachMessage: async ({ message }) => {
//         try {
//           const event = JSON.parse(message.value.toString());
//           // Remove any existing _id to avoid duplicate key errors
//           delete event._id;
//           // Validate the event against the schema
//           // If validation fails, write to a dead-letter collection
//           if (!validateEvent(event)) {
//               await db.collection("audit_dead_letters").insertOne({
//               error: validateEvent.errors,
//               event,
//               receivedAt: new Date()
//             });
//             return; // skip indexing
//           }
//           // Insert into MongoDB
//           const result = await auditCollection.insertOne(event);
//           // If the insert was successful, index into Elasticsearch
//           // Create a TTL index on the dead-letter collection
          
//           const id = result.insertedId.toString();
//           const { _id, ...doc } = event;
//           // Index into Elasticsearch
//           try {
//             await esClient.index({
//               index: 'audit-logs',
//               id,
//               document: doc,
//               refresh: 'wait_for'
//             });
//           } catch (esErr) {
//               console.error('ES index failed:', esErr.meta?.body?.error || esErr);
//             }
//         } catch (err) {
//           console.error('Kafka processing error:', err);
//         }
//       }
//     });

//     // POST /audit — ingest and index
//     app.post('/audit', async (req, res) => {
//       const { timestamp, service, eventType, userId, payload } = req.body;
//       if (!timestamp || !service || !eventType || !userId) {
//         return res.status(400).json({ error: 'Missing required fields' });
//       }
//       const valid = validateEvent(req.body);
//       if (!valid) {
//         // write the bad payload + errors to a dead-letter colln
//         await db.collection("audit_dead_letters").insertOne({
//           error: validateEvent.errors,
//           event: req.body,
//           receivedAt: new Date()
//         });
//         return res.status(400).json({ error: "Invalid payload", details: validateEvent.errors });
//       }
//       try {
//         const result = await auditCollection.insertOne(req.body);
//         const id = result.insertedId.toString();
//         const { _id, ...doc } = req.body;
//         try {
//           await esClient.index({
//             index: 'audit-logs',
//             id,
//             document: doc,
//             refresh: 'wait_for'
//           });
//         } catch (error) {
//           console.error('Elasticsearch indexing error:', error);
//         }
//         return res.status(201).json({ _id: id });
//       } catch (error) {
//         console.error('Insert error:', error);
//         return res.status(500).json({ error: 'Internal server error' });
//       }
//     });

//     // GET /logs — fetch paginated, filtered events from MongoDB
//     app.get('/logs', async (req, res) => {
//       const { service, eventType, start, end, page = 1, limit = 20 } = req.query;
//       const filter = {};
//       if (service) filter.service = service;
//       if (eventType) filter.eventType = eventType;
//       if (start || end) {
//         filter.timestamp = {};
//         if (start) filter.timestamp.$gte = new Date(start);
//         if (end) filter.timestamp.$lte = new Date(end);
//       }
//       const pageNum = Math.max(1, parseInt(page, 10));
//       const pageSize = Math.max(1, parseInt(limit, 10));
//       const skip = (pageNum - 1) * pageSize;
//       try {
//         const total = await auditCollection.countDocuments(filter);
//         const logs = await auditCollection
//           .find(filter)
//           .sort({ timestamp: -1 })
//           .skip(skip)
//           .limit(pageSize)
//           .toArray();
//         return res.json({ page: pageNum, limit: pageSize, total, logs });
//       } catch (error) {
//         console.error('Query error:', error);
//         return res.status(500).json({ error: 'Internal server error' });
//       }
//     });

//     // GET /logs/search — full-text search via Elasticsearch
//     app.get('/logs/search', async (req, res) => {
//       const { q, service, eventType, start, end, page = 1, limit = 20 } = req.query;
//       const must = [];
//       if (q) {
//         must.push({
//           multi_match: {
//             query: q,
//             fields: ['service', 'eventType', 'payload'],
//             fuzziness: 'AUTO'
//           }
//         });
//       }
//       if (service) must.push({ term: { service } });
//       if (eventType) must.push({ term: { eventType } });
//       if (start || end) {
//         const range = {};
//         if (start) range.gte = start;
//         if (end) range.lte = end;
//         must.push({ range: { timestamp: range } });
//       }
//       const pageNum = Math.max(1, parseInt(page, 10));
//       const pageSize = Math.max(1, parseInt(limit, 10));
//       const from = (pageNum - 1) * pageSize;
//       try {
//         const result = await esClient.search({
//           index: 'audit-logs',
//           from,
//           size: pageSize,
//           sort: [{ timestamp: 'desc' }],
//           body: { query: { bool: { must } } }
//         });
        
//         const searchBody = result.body ?? result;               // support both styles
//         if (!searchBody.hits) {
//           console.error('Bad ES response:', result);
//           return res.status(500).json({ error: 'Invalid search response' });
//         }
//         const total = searchBody.hits.total.value;
//         const logs  = searchBody.hits.hits.map(h => h._source);
//         return res.json({ page: pageNum, limit: pageSize, total, logs });

//       } catch (error) {
//         console.error('Search error:', error);
//         return res.status(500).json({ error: 'Internal server error' });
//       }
//     });

//     // GET /health — liveness check
//     app.get('/health', (_req, res) => res.json({ status: 'ok' }));

//     // Start server
//     const PORT = process.env.PORT || 3000;
//     app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
//   } catch (error) {
//     console.error('Failed to start service:', error);
//     process.exit(1);
//   }
// }

// start();
