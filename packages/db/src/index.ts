import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import * as schema from './schema.js';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be configured before importing @constella/db.');
}
const poolSize = Number.parseInt(process.env.DB_POOL_SIZE ?? "10", 10);
if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 100) {
  throw new Error("DB_POOL_SIZE must be an integer between 1 and 100.");
}

const queryClient = postgres(connectionString, {
  max: poolSize,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
});

export const db = drizzle(queryClient, { schema });

export const closeDb = () => queryClient.end({ timeout: 5 });
export * from './schema.js';
