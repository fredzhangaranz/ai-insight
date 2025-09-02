# AI Configuration Simplification — Implementation Checklist

This checklist operationalizes the simplified, consistent AI configuration workflow. It is designed to be executed step-by-step with clear acceptance criteria and without ambiguity between development and production environments.

## Scope & Goals

- One source of truth per environment.
- No hidden fallbacks or special cases on hot paths.
- Minimal surface area: clear responsibilities per layer.
- Predictable failures with actionable messages.

## Guiding Principles

- Development: `.env.local` only; Admin mutations disabled; validation allowed.
- Production: Database only; optional one-time seed; no env usage at runtime.
- No request-time validation probes; use background health checks and explicit validation actions.
- Optional failover is explicit, priority-based, and off by default.

---

## Step 1 — Enforce Single Source in Loader

Path: `lib/config/ai-config-loader.ts`

- [ ] Remove production fallback-to-env on DB errors; surface the error.
- [ ] Seed only when DB table is empty AND `SEED_ON_BOOT=true`; otherwise do not seed.
- [ ] After seeding, re-query DB and return DB results; never return env results in prod.
- [ ] In development, always read from `.env.local` and never touch DB.
- [ ] Replace any `createConfiguration(...)` calls with `saveConfiguration(...)` during seeding to match service API.

Acceptance:
- [ ] In prod with DB down, the loader errors (no env fallback).
- [ ] In prod with empty table and `SEED_ON_BOOT=true`, DB is populated once, then used.
- [ ] In dev, no DB connections are attempted.

---

## Step 2 — Remove Env Reads in Service Validation

Path: `lib/services/ai-config.service.ts`

- [ ] Delete `getFallbackConfig` and any env usage in `validate*` functions.
- [ ] Ensure validation uses only `configData` from DB rows.
- [ ] Keep selection (find/get default) pure; decouple from any live network calls.
- [ ] If keeping `findBestAvailableProvider`, remove request-time validation; selection should not call validate.

Acceptance:
- [ ] Validation results are determined solely by DB config content.
- [ ] No service function reads `process.env` for provider config.

---

## Step 3 — Providers Consume Only Resolved Config

Paths:
- `lib/ai/providers/claude-provider.ts`
- `lib/ai/providers/gemini-provider.ts`
- `lib/ai/providers/openwebui-provider.ts`

- [ ] Do not read env in providers; accept config only from `AIConfigLoader` output.
- [ ] Fail fast with clear errors if required fields are missing (no silent defaults).
- [ ] Remove provider-local silent defaults beyond allowed schema defaults.

Acceptance:
- [ ] Providers throw `MisconfiguredProvider`-style errors when required fields are absent.
- [ ] No `process.env` reads remain in providers.

---

## Step 4 — Setup Service Clear Separation

Path: `lib/services/setup.service.ts`

- [ ] In development, `checkSetupStatus` returns “setup not required”; do not initialize or touch DB.
- [ ] In production, `checkSetupStatus` reads DB only; remove auto-initialize from env during status checks.
- [ ] Expose a single explicit seeding path (invoked by boot or admin action) if needed.

Acceptance:
- [ ] Dev flow shows no DB calls and no side effects.
- [ ] Prod flow does not auto-initialize during status checks; seeding is explicit.

---

## Step 5 — Admin API Environment Rules

Paths:
- `app/api/admin/ai-config/route.ts`
- `app/api/admin/ai-config/actions/route.ts`

- [ ] In development, block all mutations (create/update/delete/enable/disable). Allow `validate` only.
- [ ] In production, use DB only for all actions, including `validate`.
- [ ] Remove any dev/prod env-based validation branches on the server except the dev-only validator that reads from `.env.local` (for validation purpose only).

Acceptance:
- [ ] Dev: POST mutations return 403 with clear “edit .env.local” guidance; `validate` works.
- [ ] Prod: All mutations and validation hit DB-backed service; no env reads.

---

## Step 6 — Background Health Monitoring (Prod)

Paths:
- `lib/monitoring.ts` (and/or new scheduler)

- [ ] Periodically validate enabled providers and update `status`, `lastChecked`, and `message` in DB.
- [ ] Keep intervals reasonable (e.g., 1–5 minutes) and resilient to transient failures.
- [ ] Ensure no health checks run in development.

Acceptance:
- [ ] DB reflects recent health info without user actions.
- [ ] No health checks run in dev.

---

## Step 7 — Optional: Explicit Failover

Schema & Config:
- [ ] Add `priority` (int) to `AIConfiguration` and API. Lower number = higher priority.
- [ ] Add `AUTO_FAILOVER=true|false` environment toggle (prod-only).

Behavior:
- [ ] On provider call failure, when `AUTO_FAILOVER=true`, try next enabled provider by `priority`.
- [ ] Never probe disabled providers; do not perform live validation as selection.

Acceptance:
- [ ] With failover off, first provider failure returns `NoUsableProvider`.
- [ ] With failover on, subsequent provider(s) are attempted in priority order.

---

## Errors & Messaging Standards

- [ ] `SetupRequired`: No providers configured; instruct seeding or Admin configuration.
- [ ] `NoUsableProvider`: No enabled/healthy provider available; point to Admin.
- [ ] `MisconfiguredProvider`: Required fields missing for provider X; list missing keys.
- [ ] No silent env fallback; log the real cause and propagate concise, actionable messages.

Acceptance:
- [ ] Each error path produces a single, clear message with guidance.

---

## Admin UI & Docs

UI:
- [ ] In dev, display banner: “Dev mode: edit `.env.local`”. Disable mutation controls; leave `Validate` enabled.
- [ ] In prod, show Setup screen only when DB has zero configs; otherwise show Admin panel.

Docs:
- [ ] Update `docs/design/ai-configuration-simplified.md` to emphasize: one source per environment; no magical fallbacks.
- [ ] Reference this checklist from that document.

---

## Verification Matrix

Scenarios:
- [ ] Dev with only Anthropic in `.env.local`: Admin shows providers from env; mutations blocked; validate works.
- [ ] Prod with empty DB and `SEED_ON_BOOT=true`: Seeds once from env; thereafter DB only.
- [ ] Prod with DB configured: Requests never read env; background health updates statuses.
- [ ] Prod DB down: Loader surfaces DB error; no env fallback.

---

## Implementation Notes

- Keep changes surgical and focused; avoid refactors outside the config path.
- Favor small PRs per step for easier review and rollback.
- Add concise logs on loader decisions (dev vs prod; seeded vs loaded; errors).
- Tests: Unit tests for loader (dev/prod), service validation (no env), providers (fail fast), and Admin API guards.

