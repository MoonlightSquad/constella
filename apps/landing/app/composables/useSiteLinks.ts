export const useSiteLinks = () => {
  const { appUrl, telegramBotUsername } = useRuntimeConfig().public;
  const bot = telegramBotUsername ? `https://t.me/${telegramBotUsername}` : appUrl;
  return { appUrl, bot };
};
