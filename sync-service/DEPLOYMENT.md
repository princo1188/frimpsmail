# Frimps Mail Sync Worker deployment

This worker is a persistent Node.js process. It uses the `app.js` Passenger entry
point for DirectAdmin and listens on `PORT` (default `8080`) for a lightweight
health endpoint at `/health`.

## Runtime requirements

- Node.js 22 or newer (the locked Supabase runtime packages require this)
- pnpm 11, supplied through Corepack when building from source
- outbound TCP access to Supabase, IMAP, SMTP, and (when enabled) Anthropic

The production dependency tree contains no required native add-ons. `typescript`,
`tsx`, and its platform-specific `esbuild` binary are build-only dependencies and
are excluded by `pnpm install --prod`.

## Required environment

Create `.env` beside `app.js`; do not upload a local development `.env` file.

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-api-key
PORT=8080
BACKFILL_DAYS=90
POLL_INTERVAL_MS=30000
OUTBOUND_MAX_ATTEMPTS=5
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must belong to the same project.
The worker uses Supabase's HTTPS API and Storage API; it does not open a direct
Postgres connection, so a database pooler URL is not required or consumed.
`ANTHROPIC_API_KEY` is required when AI spam analysis is enabled.

## DirectAdmin / Passenger

Set the DirectAdmin Node.js application's startup file to `app.js`, choose Node
22+, set the application root to this directory, and restart the application after
creating `.env`. Passenger supplies `PORT`; the worker honors it automatically.

To run outside Passenger after installation:

```bash
node app.js
curl -fsS http://127.0.0.1:8080/health
```
