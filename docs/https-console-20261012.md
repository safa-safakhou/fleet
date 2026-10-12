# Fleet HTTPS console — 12 October 2026

Founder assignment: expose the existing Fleet console at `https://fleet.tinyagenttools.com`. Cloudflare DNS publication received explicit browser action confirmation. No new population, inference, game write or schedule activation is included.

## Configuration and deployment

- Release `b03e7fa1fad547e46d6e1fd265f8f3e48230f810`, built from committed Fleet source and deployed with `scripts/deploy.sh`.
- Protected `/var/lib/fleet/fleet.env`: exact HTTPS origin and optional `FLEET_EDGE_NETWORK=pact-production_application`; live execution remains `0`. Existing operator password and vault key retained.
- `compose.edge.yml` attaches only the console to the existing HTTPS proxy network using alias `fleet-console`. The worker and Fleet PostgreSQL stay on `fleet_default`; host port 8820 remains loopback-only.
- Existing `/srv/pact/config/edge/Caddyfile` includes the repository's `infra/fleet.caddy` fragment. Caddy validated and reloaded without restarting PACT, obtained a Let's Encrypt certificate and redirects HTTP to HTTPS.
- Cloudflare A record `fleet` → `2.31.62.91`, proxied, automatic TTL. No other DNS records or Cloudflare security settings changed.
- Original protected configuration and edge file backed up under `/var/lib/fleet/backups/https-access-20261012` (root-only). No private values included here.

## Verification

- `bash -n scripts/deploy.sh`, `git diff --check` passed. Server Compose configuration assertions confirmed exact origin, disabled execution, loopback port, console-only proxy network and private worker/database.
- Caddy candidate and deployed configuration validated. Deployment image build passed; disabled console health and terminal state proof passed.
- Normal certificate validation passed both directly against the origin (hostname-preserving DNS override) and through Cloudflare. Public home and health returned 200; HTTP redirected with 308.
- Actual existing operator login through public HTTPS passed, authenticated state contained the five agents with live execution disabled, and the session cookie included Secure, HttpOnly and SameSite=Lax. Unauthorized reads returned 401; wrong-origin login and authenticated write checks returned 403; logout invalidated the session. Credentials/cookies were held privately in process memory/stdin and not printed.
- Public HTTP acceptance used curl. Cloudflare returned 403 to Python urllib's default client; no protection was weakened to accommodate that client.
- Terminal state proof remained identical: 1 cohort, 5 agents, 31 turns, 87 compute ledger rows, 0 communications, 0 owner decisions, 15 audit events. No pending command was changed or replayed.
- PACT public health remained successful. Its edge, API and PostgreSQL containers retained original start times and zero restart counters.

At initial publication, the Mac's configured network DNS resolvers still cached the prior NXDOMAIN. One cached response expired, but an upstream negative cache then returned a remaining TTL of approximately 850 seconds. Cloudflare's authoritative DNS, public resolvers 1.1.1.1 and 8.8.8.8, and the server already resolved Fleet successfully. The actual Chrome tab remained blocked by that local-network DNS cache, so browser login acceptance is pending cache propagation; public HTTP/operator acceptance above passed. No network DNS settings, browser security checks or local hostname mappings were changed to conceal the cache. Existing OAuth account connection and new cohort behavior were not exercised by this access-only assignment.
