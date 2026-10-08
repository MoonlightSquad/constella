import { z } from 'zod';

export const supportMessageSchema = z.string().trim().min(1).max(5000);
export const supportCreateSchema = z.object({
  subject: z.string().trim().min(5).max(120),
  category: z.enum(['general', 'account', 'billing', 'safety', 'technical']).default('general'),
  message: supportMessageSchema,
});
export const supportTicketIdSchema = z.object({ ticketId: z.string().uuid() });
export const supportReplySchema = supportTicketIdSchema.extend({ body: supportMessageSchema });
export const supportQueueSchema = z.object({
  status: z.enum(['all', 'open', 'in_progress', 'waiting_user', 'resolved', 'closed']).default('open'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export const adminSupportReplySchema = supportTicketIdSchema.extend({
  body: supportMessageSchema,
  status: z.enum(['in_progress', 'waiting_user', 'resolved', 'closed']).default('waiting_user'),
});
