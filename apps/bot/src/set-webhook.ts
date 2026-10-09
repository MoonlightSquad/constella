import { Bot } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

let botToken = process.env.BOT_TOKEN;
let rawWebAppUrl = process.env.WEB_APP_URL || process.env.NUXT_PUBLIC_APP_URL;
let rawWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

// Optional fallback to constella.deploy.config.json
const rootConfigPath = resolve(process.cwd(), '../../constella.deploy.config.json');
if (existsSync(rootConfigPath)) {
  try {
    const config = JSON.parse(readFileSync(rootConfigPath, 'utf8'));
    if (!botToken || botToken.includes('YOUR_')) {
      botToken = config.telegram?.bot_token;
    }
    if (!rawWebAppUrl || rawWebAppUrl.includes('YOUR_')) {
      rawWebAppUrl = config.urls?.app_url || config.urls?.frontend_web_app_url;
    }
    if (!rawWebhookUrl || rawWebhookUrl.includes('YOUR_')) {
      const apiUrl = config.domains?.api_url;
      if (apiUrl && !apiUrl.includes('YOUR_')) rawWebhookUrl = `${apiUrl.replace(/\/$/, '')}/telegram/webhook`;
    }
  } catch {
    // ignore json read errors
  }
}

if (!botToken || botToken.includes('YOUR_')) {
  console.error('❌ BOT_TOKEN is missing or contains placeholder. Please set a valid Telegram bot token from @BotFather.');
  process.exit(1);
}

if (!rawWebAppUrl || rawWebAppUrl.includes('YOUR_')) {
  console.error('❌ WEB_APP_URL (or NUXT_PUBLIC_APP_URL) is missing or contains placeholder.');
  process.exit(1);
}

if (!rawWebhookUrl || rawWebhookUrl.includes('YOUR_')) {
  console.error('❌ TELEGRAM_WEBHOOK_URL is missing or contains placeholder.');
  process.exit(1);
}

if (!webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)) {
  console.error('❌ TELEGRAM_WEBHOOK_SECRET must contain 32-256 letters, digits, underscores or hyphens.');
  process.exit(1);
}

const targetWebAppUrl: string = rawWebAppUrl;
const webhookUrl: string = rawWebhookUrl;
let parsedWebhookUrl: URL;
try {
  parsedWebhookUrl = new URL(webhookUrl);
} catch {
  console.error('❌ TELEGRAM_WEBHOOK_URL must be a valid HTTPS URL.');
  process.exit(1);
}
if (parsedWebhookUrl.protocol !== 'https:' || parsedWebhookUrl.username || parsedWebhookUrl.password || parsedWebhookUrl.hash) {
  console.error('❌ TELEGRAM_WEBHOOK_URL must be a public HTTPS URL without credentials or a fragment.');
  process.exit(1);
}

const bot = new Bot(botToken);

async function main() {
  console.log(`Setting Telegram Webhook to ${webhookUrl}...`);
  await bot.api.setWebhook(webhookUrl, { secret_token: webhookSecret });
  console.log('✅ Webhook set successfully!');

  console.log(`Setting Chat Menu Button to ${targetWebAppUrl}...`);
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Constella',
      web_app: { url: targetWebAppUrl },
    },
  });
  console.log('✅ Chat Menu Button configured successfully!');
}

main().catch((err) => {
  console.error(
    'Failed to configure Telegram bot:',
    err instanceof Error ? err.message : 'Unknown error',
  );
  process.exit(1);
});
