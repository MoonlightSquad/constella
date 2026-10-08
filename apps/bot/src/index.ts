import dns from 'node:dns';
import { resolve } from 'node:path';
import { Bot, InlineKeyboard } from 'grammy';
import * as dotenv from 'dotenv';
import { createLogger } from '@constella/shared';

// 🔧 Примусово використовуємо IPv4 першим (виправляє ETIMEDOUT у WSL2)
dns.setDefaultResultOrder('ipv4first');

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const logger = createLogger('bot');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;
const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const PAYMENTS_INTERNAL_TOKEN = process.env.PAYMENTS_INTERNAL_TOKEN;

if (!BOT_TOKEN) {
  logger.error('BOT_TOKEN is missing in .env');
  process.exit(1);
}

if (!WEB_APP_URL) {
  logger.error('WEB_APP_URL is missing in .env');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && (!PAYMENTS_INTERNAL_TOKEN || PAYMENTS_INTERNAL_TOKEN.length < 32)) {
  logger.error('PAYMENTS_INTERNAL_TOKEN must contain at least 32 characters in production.');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

const appKeyboard = () => new InlineKeyboard().webApp('Відкрити Constella', WEB_APP_URL);

const postPaymentEvent = async (path: string, body: unknown) => {
  if (!PAYMENTS_INTERNAL_TOKEN || PAYMENTS_INTERNAL_TOKEN.length < 32) {
    throw new Error('PAYMENTS_INTERNAL_TOKEN is not configured.');
  }
  const response = await fetch(`${API_INTERNAL_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-payments-token': PAYMENTS_INTERNAL_TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Payments API returned ${response.status}.`);
  return response.json() as Promise<{ ok?: boolean; errorMessage?: string }>;
};

bot.command('start', async (ctx) => {
  await ctx.reply(
    `Вітаю, ${ctx.from?.first_name || 'мандрівнику'}! Твоє сузір’я знайомств починається тут.`,
    { reply_markup: appKeyboard() }
  );
});

bot.command('orbit', async (ctx) => {
  await ctx.reply('Відкрий Mini App, щоб переглянути свою сьогоднішню орбіту.', {
    reply_markup: appKeyboard(),
  });
});

bot.command('premium', async (ctx) => {
  await ctx.reply('Constella VIP та покупки за Telegram Stars доступні у застосунку.', { reply_markup: appKeyboard() });
});

bot.command('balance', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  try {
    const response = await fetch(`${API_INTERNAL_URL}/internal/users/${telegramId}/status`, {
      headers: { 'x-payments-token': PAYMENTS_INTERNAL_TOKEN || '' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Payments API returned ${response.status}.`);
    const status = await response.json() as { linked: boolean; vip?: boolean; expiresAt?: string | null; superlikeBalance?: number; streak?: number; freezes?: number };
    if (!status.linked) {
      await ctx.reply('Спочатку відкрий Constella в Telegram, щоб прив’язати свій профіль.', { reply_markup: appKeyboard() });
      return;
    }
    const vip = status.vip ? `VIP активний до ${status.expiresAt ? new Date(status.expiresAt).toLocaleDateString('uk-UA') : 'скасування'}` : 'VIP не активний';
    await ctx.reply(`${vip}\nСуперлайки: ${status.superlikeBalance ?? 0} ⭐\nСтрік: ${status.streak ?? 0} дн.\nЗахист стріку: ${status.freezes ?? 0}`);
  } catch (error) {
    logger.warn('Could not load account balance', { message: error instanceof Error ? error.message : 'Unknown error' });
    await ctx.reply('Не вдалося отримати баланс. Спробуй трохи пізніше.');
  }
});

bot.on('pre_checkout_query', async (ctx) => {
  const query = ctx.preCheckoutQuery;
  try {
    const result = await postPaymentEvent('/internal/payments/pre-checkout', {
      invoicePayload: query.invoice_payload,
      telegramUserId: query.from.id,
      currency: query.currency,
      totalAmount: query.total_amount,
    });
    if (!result.ok) {
      await ctx.answerPreCheckoutQuery(false, result.errorMessage || 'Рахунок недійсний або застарів.');
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    logger.error('Could not validate Stars checkout', { message: error instanceof Error ? error.message : 'Unknown error' });
    await ctx.answerPreCheckoutQuery(false, 'Не вдалося перевірити оплату. Створи новий рахунок у Constella.');
  }
});

bot.on('message:successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  try {
    await postPaymentEvent('/internal/payments/successful-payment', {
      invoicePayload: payment.invoice_payload,
      telegramUserId: ctx.from.id,
      currency: payment.currency,
      totalAmount: payment.total_amount,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      providerPaymentChargeId: payment.provider_payment_charge_id,
      isRecurring: payment.is_recurring,
      isFirstRecurring: payment.is_first_recurring,
      subscriptionExpirationDate: payment.subscription_expiration_date,
    });
  } catch (error) {
    logger.error('Could not record successful Stars payment', { message: error instanceof Error ? error.message : 'Unknown error' });
    await ctx.reply('Оплату отримано, але її підтвердження затримується. Не повторюй платіж; звернись у підтримку.');
  }
});

bot.command('profile', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  try {
    const response = await fetch(`${API_INTERNAL_URL}/internal/users/${telegramId}/status`, {
      headers: { 'x-payments-token': PAYMENTS_INTERNAL_TOKEN || '' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Payments API returned ${response.status}.`);
    const status = (await response.json()) as {
      linked: boolean;
      vip?: boolean;
      expiresAt?: string | null;
      superlikeBalance?: number;
      streak?: number;
      freezes?: number;
    };
    if (!status.linked) {
      await ctx.reply('Твій профіль ще не налаштований. Відкрий Constella, щоб почати знайомства!', {
        reply_markup: appKeyboard(),
      });
      return;
    }
    const vipText = status.vip ? '🌟 VIP статус активний' : 'Базовий акаунт';
    await ctx.reply(
      `👤 Твій профіль у Constella\n\nСтатус: ${vipText}\n🔥 Стрік активності: ${status.streak ?? 0} дн.\n❄️ Захист стріку: ${status.freezes ?? 0}\n⭐ Суперлайки: ${status.superlikeBalance ?? 0}`,
      { reply_markup: appKeyboard() }
    );
  } catch (error) {
    logger.warn('Could not load profile info', { message: error instanceof Error ? error.message : 'Unknown error' });
    await ctx.reply('Відкрий застосунок Constella для перегляду та редагування анкети.', {
      reply_markup: appKeyboard(),
    });
  }
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `✨ Доступні команди Constella:\n\n/start — Головне меню та запуск Mini App\n/profile — Твій профіль і статус\n/balance — Баланс зірок, стрік та бонуси\n/orbit — Щоденна орбіта рекомендацій\n/premium — VIP статус та підписки\n/support — Підтримка користувачів`,
    { reply_markup: appKeyboard() }
  );
});

bot.command('support', async (ctx) => {
  await ctx.reply('Якщо виникла проблема, напиши команді підтримки або скористайся блокуванням і скаргою в Mini App.');
});

bot.catch((err) => {
  logger.error(`Error handling update ${err.ctx.update.update_id}:`, { error: err.error });
});

const bootstrap = async () => {
  try {
    // Не блокуємо запуск бота, якщо setChatMenuButton не пройшов через тимчасові мережеві збої
    await bot.api
      .setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: 'Constella',
          web_app: { url: WEB_APP_URL },
        },
      })
      .catch((err) => logger.warn('Could not set Menu Button', { message: err.message }));

    await bot.start({
      onStart: (botInfo) => {
        logger.info(`Telegram Bot @${botInfo.username} started successfully`);
      },
    });
  } catch (err) {
    logger.error('Failed to launch bot', { error: err });
    process.exit(1);
  }
};

bootstrap();

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());