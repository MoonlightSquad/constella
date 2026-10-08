import { Bot } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

let botToken = process.env.BOT_TOKEN;
let rawWebAppUrl = process.env.WEB_APP_URL || process.env.NUXT_PUBLIC_APP_URL;

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

const targetWebAppUrl: string = rawWebAppUrl;
const webhookUrl = `${targetWebAppUrl.replace(/\/$/, '')}/api/telegram/webhook`;

const bot = new Bot(botToken);

async function main() {
  console.log(`Setting Telegram Webhook to ${webhookUrl}...`);
  await bot.api.setWebhook(webhookUrl);
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
  console.error('Failed to configure Telegram bot:', err);
  process.exit(1);
});
