# Quiz AI Worker

This Worker is the server-side AI gateway for the Quiz site.

## Deployment

From this directory:

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler.toml` provides the `AI` binding, so the Worker accesses Workers AI through `env.AI` without exposing a Cloudflare API token in the browser.

## Endpoint

`POST /api/ai`

Body:

```json
{
  "messages": [
    {"role": "user", "content": "اشرح لي السؤال"}
  ]
}
```

The browser must use the deployed Worker URL in the root `ai-config.js` file.

## Security notes

- Only the Quiz GitHub Pages origin is allowed by CORS.
- The Worker rejects non-POST requests for the AI endpoint.
- Message count and message size are capped before inference.
- Client-supplied `system` messages are never forwarded as system instructions.
- AI credentials are provided by the Cloudflare binding, not by browser code.
