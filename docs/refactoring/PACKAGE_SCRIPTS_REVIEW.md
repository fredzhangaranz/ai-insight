# package.json Scripts Review

Review date: 2025-02-11. Purpose: identify scripts that can be removed safely.

---

## Scripts that can be removed (safe to delete)

### 1. **Broken: script file does not exist**

| Script                | Points to                        | Used in                                                                                                |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `check-tables`        | `scripts/check-tables.js`        | DEPLOYMENT_MANUAL, TROUBLESHOOTING, readme, BETA_RELEASE_DEPLOYMENT_PREP, UPGRADE_STRATEGY, NEXT_STEPS |
| `ontology:export`     | `scripts/ontology-exporter.js`   | Docs mention as "placeholder"; no implementation                                                       |
| `ontology:validate`   | `scripts/ontology-validator.js`  | Docs mention as "placeholder"; no implementation                                                       |
| `test-enum-detection` | `scripts/test-enum-detection.ts` | Phase-5a completion docs only; file not in repo                                                        |

**Recommendation:** Remove these four from `package.json`. For `check-tables`, either add a minimal `scripts/check-tables.js` (e.g. list tables via `pg`) or update docs to remove references.

---

### 2. **Optional: one-off / dev-only (remove if you want a leaner scripts section)**

| Script                   | Purpose                                | References                                         |
| ------------------------ | -------------------------------------- | -------------------------------------------------- |
| `verify-migration-037`   | One-off verification for migration 037 | Script exists; very specific to a single migration |
| `debug-semantic-search`  | Debug semantic search by customer      | Script exists; dev/debug only                      |
| `consolidate-migrations` | Merge migration files (034→037)        | readme.md only; niche refactor use                 |

**Recommendation:** Keep unless you explicitly want to trim. Safe to remove if you don't use migration consolidation or migration-037 verification.

---

## Scripts to keep

- **Core:** `setup`, `setup:beta`, `setup:production`, `dev`, `build`, `start`, `lint`, `test`, `test:ui`, `test:run`
- **DB / deployment:** `migrate`, `migrate:force`, `migrate:rerun` — used by setup and docs
- **Seeding (used by setup or manual flow):** `seed-ai-config`, `seed-template-catalog`, `seed-admin`, `seed-assessment-types`, `ontology:load`, `ontology:load-synonyms`, `ontology:seed-data-sources`
- **Semantic / ontology tooling (documented):** `enum-detection`, `discover-field-gaps`, `diagnose-field-gaps`, `fix-field-concepts`, `check-field-existence`, `backfill-concept-ids`

---

## Summary

- **Remove (4):** `check-tables`, `ontology:export`, `ontology:validate`, `test-enum-detection` — script files are missing; removing avoids broken `pnpm run <script>`.
- **Optional remove (3):** `verify-migration-037`, `debug-semantic-search`, `consolidate-migrations` — only if you want fewer scripts; all have working script files.

After removal, update any docs that reference `check-tables` (or add a minimal `check-tables.js` if you still want that command).
