import { evaluateTrpcCall } from '../../utils/trpc-allowlist.mjs';
import { adminSessionDecision, upstreamBase } from '../../utils/admin-api';

const CODE_FOR_STATUS: Record<number, string> = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 405: 'METHOD_NOT_SUPPORTED', 413: 'PAYLOAD_TOO_LARGE', 504: 'TIMEOUT' };

/**
 * Guards answer in the shape tRPC parses (`{ error: { message, code } }`), because the console's
 * client reads `data.code` to decide whether to show an error or sign out. A nitro HTML error page
 * here would arrive as "Unknown error" and hide the reason.
 */
const reject = (event: H3Event, status: number, message: string) => {
  setResponseStatus(event, status);
  setHeader(event, 'content-type', 'application/json');
  return { error: { message, code: CODE_FOR_STATUS[status] ?? 'INTERNAL_SERVER_ERROR' } };
};

/**
 * The console's only door to the API. Everything the browser can reach is decided here: the
 * session cookie (never readable by the page), same-site + CSRF for writes, and the procedure
 * table in `trpc-allowlist.mjs` — every name of a comma-joined batch, not just the first.
 *
 * The upstream answer is forwarded status and body verbatim: that is what keeps a batched
 * `{ result: { data, error } }` envelope intact for the client.
 */
export default eventHandler(async (event) => {
  const session = adminSessionDecision(event);
  if (!session.ok) return reject(event, session.status, session.error);

  const call = evaluateTrpcCall({ method: event.method, segment: getRouterParam(event, 'path') ?? '' });
  if (!call.ok) return reject(event, call.status, call.error);

  const isWrite = event.method === 'POST' || event.method === 'PATCH';
  const raw = isWrite ? await readRawBody(event, 'utf8') : null;
  const path = call.names.map((name: string) => encodeURIComponent(name)).join(',');

  // A cold start or a slow upstream otherwise leaves nitro's HTML 500 here, which the tRPC
  // client reports as "Unknown error" and the editor cannot distinguish from a real failure.
  let response: Response;
  try {
    response = await fetch(`${upstreamBase(event)}/trpc/${path}${getRequestURL(event).search}`, {
      method: event.method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.token}`,
        ...(raw ? { 'content-type': getRequestHeader(event, 'content-type') || 'application/json' } : {}),
      },
      ...(raw ? { body: raw } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return reject(event, 504, 'API не відповідає. Спробуй ще раз.');
  }

  setResponseStatus(event, response.status);
  setHeader(event, 'content-type', response.headers.get('content-type') || 'application/json');
  return response.text();
});
