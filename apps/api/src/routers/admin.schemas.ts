import { z } from 'zod';

export const grantVipSchema = z.object({
  userId: z.string().uuid(),
  days: z.number().int().min(1).max(365).default(30),
  reason: z.string().trim().min(8).max(500),
});
