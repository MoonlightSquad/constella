/**
 * Open Graph card, drawn with satori. Everything here is pure — no nitro, no fs, no storage —
 * so `node --test tests/og-image.test.mjs` covers the allowlist, the budgets and the element
 * tree without a browser, a font file or the blog API.
 */

/** Same values as `app/assets/css/tokens.css`; satori cannot read CSS custom properties. */
export const OG_BRAND = {
  ink900: '#0d1718',
  surface400: '#1b3631',
  fg: '#f3f5f2',
  fgMuted: '#9aaba7',
  gold: '#d9ad6d',
  goldEyebrow: '#e4b46c',
  mint: '#82c7b7',
};

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const OG_KINDS = ['post', 'category', 'tag', 'author'];
export const OG_LOCALES = ['uk', 'en', 'de', 'fr'];

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;

/**
 * Query strings arrive from a `<meta property=og:image>` we generated ourselves, but the URL is
 * public, so anything outside these allowlists is a rejected request rather than a render.
 *
 * @returns {{ ok: true, kind: string, slug: string, locale: string } | { ok: false, reason: string }}
 */
export const parseOgQuery = (query) => {
  const kind = typeof query.kind === 'string' ? query.kind : '';
  const slug = typeof query.slug === 'string' ? query.slug : '';
  const locale = OG_LOCALES.includes(String(query.locale)) ? String(query.locale) : 'uk';
  if (!OG_KINDS.includes(kind)) return { ok: false, reason: 'kind' };
  if (!SLUG.test(slug)) return { ok: false, reason: 'slug' };
  return { ok: true, kind, slug, locale };
};

/**
 * satori has no `text-overflow` and no line clamp, so overlong text is cut here. The cut backs up
 * to the last whole word when that still keeps most of the budget — a card ending in «…до с…» reads
 * as a bug, while «…до справжніх стосунків» reads as a summary.
 */
export const clampText = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= (max - 1) * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
};

/** One size does not fit: a 96-character title at 64px runs off the bottom of the card. */
export const titleSize = (text) => (text.length > 90 ? 46 : text.length > 68 ? 56 : text.length > 44 ? 64 : 72);

/**
 * `type`/`props`/`children` in the shape React's JSX transform produces. satori rejects a node
 * whose children is an empty *array*, so a childless element must omit the prop entirely.
 */
export const h = (type, props = {}, ...children) => {
  if (children.length === 0) return { type, props: { ...props } };
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
};

/** The same four stars and four edges as `app/components/BrandMark.vue`, in its 64-unit space. */
const MARK_STARS = [
  { x: 18, y: 16, r: 7, color: 'gold' },
  { x: 40, y: 24, r: 5, color: 'gold' },
  { x: 26, y: 40, r: 6, color: 'mint' },
  { x: 46, y: 48, r: 4.5, color: 'gold' },
];
const MARK_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [0, 2],
];

export const brandMark = (size, color = OG_BRAND.gold) => {
  const scale = size / 64;
  const at = (star) => ({ left: star.x * scale, top: star.y * scale });
  return h(
    'div',
    { style: { position: 'relative', width: size, height: size, display: 'flex' } },
    ...MARK_EDGES.map(([from, to]) => {
      const a = MARK_STARS[from];
      const b = MARK_STARS[to];
      const length = Math.hypot(b.x - a.x, b.y - a.y) * scale;
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return h('div', {
        style: {
          position: 'absolute',
          ...at(a),
          width: length,
          height: Math.max(2, 3 * scale),
          backgroundColor: color,
          opacity: 0.45,
          transform: `rotate(${angle}deg)`,
          transformOrigin: '0% 50%',
        },
      });
    }),
    ...MARK_STARS.map((star) =>
      h('div', {
        style: {
          position: 'absolute',
          left: (star.x - star.r) * scale,
          top: (star.y - star.r) * scale,
          width: star.r * 2 * scale,
          height: star.r * 2 * scale,
          borderRadius: 999,
          backgroundColor: star.color === 'mint' ? OG_BRAND.mint : color,
        },
      }),
    ),
  );
};

const dot = (left, top, size, color, opacity) =>
  h('div', { style: { position: 'absolute', left, top, width: size, height: size, borderRadius: 999, backgroundColor: color, opacity } });

/** The card is a wide surface, so the constellation that ends the logo continues behind it. */
const starField = () =>
  h(
    'div',
    { style: { position: 'absolute', top: 0, right: 0, width: 520, height: 630, display: 'flex' } },
    dot(300, 96, 18, OG_BRAND.gold, 0.9),
    dot(392, 178, 10, OG_BRAND.mint, 0.55),
    dot(246, 244, 7, OG_BRAND.fg, 0.22),
    dot(430, 320, 13, OG_BRAND.gold, 0.4),
    dot(160, 430, 8, OG_BRAND.mint, 0.3),
  );

const wordmark = () =>
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 20 } },
    brandMark(64),
    h('div', { style: { display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 1, color: OG_BRAND.gold } }, 'Constella'),
  );

/**
 * @param {{ eyebrow?: string, title: string, footer?: string }} copy — every string is content
 * the caller already read from the blog API for this locale; nothing here comes from the query.
 */
export const ogCard = ({ eyebrow, title, footer }) => {
  const headline = clampText(title, 140);
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        padding: 76,
        // Same top-light ellipse as `--sky`, which is the surface of every page this card is shared from.
        backgroundColor: OG_BRAND.ink900,
        backgroundImage: `radial-gradient(ellipse at 50% -20%, ${OG_BRAND.surface400} 0%, ${OG_BRAND.ink900} 58%)`,
        color: OG_BRAND.fg,
        fontFamily: 'Manrope',
      },
    },
    starField(),
    wordmark(),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 22 } },
      ...(eyebrow
        ? [h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: OG_BRAND.goldEyebrow } }, clampText(eyebrow, 60))]
        : []),
      h('div', { style: { display: 'flex', fontSize: titleSize(headline), fontWeight: 800, lineHeight: 1.14 } }, headline),
    ),
    h(
      'div',
      { style: { display: 'flex', gap: 16, alignItems: 'center', fontSize: 26, fontWeight: 500, color: OG_BRAND.fgMuted } },
      ...(footer ? [h('div', { style: { display: 'flex' } }, clampText(footer, 120))] : []),
    ),
  );
};
