import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Double-submit token: readable by the admin app's JS, compared against the header server-side. */
export const createCsrfToken = () => randomBytes(24).toString('base64url');

/**
 * Hashed compare, so a short token and a long one fail in constant time instead of
 * throwing inside timingSafeEqual (the same trick the API uses for admin credentials).
 */
export const csrfMatches = (headerValue, cookieValue) => {
  if (typeof headerValue !== 'string' || typeof cookieValue !== 'string') return false;
  if (!headerValue || !cookieValue) return false;
  return timingSafeEqual(
    createHash('sha256').update(headerValue).digest(),
    createHash('sha256').update(cookieValue).digest(),
  );
};
