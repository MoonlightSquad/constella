import { STAR_PRODUCTS, TELEGRAM_STARS_CURRENCY, TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS, type StarSku } from '@constella/shared';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

const callTelegramApi = async <T>(method: string, body: Record<string, unknown>): Promise<T> => {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) throw new Error('BOT_TOKEN is not configured.');

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error('Telegram payment service is temporarily unavailable.');
  }

  const result = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !result.ok || result.result === undefined) {
    throw new Error(result.description || `Telegram Bot API ${method} failed.`);
  }
  return result.result;
};

export const createTelegramStarInvoiceLink = (payload: string, sku: StarSku) => {
  const product = STAR_PRODUCTS[sku];
  const body: Record<string, unknown> = {
    title: product.title,
    description: product.benefits[0] ?? product.title,
    payload,
    provider_token: '',
    currency: TELEGRAM_STARS_CURRENCY,
    prices: [{ label: product.title, amount: product.stars }],
  };
  if (product.kind === 'subscription') {
    body.subscription_period = TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS;
  }
  return callTelegramApi<string>('createInvoiceLink', body);
};

export const cancelTelegramStarSubscription = (telegramUserId: number, chargeId: string) =>
  callTelegramApi<boolean>('editUserStarSubscription', {
    user_id: telegramUserId,
    telegram_payment_charge_id: chargeId,
    is_canceled: true,
  });
