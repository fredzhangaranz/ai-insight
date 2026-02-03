# Deployment Documentation

**Single entry point for all deployment guides.**

---

## Beta deployment (office network)

**Use this for:** Controlled beta testing; developers clone repo and run `pnpm dev` with PostgreSQL via Docker.

→ **[BETA_RELEASE_DEPLOYMENT_PREP.md](./BETA_RELEASE_DEPLOYMENT_PREP.md)**

- Clone + `pnpm dev` + Docker PostgreSQL
- Environment: `env.local.example` → `.env.local`
- No Docker image build; no ACR/Kubernetes

---

## Production / Docker deployment

**Use this for:** On-premises or Azure; Docker image export/import or full-stack deployment.

| Document | Purpose |
|----------|---------|
| [README-DEPLOYMENT.md](./README-DEPLOYMENT.md) | Full deployment guide (credentials, options, troubleshooting) |
| [DEPLOYMENT-PACKAGE.md](./DEPLOYMENT-PACKAGE.md) | Creating and distributing the deployment package for customers |

---

## Quick reference

| Scenario | Document |
|----------|----------|
| Deploy beta on office network | `BETA_RELEASE_DEPLOYMENT_PREP.md` |
| Production Docker / on-prem | `README-DEPLOYMENT.md` |
| Build and ship deployment package | `DEPLOYMENT-PACKAGE.md` |

---

**Last updated:** Feb 3, 2026
