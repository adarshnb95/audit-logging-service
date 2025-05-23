import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const MONGO_URI = process.env.MONGODB_URI;
export const ES_NODE   = process.env.ES_NODE;
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
