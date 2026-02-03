# 🚀 Quick Start: New Deployment Wizard

**Your deployment is now interactive and beautiful!**

---

## Try It Now (3 Commands)

### Beta Deployment (Local)
```bash
pnpm setup:beta
```

### Production Deployment (Docker)
```bash
pnpm setup:production
```

### Help & Status
```bash
pnpm setup --help
```

---

## What Changed

### Before: Manual Steps ❌
```bash
# 12+ manual commands
git clone ...
cp env.local.example .env.local
vim .env.local                          # ← Edit manually
docker-compose up -d db                 # ← Manual
sleep 10                                # ← Wait manually
pnpm install
npm run migrate                         # ← Hope it works
npm run seed-admin                      # ← Hope it works
npm run seed-template-catalog           # ← Hope it works
pnpm dev
# Open browser, login, hope for the best
```

**Time:** 20-45 minutes  
**Error messages:** Often cryptic  
**Documentation to read:** 3+ guides

### After: Single Command ✅
```bash
pnpm setup:beta
# ✓ Auto-detects PostgreSQL
# ✓ Guides you through AI setup
# ✓ Creates admin user
# ✓ Runs all automation
# ✓ Shows progress live
# ✓ Next steps when done

pnpm dev
# Done!
```

**Time:** 5-10 minutes  
**Error messages:** Clear & actionable  
**Documentation to read:** None (wizard explains everything)

---

## Key Features

✨ **Auto-Detection**
- Finds your PostgreSQL from Docker automatically
- No connection string needed

✨ **Guided Setup**
- Step-by-step prompts
- Validates each input before continuing
- Clear error messages if something's wrong

✨ **Progress Feedback**
- See what's running
- Know how long it takes
- Know exactly what was done

✨ **Works Everywhere**
- Windows ✅
- Mac ✅
- Linux ✅

✨ **CI/CD Ready**
- Non-interactive mode for automation
- Export config for backup
- Idempotent (safe to re-run)

---

## File Structure

**New Files You Get:**
```
scripts/
└── setup.ts                    # The interactive wizard

lib/config/
├── validation.ts               # Validation schemas (Zod)
└── deployment-config.ts        # Config manager

docs/refactoring/
├── DEPLOYMENT_MANUAL.md        # Manual step-by-step
├── DEPLOYMENT_TROUBLESHOOTING.md  # Common issues
├── UPGRADE_STRATEGY.md         # Version upgrades
└── DEPLOYMENT_INDEX.md         # Master index

README-DEPLOYMENT.md            # Updated quick start
```

---

## Documentation

| Need | Read |
|------|------|
| **Quick start** | `README-DEPLOYMENT.md` |
| **Stuck during setup?** | `DEPLOYMENT_TROUBLESHOOTING.md` |
| **Want manual control?** | `DEPLOYMENT_MANUAL.md` |
| **Planning upgrades?** | `UPGRADE_STRATEGY.md` |
| **All docs** | `docs/refactoring/DEPLOYMENT_INDEX.md` |

---

## npm Scripts

```bash
pnpm setup              # Interactive, auto-detect mode
pnpm setup:beta         # Interactive, beta mode
pnpm setup:production   # Interactive, production mode

# Advanced
pnpm setup --config=my-config.json           # Load from JSON
pnpm setup --export-config=backup.json       # Export config
```

---

## What Happens When You Run It?

```
$ pnpm setup:beta

🚀 InsightGen Deployment Wizard
────────────────────────────────

1️⃣  Database
  ✓ Auto-detected PostgreSQL at localhost:5432

2️⃣  AI Provider
  ? Enable Anthropic Claude? y
  ? API Key? ••••••••••

3️⃣  Admin User
  ? Username? admin
  ? Email? admin@local
  ? Password? ••••••••••

4️⃣  Automation
  ✓ Migrations (2.3s)
  ✓ Admin user (120ms)
  ✓ Templates (890ms)

✅ Done! Next: pnpm dev
```

---

## Technology Stack

- **chalk** — Pretty colored output
- **inquirer** (optional) — Fancy prompts
- **listr2** — Progress indicators
- **ora** — Spinners

**All lightweight, zero bloat!**

---

## Features by Mode

| Feature | Beta | Production |
|---------|------|------------|
| Auto-detect DB | ✅ | — |
| Manual DB config | ✅ | ✅ |
| AI provider setup | ✅ | ✅ |
| Admin user | ✅ | ✅ |
| Migrations | ✅ | ✅ |
| Templates | ✅ | ✅ |
| Non-interactive | ✅ | ✅ |

---

## Next Steps

### 1. Try It
```bash
pnpm setup:beta
```

### 2. If Stuck
```
See: docs/refactoring/DEPLOYMENT_TROUBLESHOOTING.md
```

### 3. For Production
```bash
pnpm setup:production
```

### 4. Manual Mode (Advanced)
```
See: docs/refactoring/DEPLOYMENT_MANUAL.md
```

---

## Questions?

✅ **"How do I upgrade?"**
See: `docs/refactoring/UPGRADE_STRATEGY.md`

✅ **"Can I automate it?"**
Yes: `pnpm setup --config=config.json`

✅ **"What if it breaks?"**
See: `docs/refactoring/DEPLOYMENT_TROUBLESHOOTING.md`

✅ **"Manual step-by-step?"**
See: `docs/refactoring/DEPLOYMENT_MANUAL.md`

---

## Comparison

| Aspect | Before | After |
|--------|--------|-------|
| Setup time | 20-45 min | 5-15 min |
| Manual steps | 12-15 | 1 |
| Error messages | Cryptic | Clear |
| Platform support | Some issues | Full (Win/Mac/Linux) |
| Documentation | 3+ guides | None (self-explanatory) |
| Can re-run | No (duplicates) | Yes (idempotent) |
| CI/CD support | No | Yes |
| User experience | Confusing | Friendly |

---

## Ready?

```bash
$ pnpm setup:beta
# Let's go! 🚀
```

---

**Last updated:** February 3, 2026
