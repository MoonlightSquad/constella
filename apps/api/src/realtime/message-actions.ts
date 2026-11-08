import { and, eq } from 'drizzle-orm';
import { messages } from '@constella/db';

type MessageAction = {
  type: 'send.linked' | 'send.pin';
  messageId: number;
  matchId: string;
  userId: string;
  body: string;
};

const parseObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

export const updateChatMessageFromSocket = async (db: any, action: MessageAction) => {
  if (action.type === 'send.linked') {
    const [updated] = await db
      .update(messages)
      .set({ body: action.body })
      .where(and(
        eq(messages.id, action.messageId),
        eq(messages.matchId, action.matchId),
        eq(messages.senderId, action.userId),
      ))
      .returning();
    return updated ?? null;
  }

  const [existing] = await db
    .select({ body: messages.body })
    .from(messages)
    .where(and(eq(messages.id, action.messageId), eq(messages.matchId, action.matchId)))
    .limit(1);
  if (!existing) return null;

  const body = parseObject(existing.body);
  if (!body) return null;
  const [updated] = await db
    .update(messages)
    .set({ body: JSON.stringify({ ...body, pinned: true }) })
    .where(and(
      eq(messages.id, action.messageId),
      eq(messages.matchId, action.matchId),
      eq(messages.body, existing.body),
    ))
    .returning();
  return updated ?? null;
};
