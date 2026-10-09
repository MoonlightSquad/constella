import { bot, startBot } from './bot.js';

import { pathToFileURL } from 'node:url';

export { bot };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startBot().catch((error) => {
    console.error('Failed to launch bot:', error);
    process.exitCode = 1;
  });
  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());
}
