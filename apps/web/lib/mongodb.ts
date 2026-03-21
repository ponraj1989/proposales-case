import mongoose from 'mongoose';
import { attachDatabasePool } from '@vercel/functions';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/proposales';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  poolAttached: boolean;
}

// Use global to preserve connection across hot reloads in dev
const globalWithMongoose = globalThis as typeof globalThis & { mongoose?: MongooseCache };

const cached: MongooseCache = globalWithMongoose.mongoose || { conn: null, promise: null, poolAttached: false };
if (!globalWithMongoose.mongoose) {
  globalWithMongoose.mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }).then((m) => {
      // Attach the underlying MongoClient pool for Vercel Functions optimization
      if (!cached.poolAttached) {
        attachDatabasePool(m.connection.getClient());
        cached.poolAttached = true;
      }
      return m;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
