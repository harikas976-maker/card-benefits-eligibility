# Card benefits eligibility API

A local Fastify and TypeScript service with synthetic customers and benefits. Requires Node.js 20 or newer.

On Windows, run `.\scripts\setup-audit.ps1` in PowerShell from the project directory before starting the API for the first time. Start the API under the same Windows account.

```sh
npm ci
npm run build
npm start
```

The API binds to 127.0.0.1:3000. It starts two stub routes on a separate loopback listener. Run `npm test` for unit and integration checks, `npm run typecheck` for type checking, and `npm run lint` for unused-code and syntax checks.

## API contract

```sh
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/api/v1/eligibility/check \
  -H "Authorization: Bearer local-alice" \
  -H "Content-Type: application/json" \
  -d '{"benefitCode":"LOUNGE"}'
```

The examples use a POSIX shell. On PowerShell, use `Invoke-RestMethod -Uri http://127.0.0.1:3000/api/v1/eligibility/check -Method Post -Headers @{ Authorization = 'Bearer local-alice' } -ContentType 'application/json' -Body (@{ benefitCode = 'LOUNGE' } | ConvertTo-Json -Compress)`.

A successful check returns HTTP 200 with `{"eligible":true,"reasonCode":"ELIGIBLE","correlationId":"<generated UUID>"}`. With `Bearer local-bob`, the same request returns `eligible: false` and `NO_ELIGIBLE_CARD`. Unknown or disabled benefits return `BENEFIT_UNAVAILABLE`. Codes are uppercase and use up to 32 letters, digits, or underscores, starting with a letter. An optional matching `customerId` is accepted.

Errors include a stable `code` and the generated `correlationId`.

| Status | Codes |
| --- | --- |
| 400 | INVALID_REQUEST |
| 401 | UNAUTHENTICATED |
| 403 | FORBIDDEN |
| 404 | NOT_FOUND |
| 413 | PAYLOAD_TOO_LARGE |
| 415 | UNSUPPORTED_MEDIA_TYPE |
| 500 | INTERNAL_ERROR |
| 503 | DEPENDENCY_UNAVAILABLE, SERVICE_BUSY, AUDIT_UNAVAILABLE |

Health checks report local process availability. The test credentials are fixed fixtures for loopback use.

## Decision audit

Each completed decision is written to a synced file in `.audit/` before the response. On Windows, the setup script creates the directory, disables inherited access rules, and verifies that the current account has the only access rule, which applies to new files as well. Run `Get-Acl -LiteralPath .audit | Format-List Owner,AccessToString,AreAccessRulesProtected` to review those permissions. The script leaves existing directories alone. If you use an existing directory or override the path with `AUDIT_DIR`, verify that its permissions restrict access to the service account and any authorized audit readers before starting the API. On POSIX, new directories and files request owner-only permissions. The local demo has manual retention. Remove its synthetic audit files after testing. An external retry can create another decision and audit entry with new IDs.

## Load check

With the API running, run `node scripts/load.mjs 200 8` and `node scripts/load.mjs 400 8` to compare doubled request count at fixed concurrency. To also test higher simultaneous demand, repeat with `400 16`. Warm up first and repeat each run under the same conditions. Compare throughput, p50/p95/p99 latency, error rate, and 503 breakdown alongside CPU, memory, and downstream timings.

## Critical dependency findings

Identify the vulnerable version and dependency path, then check whether the affected feature is reachable and what data or permissions it can access. Prefer a patched direct or transitive version. If none is available, disable the affected path or apply a targeted mitigation while tracking the fix. Review the lockfile diff, run a clean install and the tests, and rerun the scan. Roll out gradually while watching error rate and latency. If the rollout regresses, revert to a known safe build or keep the affected path disabled.

See [the design note](DESIGN.md) for failure handling and deployment decisions.
