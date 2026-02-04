# Deployment UX Comparison

## Current Experience (Manual)

### Beta Deployment: 12 Steps (20-30 minutes)

```
1. git clone <repo>
2. cd insight-gen
3. cp env.local.example .env.local
4. vim .env.local                    ← User must find correct values, read docs
5. docker-compose up -d db
6. sleep 10                          ← Wait for DB to be ready
7. pnpm install
8. npm run migrate                   ← Can fail silently if DB not ready
9. npm run seed-admin               ← Requires env vars; errors if DB down
10. npm run seed-template-catalog    ← Must wait for previous step
11. pnpm dev
12. curl http://localhost:3005       ← Verify it works
```

**Problems:**
- ❌ Multiple manual steps
- ❌ Easy to miss a step or env variable
- ❌ No validation until you try to run
- ❌ If a script fails, unclear what went wrong
- ❌ Must reference multiple docs

### Production Deployment: 15+ Steps (30-45 minutes)

```
1. Read: README-DEPLOYMENT.md
2. Read: DEPLOYMENT-PACKAGE.md
3. Read: .cursor/rules/20-compatibility.mdc     ← Check compatibility requirements
4. Create .env.production manually
5. Validate with: ./scripts/validate-credentials.sh
6. ./scripts/deploy.sh build                    ← Build Docker image (5-10 min)
7. ./scripts/deploy.sh export                   ← Export as tar (slow on large images)
8. Transfer insight-gen.tar to server           ← Manual transfer
9. On server: docker load < insight-gen.tar
10. docker-compose up -d postgres               ← Set up DB on server
11. docker run ... insight-gen:latest           ← Manual docker run command
12. Manually run migrations inside container
13. Manually seed admin user
14. Manually seed templates
15. Verify with curl / browser
```

**Problems:**
- ❌ Must read 3+ documents
- ❌ Manual credential configuration
- ❌ Fragile transfer process
- ❌ Easy to get syntax wrong in docker run command
- ❌ No validation of setup
- ❌ If something fails, unclear where in the process

---

## Proposed Experience (Interactive Wizard)

### Beta Deployment: 1 Command (5-10 minutes)

```bash
$ pnpm setup:beta

🚀 InsightGen Deployment Wizard
────────────────────────────────

? Which deployment mode? (auto-detected: Beta)
✔ Beta (Office Network - Local Development)

? Start PostgreSQL Docker container? (y/n)
✔ Yes

✓ PostgreSQL started (localhost:5432)
✓ Waiting for database readiness... [2s]

? AI Provider Setup
✔ Anthropic Claude (recommended)

? Anthropic API Key: •••••••••••••••••

✓ Credentials validated

? Admin User
Username: admin
Email: admin@silhouette.local
Password (min 8 chars): ••••••••••

Running setup...
  ✓ Database connection verified (50ms)
  ✓ Migrations completed (2.3s)
  ✓ Admin user created (120ms)
  ✓ Template catalog loaded (890ms)
  ✓ AI config seeded (50ms)

✅ Setup Complete!

Next steps:
  1. pnpm dev
  2. Open http://localhost:3005
  3. Login: admin / [password]

$ pnpm dev
- ready started server on 0.0.0.0:3005, url: http://localhost:3005
```

**Benefits:**
- ✅ Single command
- ✅ Guided step-by-step
- ✅ Validation at each step
- ✅ Progress indicators
- ✅ Clear next steps
- ✅ No documentation needed
- ✅ Works across Windows/Mac/Linux

### Production Deployment: 1 Command (10-15 minutes)

```bash
$ pnpm setup:production

🚀 InsightGen Deployment Wizard
────────────────────────────────

? Database Type
  PostgreSQL
❯ SQL Server
  MySQL

? Connection String: (paste your connection string)

✓ Connection verified

? Database Name: insight_gen_prod

? Deploy as:
  Docker Container
❯ Docker Image Export (transfer to another server)
  Docker Compose Stack

? AI Provider Setup
✔ Anthropic Claude
✔ Google Vertex AI

? Anthropic API Key: •••••••••••••••••

? Google Cloud Project ID: your-project-123
? Google Cloud Location: us-central1
? Path to service account JSON: ~/google-credentials.json

✓ Credentials validated

? Admin User
Username: admin
Email: ops@company.local
Password (min 8 chars): ••••••••••

Building Docker image...
  ✓ Building image (45s)
  ✓ Exporting to insight-gen.tar (12s)

✓ Image ready: insight-gen.tar (2.3GB)

Running migrations in container...
  ✓ Migrations completed (3.2s)
  ✓ Admin user created (120ms)
  ✓ Templates loaded (920ms)

✅ Setup Complete!

Next steps:
  1. Transfer insight-gen.tar to your server
  2. Run: docker load < insight-gen.tar
  3. Run: docker-compose up -d
  4. Access: http://your-server:3005
  5. Login: admin / [password]

Pro tip: Save this config
  $ pnpm setup:production --export-config > prod-setup.json
```

**Benefits:**
- ✅ All config in one place
- ✅ Validates before building image
- ✅ Progress feedback
- ✅ Automatic migration running
- ✅ Ready-to-deploy output
- ✅ Config is exportable/shareable
- ✅ No manual docker commands needed

---

## Comparison Matrix

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Commands to run** | 12 (beta) / 15+ (prod) | 1 per mode |
| **Documentation to read** | 3-4 guides | None (wizard explains) |
| **Configuration errors** | Caught at end | Caught immediately |
| **Time to deploy** | 20-45 min | 5-15 min |
| **Can re-run safely** | No (double-seeds) | Yes (idempotent) |
| **Works on Windows** | Maybe (bash issues) | Yes (Node-based) |
| **Error messages** | Cryptic | Clear suggestions |
| **Admin password set** | Manual in env var | Wizard-guided |
| **Database readiness check** | Manual wait | Automatic retry |
| **Credentials validation** | Manual script | Built-in |
| **Progress visibility** | None | Live updates |
| **Onboarding experience** | Overwhelming | Friendly |

---

## File Structure After Implementation

```
insight-gen/
├── scripts/
│   ├── setup.ts                    ← NEW: Interactive wizard
│   ├── deploy.sh                   ← KEEP: Docker build/push
│   ├── run-migrations.js           ← KEEP: Core migration logic
│   ├── seed-default-admin.js       ← KEEP: Core admin seeding
│   └── seed-template-catalog.js    ← KEEP: Core template loading
├── lib/
│   └── config/
│       ├── deployment-config.ts    ← NEW: Unified config
│       └── validation.ts           ← NEW: Zod schemas
├── docs/
│   └── refactoring/
│       ├── BETA_RELEASE_DEPLOYMENT_PREP.md      ← KEEP (reference)
│       ├── README-DEPLOYMENT.md                  ← SIMPLIFY (2 code blocks)
│       ├── DEPLOYMENT_MANUAL.md                  ← NEW: Step-by-step manual
│       ├── DEPLOYMENT_TROUBLESHOOTING.md         ← NEW: Common issues
│       └── DEPLOYMENT_ARCHITECTURE.md            ← NEW: Technical deep-dive
├── README-DEPLOYMENT.md            ← SIMPLIFY: Just links & quick start
└── DEPLOYMENT_STRATEGY_PROPOSAL.md  ← NEW: This proposal
```

---

## Questions to Drive Implementation

### Core Features
1. **Should wizard also build Docker images?**
   - ✅ Yes: All-in-one experience
   - ❌ No: Keep setup wizard lightweight; use `scripts/build-docker.sh`

2. **Should we auto-detect Docker Compose?**
   - ✅ Yes: Better UX
   - ❌ No: Always require manual input

3. **Non-interactive mode for CI/CD?**
   - ✅ Yes: `pnpm setup --config=prod.json`
   - ❌ No: Only interactive mode

### Scope
4. **Multi-database support?**
   - ✅ PostgreSQL only (MVP)
   - ❌ PostgreSQL + SQL Server + MySQL

5. **Credential management?**
   - ✅ Interactive entry + validation
   - ❌ Assume env vars already set

### UX
6. **Show sensitive values after entry?**
   - ✅ Ask each time (safer)
   - ❌ Remember from `.env` file (faster)

---

**This proposal is ready for your feedback. What would you like to adjust?**
