import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();
const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
async function start() {
  try {
    await client.connect();
    const auditCollection = client.db().collection('audit_logs');
    
    // Ingestion route
    app.post('/audit', async (req, res) => {
      const { timestamp, service, eventType, userId, payload } = req.body;

      // Basic required-field check
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

    // Existing health-check
    app.get('/health', (_req, res) => res.send({ status: 'ok' }));

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start', err);
    process.exit(1);
  }
}

start();
