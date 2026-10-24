/**
 * Ukrainian → ASCII for URL slugs.
 *
 * A naive `replace(/[^a-z-]/g, '')` turns any Cyrillic title into an empty slug, so the
 * editor would silently produce `/blog/` URLs. Digraphs are matched before their prefix
 * letters, otherwise «щу» becomes «shchу».
 */
const DIGRAPHS = { щ: 'shch', й: 'y', є: 'ye', ї: 'yi', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', ж: 'zh', ґ: 'g' };

const LETTERS = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', з: 'z', и: 'y', і: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', ю: 'yu', я: 'ya',
  ь: '', '’': '', "'": '', 'ʼ': '', '`': '',
};

/** Characters that separate words; everything else untranslatable is dropped. */
const SEPARATOR = /[\s_./\\|]+/;

export const transliterate = (value) =>
  String(value)
    .toLowerCase()
    .split('')
    .map((character) => DIGRAPHS[character] ?? LETTERS[character] ?? character)
    .join('');

/**
 * Mirrors the API's `/^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$/`: anything this returns is
 * accepted upstream, and a title with no latin or digits at all still yields a usable slug.
 */
export const slugifyTitle = (value, fallback = 'post') => {
  const slug = transliterate(value)
    .split(SEPARATOR)
    .join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200)
    .replace(/-$/g, '');
  return (slug.length === 1 && slug === '-' ? '' : slug) || fallback;
};

/** True when the API would accept the slug as a path segment. */
export const isSlugShape = (value) => /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/.test(String(value));
