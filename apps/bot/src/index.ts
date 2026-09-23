import dns from 'node:dns';
import { Bot, InlineKeyboard } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 🔧 Примусово використовуємо IPv4 першим (виправляє ETIMEDOUT у WSL2)
dns.setDefaultResultOrder('ipv4first');

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN is missing in .env');
  process.exit(1);
}

if (!WEB_APP_URL) {
  console.error('❌ Error: WEB_APP_URL is missing in .env');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Відкрити Constella 🚀', WEB_APP_URL);

  await ctx.reply(
    `Вітаю, <b>${ctx.from?.first_name || 'мандрівнику'}</b>! ✨\n\nЯ — твій провідник у Constella. Натисни кнопку нижче, щоб запустити додаток:`,
    {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    }
  );
});

bot.catch((err) => {
  console.error(`❌ Error handling update ${err.ctx.update.update_id}:`, err.error);
});

const bootstrap = async () => {
  try {
    // Не блокуємо запуск бота, якщо setChatMenuButton не пройшов через тимчасові мережеві збої
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Constella',
        web_app: { url: WEB_APP_URL },
      },
    }).catch((err) => console.warn('⚠️ Could not set Menu Button:', err.message));

    await bot.start({
      onStart: (botInfo) => {
        console.log(`🤖 Telegram Bot @${botInfo.username} started successfully!`);
      },
    });
  } catch (err) {
    console.error('❌ Failed to launch bot:', err);
    process.exit(1);
  }
};

bootstrap();

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());