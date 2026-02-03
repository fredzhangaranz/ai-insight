# Deployment Guide

**InsightGen is easy to deploy.** Choose your deployment method below—the setup wizard handles everything.

---

## 🚀 Quick Start

### Beta Deployment (Local Office Network)
For office developers or testing environments:

```bash
git clone <repo-url>
cd insight-gen
pnpm setup:beta
```

The wizard will guide you through:
- PostgreSQL setup (auto-detects Docker container)
- AI provider configuration (Anthropic, Google Vertex, or OpenWebUI)
- Admin user creation
- Database migrations & seeding
- Next steps

**Time:** 5-10 minutes | **Platforms:** Mac, Linux, Windows

---

### Production Deployment (Docker / On-Premises)
For customer deployments:

```bash
git clone <repo-url>
cd insight-gen
pnpm setup:production
```

The wizard will guide you through:
- Database configuration (PostgreSQL)
- AI provider setup
- Admin user creation
- Full automation

**Time:** 10-15 minutes | **Platforms:** Mac, Linux, Windows

---

## 🔧 Advanced Usage

### Non-Interactive Mode (CI/CD)
For automated deployments:

```bash
# Load config from JSON file
pnpm setup --config=deployment-config.json

# Export current configuration
pnpm setup --export-config=config-backup.json
```

### Manual / Step-by-Step
If you prefer manual control, see [DEPLOYMENT_MANUAL.md](./docs/refactoring/DEPLOYMENT_MANUAL.md).

---

## 📚 Reference Documentation

| Document | Purpose |
|----------|---------|
| **[DEPLOYMENT_MANUAL.md](./docs/refactoring/DEPLOYMENT_MANUAL.md)** | Step-by-step manual setup (for advanced users) |
| **[DEPLOYMENT_TROUBLESHOOTING.md](./docs/refactoring/DEPLOYMENT_TROUBLESHOOTING.md)** | Common issues and solutions |
| **[BETA_RELEASE_DEPLOYMENT_PREP.md](./docs/refactoring/BETA_RELEASE_DEPLOYMENT_PREP.md)** | Detailed beta deployment guide |
| **[DEPLOYMENT_INDEX.md](./docs/refactoring/DEPLOYMENT_INDEX.md)** | Full index of all deployment docs |

---

## 🎯 What You Get

| Feature | Beta | Production |
|---------|------|-----------|
| Auto-detect PostgreSQL | ✅ | — |
| Interactive guidance | ✅ | ✅ |
| Multiple AI providers | ✅ | ✅ |
| Admin user setup | ✅ | ✅ |
| Database migrations | ✅ | ✅ |
| Template catalog seeding | ✅ | ✅ |
| Non-interactive mode | ✅ | ✅ |

---

## ❓ Help

**Stuck?** Common issues are documented in [DEPLOYMENT_TROUBLESHOOTING.md](./docs/refactoring/DEPLOYMENT_TROUBLESHOOTING.md).

**Need manual setup?** See [DEPLOYMENT_MANUAL.md](./docs/refactoring/DEPLOYMENT_MANUAL.md) for step-by-step instructions.

---

**Ready?** Run `pnpm setup:beta` or `pnpm setup:production` to begin! 🚀
