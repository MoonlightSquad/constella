import { isIP } from 'node:net';

// Hand-validated: pulling zod into the landing for one form would cost more than it saves.
const EMAIL = /^[^\s@,;:<>@"]{1,64}@[^\s@,;:<>@"]{1,190}\.[a-z]{2,24}$/i;

/**
 * The trap is checked before the address on purpose: a bot must not learn which field
 * gave it away. `invalid` is the only outcome the visitor can act on.
 */
export const parseSignup = (body) => {
  if (!body || typeof body !== 'object') return { kind: 'invalid' };
  const { email, website } = body;
  if (typeof website === 'string' && website.trim() !== '') return { kind: 'trap' };
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalized.length > 254 || !EMAIL.test(normalized)) return { kind: 'invalid' };
  return { kind: 'signup', email: normalized };
};

/** `unconfirmed` is what makes the ESP send the double opt-in mail: nothing lands on the list from here. */
export const subscriberPayload = (email, ip, groupId) => ({
  email,
  groups: [groupId],
  status: 'unconfirmed',
  ...(isIP(ip) ? { ip_address: ip } : {}),
});

/**
 * One attempt per address inside the window. The store is a plain map, so it only ever
 * covers this instance; the honeypot and the ESP's confirmation mail carry the real load.
 */
export const hitCooldown = (store, key, now, windowMs) => {
  for (const [seen, at] of store) if (now - at >= windowMs) store.delete(seen);
  const at = store.get(key);
  if (at !== undefined && now - at < windowMs) return true;
  store.set(key, now);
  return false;
};
