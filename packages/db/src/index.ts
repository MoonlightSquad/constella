import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgres://constella:constella_secret_password@localhost:5432/constella';
const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
export * from './schema.js';