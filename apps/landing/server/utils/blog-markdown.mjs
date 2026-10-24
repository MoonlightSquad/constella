import MarkdownIt from 'markdown-it';

const DANGEROUS = /^(?:javascript|vbscript|livescript|data|file|blob):/i;

export const headingSlug = (text) => {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
};

const markdown = new MarkdownIt({
  // Raw HTML in a post body is escaped, not parsed, so no second sanitizer is needed.
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
});

const defaultValidate = markdown.validateLink.bind(markdown);
markdown.validateLink = (url) => !DANGEROUS.test(url.trim()) && defaultValidate(url);

const setAttr = (tokens, index, name, value) => {
  const token = tokens[index];
  const existing = token.attrGet(name);
  token.attrSet(name, existing ? `${existing} ${value}` : value);
};

// `heading_open` and `link_open` have no own rule: markdown-it falls back to
// `renderToken` inside `render()`, so the override has to call it explicitly.
const headingOpen = markdown.renderer.rules.heading_open;
markdown.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
  const inline = tokens[index + 1];
  const text = inline?.children ? renderer.renderInlineAsText(inline.children, options, env) : '';
  if (tokens[index].attrIndex('id') < 0) tokens[index].attrSet('id', headingSlug(text));
  if (env) {
    const id = tokens[index].attrGet('id');
    (env.toc ??= []).push({ level: Number(tokens[index].tag.slice(1)) || 2, id, text });
  }
  return (headingOpen ?? ((...args) => renderer.renderToken(...args)))(tokens, index, options);
};

const linkOpen = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const href = tokens[index].attrGet('href') ?? '';
  if (/^https?:\/\//i.test(href)) setAttr(tokens, index, 'rel', 'nofollow noopener noreferrer');
  return (linkOpen ?? ((...args) => renderer.renderToken(...args)))(tokens, index, options, env);
};

const image = markdown.renderer.rules.image;
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  if (tokens[index].attrIndex('loading') < 0) tokens[index].attrSet('loading', 'lazy');
  if (tokens[index].attrIndex('decoding') < 0) tokens[index].attrSet('decoding', 'async');
  return image(tokens, index, options, env, renderer);
};

/** Rendered once on the server: the browser only ever receives finished HTML. */
export const renderMarkdown = (source) => markdown.render(String(source ?? ''));

/** Same render, plus the heading outline the article page turns into a table of contents. */
export const renderMarkdownWithToc = (source) => {
  const env = { toc: [] };
  const html = markdown.render(String(source ?? ''), env);
  return { html, toc: env.toc.filter((entry) => entry.level >= 2 && entry.level <= 3) };
};

/** Plain-text lead used for meta descriptions when an author leaves `seoDescription` empty. */
export const markdownExcerpt = (source, maxLength = 200) => {
  const text = String(source ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/![[\]]*\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>*+-]+\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, text.lastIndexOf(' ', maxLength) > 0 ? text.lastIndexOf(' ', maxLength) : maxLength)}…`;
};
