import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { adminAuditLogs, supportMessages, supportTickets, users } from '@constella/db';
import { adminSupportReplySchema, supportCreateSchema, supportQueueSchema, supportReplySchema, supportTicketIdSchema } from './support.schemas.js';
import { adminProcedure, protectedProcedure, router } from '../trpc.js';

const ticketSummary = {
  id: supportTickets.id, subject: supportTickets.subject, category: supportTickets.category,
  status: supportTickets.status, priority: supportTickets.priority,
  createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt, closedAt: supportTickets.closedAt,
};

export const supportRouter = router({
  create: protectedProcedure.input(supportCreateSchema).mutation(async ({ ctx, input }) => ctx.db.transaction(async (tx: any) => {
    const [ticket] = await tx.insert(supportTickets).values({
      userId: ctx.user.id, subject: input.subject, category: input.category,
    }).returning(ticketSummary);
    await tx.insert(supportMessages).values({
      ticketId: ticket.id, authorUserId: ctx.user.id, authorRole: 'user', body: input.message,
    });
    return ticket;
  })),

  mine: protectedProcedure.query(async ({ ctx }) => ctx.db.select(ticketSummary)
    .from(supportTickets).where(eq(supportTickets.userId, ctx.user.id))
    .orderBy(desc(supportTickets.updatedAt)).limit(100)),

  thread: protectedProcedure.input(supportTicketIdSchema.strip()).query(async ({ ctx, input }) => {
    const [ticket] = await ctx.db.select(ticketSummary).from(supportTickets)
      .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.userId, ctx.user.id))).limit(1);
    if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found.' });
    const messages = await ctx.db.select({
      id: supportMessages.id, authorRole: supportMessages.authorRole, body: supportMessages.body,
      createdAt: supportMessages.createdAt,
    }).from(supportMessages).where(eq(supportMessages.ticketId, ticket.id)).orderBy(supportMessages.createdAt);
    return { ticket, messages };
  }),

  reply: protectedProcedure.input(supportReplySchema)
    .mutation(async ({ ctx, input }) => ctx.db.transaction(async (tx: any) => {
      const [ticket] = await tx.select().from(supportTickets).where(and(
        eq(supportTickets.id, input.ticketId), eq(supportTickets.userId, ctx.user.id),
      )).limit(1);
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found.' });
      if (ticket.status === 'closed') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This ticket is closed.' });
      await tx.insert(supportMessages).values({ ticketId: ticket.id, authorUserId: ctx.user.id, authorRole: 'user', body: input.body });
      await tx.update(supportTickets).set({
        status: ticket.status === 'resolved' ? 'open' : 'in_progress', updatedAt: new Date(), closedAt: null,
      }).where(eq(supportTickets.id, ticket.id));
      return { ok: true };
    })),

  close: protectedProcedure.input(supportTicketIdSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.update(supportTickets).set({
      status: 'closed', closedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.userId, ctx.user.id))).returning({ id: supportTickets.id });
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found.' });
    return { ok: true };
  }),

  adminQueue: adminProcedure.input(supportQueueSchema).query(async ({ ctx, input }) => ctx.db.select({
    ...ticketSummary, userId: supportTickets.userId, displayName: users.displayName,
  }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId))
    .where(input.status === 'all' ? undefined : eq(supportTickets.status, input.status))
    .orderBy(sql`CASE WHEN ${supportTickets.priority} = 'high' THEN 0 ELSE 1 END`, desc(supportTickets.updatedAt))
    .limit(input.limit).offset(input.offset)),

  adminThread: adminProcedure.input(supportTicketIdSchema).query(async ({ ctx, input }) => {
    const [ticket] = await ctx.db.select({
      ...ticketSummary, userId: supportTickets.userId, displayName: users.displayName,
    }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId))
      .where(eq(supportTickets.id, input.ticketId)).limit(1);
    if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found.' });
    const messages = await ctx.db.select({
      id: supportMessages.id, authorRole: supportMessages.authorRole, body: supportMessages.body,
      createdAt: supportMessages.createdAt,
    }).from(supportMessages).where(eq(supportMessages.ticketId, ticket.id)).orderBy(supportMessages.createdAt);
    return { ticket, messages };
  }),

  adminReply: adminProcedure.input(adminSupportReplySchema).mutation(async ({ ctx, input }) => ctx.db.transaction(async (tx: any) => {
    const [ticket] = await tx.select({ id: supportTickets.id }).from(supportTickets)
      .where(eq(supportTickets.id, input.ticketId)).limit(1);
    if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found.' });
    await tx.insert(supportMessages).values({
      ticketId: ticket.id, authorUserId: ctx.user.id, authorRole: 'support', body: input.body,
    });
    await tx.update(supportTickets).set({
      status: input.status, assignedToUserId: ctx.user.id, updatedAt: new Date(),
      closedAt: input.status === 'closed' ? new Date() : null,
    }).where(eq(supportTickets.id, ticket.id));
    await tx.insert(adminAuditLogs).values({
      actorUserId: ctx.user.id, targetUserId: null, action: 'support.reply',
      reason: null, metadata: { ticketId: ticket.id, status: input.status },
    });
    return { ok: true };
  })),
});
