import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .max(254)
  .transform((email) => email.toLowerCase());

const passwordSchema = z.string().min(12, 'Password must be at least 12 characters.').max(72);

export const WebRegisterSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const WebLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

export type WebRegisterInput = z.infer<typeof WebRegisterSchema>;
export type WebLoginInput = z.infer<typeof WebLoginSchema>;

export const WebPasswordResetSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export const AuthTokenSchema = z.object({
  token: z.string().min(32).max(256),
});
