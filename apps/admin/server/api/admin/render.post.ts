import { renderMarkdownWithToc } from '../../utils/blog-markdown.mjs';
import { requireAdminSession } from '../../utils/admin-api';

/**
 * Drafts have no public URL, so the preview renders here with the very function the
 * published page uses — the editor cannot disagree with production about the same markup.
 * Guarded like a write: an unauthenticated markdown renderer would be a link farm.
 */
export default eventHandler(async (event) => {
  requireAdminSession(event);
  const body = await readBody<Record<string, unknown> | null>(event);
  const markdown = typeof body?.markdown === 'string' ? body.markdown : '';
  if (markdown.length > 120_000) throw createError({ statusCode: 413, statusMessage: 'Тіло посту задовге.' });
  return renderMarkdownWithToc(markdown);
});
