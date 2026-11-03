/**
 * `ctaUrl` carries campaign tags, so a signup can be attributed to the section that sent it.
 * It is spelled out per call because a flat `utm_campaign` on every button measures nothing.
 */
export const useSiteLinks = (where?: { campaign: string }) => {
  const { appUrl, telegramBotUsername } = useRuntimeConfig().public;
  const funnel = new URL(appUrl);
  funnel.searchParams.set('utm_source', 'landing');
  funnel.searchParams.set('utm_medium', 'cta');
  funnel.searchParams.set('utm_campaign', where?.campaign ?? 'site');
  const ctaUrl = funnel.toString();
  // Without a bot handle the Telegram button degrades into the app, and that click still
  // needs to be attributable to the section it came from.
  return { appUrl, bot: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : ctaUrl, ctaUrl };
};
