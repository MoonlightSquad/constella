/**
 * @module @constella/shared/client
 * @description Безпечний для React Native/Expo (Metro, Hermes) барель спільного коду.
 *
 * Коріневний `index.ts` ре-експорить `./logger.js`, а той тягне `winston` і
 * `process.env` — у бандлі Expo це падіння на рівні модуль-резолюції. Тут лише
 * zod-схеми й чисті типи: жодного `logger.js`, жодного `websocket/server.js`.
 *
 * Сервер (`apps/api`, `apps/bot`) продовжує їсти кореневий `"."`.
 */
export * from './telegram.js';
export * from './profile.js';
export * from './auth.js';
export * from './billing.js';
export * from './gamification.js';
export * from './websocket/types.js';
