# Premium AI Chat Coach

The assistant service is a separate FastAPI container, outside the pnpm workspace.
The API sends only the user's selected language and a short, user-entered conversation
topic. It never sends chat messages, profile fields, match IDs, or account identifiers.
The service does not persist or log request or response content.

## Contract

`POST /v1/suggest`, authenticated with `x-assistant-token`:

```json
{"locale":"uk","topic":"подорожі"}
```

Success is exactly three bounded suggestions:

```json
{"suggestions":["…","…","…"]}
```

The API's `assistant.suggest` procedure independently verifies an active Premium
entitlement, match membership, block state, and a daily limit of 10 requests. It reserves
quota before inference, including failed inference attempts, to prevent retry-based cost
abuse. Only user ID, request type, and UTC day are stored in the existing `events` table.
The app only inserts a selected suggestion into the draft; it never sends a message.

## Provider configuration and privacy gate

The service accepts an OpenAI-compatible chat-completions endpoint. The AI-box compose
file includes Ollama on a private Docker network; it is the recommended first pilot
provider. Model weights stay in a named Docker volume and the Ollama port is not published
to the host. A remote provider requires separate approval of its no-training and retention
terms. For a remote provider, use HTTPS and configure its API key as a secret.

Required on the AI box:

```env
AI_ASSISTANT_INTERNAL_TOKEN=<random secret, at least 32 characters>
AI_ASSISTANT_PROVIDER_URL=http://ollama:11434/v1/chat/completions
AI_ASSISTANT_PROVIDER_MODEL=qwen3:8b
AI_ASSISTANT_PROVIDER_API_KEY=
```

`qwen3:8b` is a starting point, not a hardware guarantee: quantized model memory,
context length, and speed depend on the host. Check available RAM/VRAM before pulling it;
choose a smaller Ollama model if the AI box cannot keep it in memory. The API key remains
empty for this private local endpoint. The bundled Ollama service defaults to a 4K context,
one parallel request, and one loaded model; adjust `OLLAMA_CONTEXT_LENGTH` only after
checking host memory.

The provider URL and model name are operator configuration, not request parameters. The
service has one inference slot, bounded input/output sizes and provider timeout, and no
access log. It returns 503 when provider configuration is absent.

## Deployment

1. Review the AI-box RAM/VRAM and storage. Copy `ai/nsfw/.env.example` to `ai/nsfw/.env`,
   create a random `AI_ASSISTANT_INTERNAL_TOKEN` of at least 32 characters, and set the
   local Ollama URL/model shown above. Keep the token out of source control.
2. From `ai/nsfw`, start Ollama and download the model:
   `docker compose --profile assistant up -d ollama`
   `docker compose exec ollama ollama pull qwen3:8b`
3. Start the assistant and reload Caddy:
   `docker compose --profile assistant up -d --build assistant`
   `docker compose restart caddy`
4. Confirm the local model is listed with `docker compose exec ollama ollama list`, then
   confirm `https://$AI_HOSTNAME/assistant-healthz` returns `{"status":"ready"}`. Caddy
   proxies `/v1/suggest` and this non-sensitive readiness endpoint to the assistant.
5. Configure the API deployment with `AI_ASSISTANT_URL=https://$AI_HOSTNAME`,
   the same `AI_ASSISTANT_INTERNAL_TOKEN`, and `AI_ASSISTANT_ENABLED=true`.
6. Keep `AI_ASSISTANT_ENABLED` unset or false to disable all requests. Never apply
   database migrations automatically in production; run the normal reviewed migration
   operation for `0018_assistant_usage_index`, `0019_private_meeting_plans`,
   `0020_recommendation_feedback`, and `0021_reporter_history_index` before enabling the
   related functionality.
7. Smoke-test an active Premium account, a non-Premium account, a non-member match, a
   blocked match, quota exhaustion, malformed provider output, and a stopped provider.

The endpoint remains off until the provider, secrets, migration and deployment checks
are explicitly completed. This repository change does not apply the migration or enable
the feature in Vercel.
