import { z } from 'zod';

export const TELEGRAM_STARS_CURRENCY = 'XTR' as const;
export const TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS = 2_592_000;
export const FREE_DAILY_LIKES = 20;
export const XP_PER_LEVEL = 250;

export const STAR_PRODUCTS = {
  vip: {
    id: 'vip',
    kind: 'subscription' as const,
    title: 'Constella VIP',
    stars: 499,
    benefits: [
      'Who liked you',
      'Unlimited swipes',
      'Rewind last pass',
      'Incognito mode',
      'Passport / change location',
    ],
  },
  boost: {
    id: 'boost',
    kind: 'consumable' as const,
    title: 'Profile Boost',
    stars: 100,
    benefits: ['First place in your region for 30 minutes'],
  },
  superlike: {
    id: 'superlike',
    kind: 'consumable' as const,
    title: 'Superlike',
    stars: 25,
    benefits: ['Stand out first and attach a note to the match'],
  },
  freeze: {
    id: 'freeze',
    kind: 'consumable' as const,
    title: 'Streak Freeze',
    stars: 15,
    benefits: ['Protect your daily streak for one missed day'],
  },
  gift_rose: {
    id: 'gift_rose',
    kind: 'gift' as const,
    title: 'Anonymous Rose',
    stars: 50,
    benefits: ['Send a rose to any profile'],
  },
  gift_star: {
    id: 'gift_star',
    kind: 'gift' as const,
    title: 'Anonymous Star',
    stars: 150,
    benefits: ['Send a star to any profile'],
  },
  gift_constellation: {
    id: 'gift_constellation',
    kind: 'gift' as const,
    title: 'Anonymous Constellation',
    stars: 500,
    benefits: ['Send a constellation to any profile'],
  },
} as const;

export type StarSku = keyof typeof STAR_PRODUCTS;

export const PREMIUM_PLANS = {
  vip: {
    id: 'vip' as const,
    title: STAR_PRODUCTS.vip.title,
    stars: STAR_PRODUCTS.vip.stars,
    benefits: STAR_PRODUCTS.vip.benefits,
  },
  plus: {
    id: 'plus' as const,
    title: STAR_PRODUCTS.vip.title,
    stars: STAR_PRODUCTS.vip.stars,
    benefits: STAR_PRODUCTS.vip.benefits,
  },
  prime: {
    id: 'prime' as const,
    title: STAR_PRODUCTS.vip.title,
    stars: STAR_PRODUCTS.vip.stars,
    benefits: STAR_PRODUCTS.vip.benefits,
  },
} as const;

export const StarSkuSchema = z.enum([
  'vip',
  'boost',
  'superlike',
  'freeze',
  'gift_rose',
  'gift_star',
  'gift_constellation',
]);
export const PremiumPlanSchema = z.enum(['vip', 'plus', 'prime']);
export type PremiumPlan = z.infer<typeof PremiumPlanSchema>;

export const CreateStarInvoiceSchema = z.object({
  sku: StarSkuSchema,
  giftToUserId: z.string().uuid().optional(),
  note: z.string().trim().max(180).optional(),
});

export const PreCheckoutSchema = z.object({
  invoicePayload: z.string().uuid(),
  telegramUserId: z.number().int().positive(),
  currency: z.literal(TELEGRAM_STARS_CURRENCY),
  totalAmount: z.number().int().positive(),
});

export const SuccessfulStarPaymentSchema = PreCheckoutSchema.extend({
  telegramPaymentChargeId: z.string().min(1).max(256),
  providerPaymentChargeId: z.string().max(256).default(''),
  isRecurring: z.boolean().default(false),
  isFirstRecurring: z.boolean().default(false),
  subscriptionExpirationDate: z.number().int().positive().optional(),
});

export const isVipPlan = (plan?: string | null) => plan === 'vip' || plan === 'plus' || plan === 'prime';
