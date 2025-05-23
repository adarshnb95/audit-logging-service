import { MongoClient } from 'mongodb';
import { MONGO_URI } from '../config.js';

const client = new MongoClient(MONGO_URI);
let db;

export async function connect() {
  if (!db) {
    await client.connect();
    db = client.db();
    // ensure TTL index
    await db.collection('audit_dead_letters')
      .createIndex({ receivedAt: 1 }, { expireAfterSeconds: 7*24*3600 });
  }
  return db;
}

export function getAuditCollection() {
  return db.collection('audit_logs');
}

export function getDeadLetterCollection() {
  return db.collection('audit_dead_letters');
}
