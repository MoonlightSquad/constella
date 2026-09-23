import { z } from 'zod';

export const TelegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  photo_url: z.string().optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

export const TelegramInitDataSchema = z.object({
  query_id: z.string().optional(),
  user: TelegramUserSchema.optional(),
  auth_date: z.number().optional(),
  hash: z.string(),
});

export type TelegramInitData = z.infer<typeof TelegramInitDataSchema>;

export const AuthRequestSchema = z.object({
  initData: z.string().min(1, "initData is required"),
});

export type AuthRequest = z.infer<typeof AuthRequestSchema>;