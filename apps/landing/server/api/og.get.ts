import { Resvg, initWasm } from '@resvg/resvg-wasm';
import satori from 'satori';
import type { H3Event } from 'h3';
import type { BlogAuthorArchive, BlogCategoryArchive, BlogPost, BlogTagArchive } from '../../app/types/blog';
import { OG_HEIGHT, OG_WIDTH, ogCard, parseOgQuery } from '../utils/og-image.mjs';

const FALLBACK_IMAGE = '/og/default.png';
const CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

// `as const` keeps the weights literal: satori accepts 100-900 as a union, not as a number.
const MARKS = [
  ['server/fonts/manrope-500.ttf', 500],
  ['server/fonts/manrope-700.ttf', 700],
  ['server/fonts/manrope-800.ttf', 800],
] as const;

/** Inlined server assets arrive as bytes from the build, as base64 from the dev fs driver. */
const toBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value, 'base64'));
  throw new Error(`Unexpected inlined asset (${typeof value})`);
};

type OgRenderer = { fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 | 800 }[] };

/**
 * `initWasm()` may only be called once per isolate, so the whole set-up is a cached promise: a warm
 * lambda renders with the wasm already in memory, and a failed set-up is not retried into an endless
 * re-instantiation on the next crawler hit.
 */
let renderer: Promise<OgRenderer> | null = null;
const loadRenderer = () => {
  if (!renderer) {
    renderer = (async () => {
      const storage = useStorage('assets');
      const wasm = await storage.getItem<Uint8Array | string>('server/og/index_bg.wasm', { encoding: 'binary' });
      if (!wasm) throw new Error('Missing inlined server/og/index_bg.wasm — build the app first');
      await initWasm(toBytes(wasm));
      const fonts = await Promise.all(
        MARKS.map(async ([mark, weight]) => ({
          name: 'Manrope',
          // satori's own types name only ArrayBuffer here; a byte view is what its font parser reads.
          data: toBytes(await storage.getItem(mark, { encoding: 'binary' })) as unknown as ArrayBuffer,
          weight,
        })),
      );
      return { fonts };
    })().catch((cause) => {
      renderer = null;
      throw cause;
    });
  }
  return renderer;
};

const formatDay = (iso: string | null, locale: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const language = LOCALE_LANGUAGE[locale as keyof typeof LOCALE_LANGUAGE] ?? 'uk-UA';
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' }).format(date);
};

type OgCopy = { eyebrow?: string; title: string; footer?: string };
type Card = { ok: true; copy: OgCopy } | { ok: false; status: number };

/**
 * Card copy is content the API already localises — a title, a category name, an author line.
 * Nothing is read out of the query, so the number of cards that can exist equals the number of
 * published articles, and nobody can mint a branded image with invented wording.
 */
const cardCopy = async (event: H3Event, kind: string, slug: string, locale: string): Promise<Card> => {
  if (kind === 'post') {
    const { status, data } = await fetchBlog<BlogPost>(event, 'post', { slug, locale });
    if (!data) return { ok: false, status };
    return {
      ok: true,
      copy: {
        eyebrow: data.categories?.[0]?.name,
        title: data.title,
        footer: [data.authorName, formatDay(data.publishedAt, locale)].filter(Boolean).join(' · '),
      },
    };
  }

  if (kind === 'category') {
    const { status, data } = await fetchBlog<BlogCategoryArchive>(event, 'category', { slug, locale });
    if (!data) return { ok: false, status };
    return { ok: true, copy: { title: data.name, footer: data.description ?? '' } };
  }

  if (kind === 'author') {
    const { status, data } = await fetchBlog<BlogAuthorArchive>(event, 'author', { slug, locale });
    if (!data) return { ok: false, status };
    return { ok: true, copy: { eyebrow: data.role ?? undefined, title: data.name, footer: data.bio ?? undefined } };
  }

  const { status, data } = await fetchBlog<BlogTagArchive>(event, 'tag', { slug, locale });
  if (!data) return { ok: false, status };
  return { ok: true, copy: { title: `#${data.name}` } };
};

export default eventHandler(async (event) => {
  const parsed = parseOgQuery(getQuery(event));
  if (!parsed.ok) {
    // `kind` and `slug` are ours to generate; anything else is a probe, and a probe gets a 404
    // rather than a rendered image that would then be cached under a key no page links to.
    throw createError({ statusCode: 404, statusMessage: `Unknown OG card (${parsed.reason})` });
  }

  let png: Uint8Array;
  try {
    const card = await cardCopy(event, parsed.kind, parsed.slug, parsed.locale);
    if (!card.ok) {
      // An unpublished or unknown slug is a real 404; an unreachable API is our problem, and the
      // brand card answers it without teaching a crawler that this content is missing.
      if (card.status === 404) throw createError({ statusCode: 404, statusMessage: 'Card not found' });
      console.warn(`[og] upstream ${card.status} for ${parsed.kind}/${parsed.slug}/${parsed.locale}`);
      return sendRedirect(event, FALLBACK_IMAGE, 302);
    }
    const { fonts } = await loadRenderer();
    // The card tree is satori's element shape rather than a React element, and satori types its
    // input with React's own — the one part of `@vercel/og` this route gets by without it.
    const svg = await satori(ogCard(card.copy) as Parameters<typeof satori>[0], { width: OG_WIDTH, height: OG_HEIGHT, fonts });
    png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  } catch (cause) {
    if ((cause as { statusCode?: number }).statusCode) throw cause;
    console.warn(`[og] render failed for ${parsed.kind}/${parsed.slug}/${parsed.locale}:`, cause);
    return sendRedirect(event, FALLBACK_IMAGE, 302);
  }

  return new Response(png as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': CACHE_CONTROL } });
});
