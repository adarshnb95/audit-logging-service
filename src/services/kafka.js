import { Kafka } from 'kafkajs';
import { KAFKA_BROKERS } from '../config.js';

const kafka = new Kafka({ brokers: KAFKA_BROKERS });

export async function initConsumer(onMessage) {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({ topics: [{ topic: 'audit-events', numPartitions: 1, replicationFactor: 1 }] });
  await admin.disconnect();

  const consumer = kafka.consumer({ groupId: 'audit-service-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'audit-events', fromBeginning: true });
  await consumer.run({ eachMessage: onMessage });
  return consumer;
}
