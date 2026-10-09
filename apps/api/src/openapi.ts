export interface OpenApiDocument {
  paths?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

const bearerSecurity = [{ bearerAuth: [] }];

const procedures = [
  { name: 'photos.mine', method: 'get', summary: 'List my photos', description: 'Lists profile photos and their availability.' },
  { name: 'photos.createUpload', method: 'post', summary: 'Create photo upload', description: 'Returns a signed upload URL for supported raster images.' },
  { name: 'photos.confirmUpload', method: 'post', summary: 'Process uploaded photo', description: 'Validates and converts an uploaded image, making it available immediately.' },
  { name: 'photos.remove', method: 'post', summary: 'Delete profile photo', description: 'Deletes one of the authenticated users profile photos.' },
  { name: 'admin.photoQueue', method: 'get', summary: 'Photo moderation queue', description: 'Lists uploaded profile photos waiting for review.' },
  { name: 'admin.reviewPhoto', method: 'post', summary: 'Review profile photo', description: 'Approves or rejects an uploaded photo and records the moderation action.' },
  { name: 'support.create', method: 'post', summary: 'Create support ticket', description: 'Creates a private support ticket and its first message.' },
  { name: 'support.mine', method: 'get', summary: 'List my support tickets', description: 'Returns the current user support tickets.' },
  { name: 'support.thread', method: 'get', summary: 'Read support ticket', description: 'Returns a ticket and messages to its owner.' },
  { name: 'support.reply', method: 'post', summary: 'Reply to support ticket', description: 'Adds a user reply and reopens resolved tickets.' },
  { name: 'support.close', method: 'post', summary: 'Close support ticket', description: 'Closes one of the current user tickets.' },
  { name: 'support.adminQueue', method: 'get', summary: 'Support queue', description: 'Lists support tickets for administrators.' },
  { name: 'support.adminThread', method: 'get', summary: 'Read ticket as support', description: 'Returns ticket thread to administrators.' },
  { name: 'support.adminReply', method: 'post', summary: 'Reply as support', description: 'Adds staff reply and updates the ticket status.' },
  { name: 'healthcheck', method: 'get', summary: 'API health via tRPC', description: 'Returns the API status.', auth: false },
  { name: 'me', method: 'get', summary: 'Current account', description: 'Returns the authenticated account and profile.' },
  { name: 'completeProfile', method: 'post', summary: 'Complete profile', description: 'Saves the onboarding profile. Requires an 18+ birthdate.' },
  { name: 'social.orbit', method: 'get', summary: 'Daily Orbit', description: 'Returns up to eight profiles from the daily local-time Orbit after 19:00.' },
  { name: 'social.incomingSparks', method: 'get', summary: 'Incoming Sparks count', description: 'Counts profiles who liked the current user and have not yet been reviewed.' },
  { name: 'social.deck', method: 'get', summary: 'Discovery deck', description: 'Returns card or grid discovery profiles, remaining like allowance, VIP and streak state.' },
  { name: 'social.swipe', method: 'post', summary: 'React to profile', description: 'Creates a Spark, pass, or Superlike and creates a mutual match when applicable.' },
  { name: 'social.rewind', method: 'post', summary: 'Rewind last pass', description: 'Restores the last passed profile. Requires active VIP.' },
  { name: 'social.incomingLikes', method: 'get', summary: 'Incoming likes', description: 'Returns incoming likes; profile details are visible to VIP accounts.' },
  { name: 'social.setIncognito', method: 'post', summary: 'Set Incognito mode', description: 'Enables or disables 24-hour Incognito mode. Requires active VIP.' },
  { name: 'social.setPassport', method: 'post', summary: 'Change Passport location', description: 'Sets a discovery location. Requires active VIP.' },
  { name: 'social.blockProfile', method: 'post', summary: 'Block profile', description: 'Blocks a profile and hides the pair from discovery and matches.' },
  { name: 'social.reportProfile', method: 'post', summary: 'Report profile', description: 'Submits a safety report for moderator review.' },
  { name: 'social.matches', method: 'get', summary: 'List matches', description: 'Returns the current user’s visible mutual matches.' },
  { name: 'social.chatMessages', method: 'get', summary: 'Read match messages', description: 'Loads the latest chat messages and marks incoming messages read.' },
  { name: 'social.sendMessage', method: 'post', summary: 'Send chat message', description: 'Sends text to a mutual match, subject to per-user rate limits.' },
  { name: 'social.shareContact', method: 'post', summary: 'Share Telegram contact', description: 'Shares usernames only after both matched users opt in.' },
  { name: 'social.sendGift', method: 'post', summary: 'Create gift invoice', description: 'Returns a precondition error; use billing.createInvoice with a gift SKU and recipient.' },
  { name: 'social.receivedGifts', method: 'get', summary: 'List received gifts', description: 'Returns gifts sent to the current user.' },
  { name: 'social.quests', method: 'get', summary: 'Quests and achievements', description: 'Returns daily quest progress, achievements, level and streak data.' },
  { name: 'social.completeInviteQuest', method: 'post', summary: 'Complete invite quest', description: 'Credits invite quest progress. This does not validate a referral conversion.' },
  { name: 'billing.status', method: 'get', summary: 'Billing status', description: 'Returns VIP entitlement, owned consumables, and the Stars product catalog.' },
  { name: 'billing.createInvoice', method: 'post', summary: 'Create Telegram Stars invoice', description: 'Creates a short-lived XTR invoice for a catalog SKU.' },
  { name: 'billing.cancelSubscription', method: 'post', summary: 'Cancel VIP auto-renewal', description: 'Disables the next Telegram Stars subscription renewal; current access remains through expiry.' },
  { name: 'admin.access', method: 'get', summary: 'Check admin access', description: 'Indicates whether the authenticated user is in the server-side admin allowlist.' },
  { name: 'admin.overview', method: 'get', summary: 'Admin overview', description: 'Returns account, activity, report, and payment summary metrics.' },
  { name: 'admin.users', method: 'get', summary: 'Search users', description: 'Returns a paginated, privacy-minimized user list. Admin allowlist required.' },
  { name: 'admin.reports', method: 'get', summary: 'List reports', description: 'Returns a paginated report queue filtered by status. Admin allowlist required.' },
  { name: 'admin.reviewReport', method: 'post', summary: 'Review report', description: 'Updates report status and writes the moderator action to the audit log.' },
  { name: 'admin.setUserStatus', method: 'post', summary: 'Change user status', description: 'Activates, bans, or shadowbans an account with a required reason and audit record.' },
  { name: 'admin.payments', method: 'get', summary: 'List payments', description: 'Returns recent Telegram Stars payment records without provider secrets.' },
  { name: 'admin.audit', method: 'get', summary: 'Admin audit log', description: 'Returns a paginated history of administrative actions.' },
] as const;

const tRpcRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        description: 'tRPC v11 batch envelope. The input is in the json property.',
        additionalProperties: {
          type: 'object',
          properties: { json: { type: 'object', additionalProperties: true } },
        },
        example: { '0': { json: {} } },
      },
    },
  },
};

const tRpcInputParameter = {
  name: 'input',
  in: 'query',
  required: false,
  description: 'URL-encoded tRPC input envelope; use {"json":{...}} for a single query.',
  schema: { type: 'string', example: '{"json":{}}' },
};

const successResponse = {
  '200': { description: 'Successful tRPC result. Results are wrapped in the tRPC response envelope.' },
  '400': { description: 'Invalid input.' },
  '401': { description: 'Authentication is required.' },
  '403': { description: 'The requested action is not allowed.' },
  '500': { description: 'Unexpected server error. Include the response requestId when reporting the issue.' },
};

export const appendTrpcOpenApiPaths = (document: OpenApiDocument): OpenApiDocument => {
  const paths = { ...(document.paths ?? {}) };
  for (const procedure of procedures) {
    const path = `/trpc/${procedure.name}`;
    const operation = {
      tags: ['tRPC'],
      operationId: `trpc_${procedure.name.replaceAll('.', '_')}`,
      summary: procedure.summary,
      description: `${procedure.description}

Call with the tRPC v11 HTTP protocol. Queries use GET; mutations use POST.`,
      ...('auth' in procedure && procedure.auth === false ? {} : { security: bearerSecurity }),
      responses: successResponse,
    };
    const existing = { ...(paths[path] ?? {}) };
    if (procedure.method === 'get') {
      existing.get = { ...operation, parameters: [tRpcInputParameter] };
    } else {
      existing.post = { ...operation, requestBody: tRpcRequestBody };
    }
    paths[path] = existing;
  }
  return { ...document, paths };
};