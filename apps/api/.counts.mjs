import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
const { db } = await import('@constella/db');
const { sql } = await import('drizzle-orm');
for (const t of ['reports', 'photo_assets', 'payments', 'support_tickets', 'blog_post', 'blog_posts', 'blog_translation', 'users', 'admin_audit_logs']) {
  const r = await db.execute(sql.raw(`select count(*)::int as n from "${t}"`)).catch(() => null);
  console.log(t.padEnd(18), r?.[0]?.n ?? 'no such table');
}
process.exit(0);
