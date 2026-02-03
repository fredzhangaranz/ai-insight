# Deployment Documentation Index

**Single entry point for all deployment guides.**

---

## Quick Start (Recommended)

**All users should start here:**

→ **[README-DEPLOYMENT.md](../../README-DEPLOYMENT.md)**

- Choose between `pnpm setup:beta` or `pnpm setup:production`
- Interactive wizard guides you through everything
- No manual configuration needed

---

## Detailed Guides

| Document | Purpose | Audience |
|----------|---------|----------|
| **[BETA_RELEASE_DEPLOYMENT_PREP.md](./BETA_RELEASE_DEPLOYMENT_PREP.md)** | Comprehensive beta deployment guide | Office developers, QA |
| **[DEPLOYMENT_MANUAL.md](./DEPLOYMENT_MANUAL.md)** | Step-by-step manual setup | Advanced users, DevOps |
| **[DEPLOYMENT_TROUBLESHOOTING.md](./DEPLOYMENT_TROUBLESHOOTING.md)** | Common issues and solutions | Anyone stuck during setup |
| **[UPGRADE_STRATEGY.md](./UPGRADE_STRATEGY.md)** | Planning for version upgrades | DevOps, System admins |

---

## By Use Case

### "I want to deploy locally for testing"
→ Run: `pnpm setup:beta`  
→ Then read: [BETA_RELEASE_DEPLOYMENT_PREP.md](./BETA_RELEASE_DEPLOYMENT_PREP.md)

### "I want to deploy to production"
→ Run: `pnpm setup:production`  
→ Then read: [DEPLOYMENT_MANUAL.md](./DEPLOYMENT_MANUAL.md) for production considerations

### "I'm having setup problems"
→ Read: [DEPLOYMENT_TROUBLESHOOTING.md](./DEPLOYMENT_TROUBLESHOOTING.md)

### "I need to upgrade an existing deployment"
→ Read: [UPGRADE_STRATEGY.md](./UPGRADE_STRATEGY.md)

### "I want manual step-by-step control"
→ Read: [DEPLOYMENT_MANUAL.md](./DEPLOYMENT_MANUAL.md)

---

## Setup Wizard Features

The interactive setup wizard (`pnpm setup:beta` or `pnpm setup:production`):

- ✅ Auto-detects PostgreSQL from Docker Compose
- ✅ Guides you through AI provider setup
- ✅ Creates admin user interactively
- ✅ Validates each step before proceeding
- ✅ Runs all migrations automatically
- ✅ Shows progress with clear feedback
- ✅ Supports non-interactive mode for CI/CD
- ✅ Works on Windows, Mac, and Linux

---

## Architecture

```
InsightGen Deployment
├── Interactive Mode (Default)
│   ├── pnpm setup:beta
│   ├── pnpm setup:production
│   └── Guided questions → auto setup
│
├── Non-Interactive Mode (CI/CD)
│   ├── pnpm setup --config=config.json
│   ├── Load config file → run automation
│   └── Useful for automation
│
└── Manual Mode (Advanced)
    ├── Manual .env editing
    ├── docker-compose up manually
    ├── npm run migrate manually
    └── See: DEPLOYMENT_MANUAL.md
```

---

## File Structure

```
docs/refactoring/
├── README.md (this index)
├── BETA_RELEASE_DEPLOYMENT_PREP.md        ← Beta guide (706 lines)
├── DEPLOYMENT_MANUAL.md                   ← Manual step-by-step (350 lines)
├── DEPLOYMENT_TROUBLESHOOTING.md          ← Common issues (400 lines)
├── UPGRADE_STRATEGY.md                    ← Version upgrades (300 lines)
├── FEATURE_FLAGS_REMOVAL_PLAN.md
├── MODEL_ROUTER_REFACTORING_COMPLETE.md
└── README-DEPLOYMENT.md                   ← Quick start

scripts/
├── setup.ts                               ← NEW: Interactive wizard
└── ... other scripts

lib/config/
├── validation.ts                          ← NEW: Zod schemas
└── deployment-config.ts                   ← NEW: Config manager
```

---

## Technologies Used

- **chalk** — Colored terminal output
- **listr2** — Task progress display
- **ora** — Spinners for async operations
- **pg** — PostgreSQL client (via existing dependencies)
- **zod** — Configuration validation (via existing dependencies)

---

## Related Documentation

- **Main README:** `readme.md`
- **Project Rules:** `.cursor/rules/`
- **Compatibility Policy:** `.cursor/rules/20-compatibility.mdc`

---

**Last updated:** February 3, 2026  
**Status:** Complete and Ready for Use

