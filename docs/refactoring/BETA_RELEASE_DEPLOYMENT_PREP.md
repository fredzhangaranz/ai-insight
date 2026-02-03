# Beta Release Deployment Preparation

**Target:** Office Network Beta Deployment  
**Status:** Pre-Release Checklist  
**Date:** February 2026  
**Deployment Model:** Clone + `pnpm dev` (PostgreSQL only via Docker)

---

## Overview

This guide prepares InsightGen for controlled beta testing on your office network. Developers will clone the repository, set up PostgreSQL via Docker Compose, and run the app locally using `pnpm dev`.

**Scope:**

- Deployment strategy for local network (not Docker image-based)
- Environment configuration (no feature flags — Chart Insights, Templates, Audit Dashboard, and semantic search are always on)
- Database setup
- Pre-flight checks
- Known issues & workarounds
- Quick start guide for office developers

---

## Part 1: Deployment Architecture

### Deployment Model

```
+------------------------+
| Office Developer PC    |
|                        |
| ┌────────────────────┐ |
| │ InsightGen App     │ |
| │ (pnpm dev)         │ |
| │ Port: 3005         │ |
| └────────────────────┘ |
|         ↓              |
| ┌────────────────────┐ |
| │ PostgreSQL (Docker)│ |
| │ Port: 5432         │ |
| │ (docker-compose)   │ |
| └────────────────────┘ |
|                        |
+------------------------+
        ↓
+------------------------+
| Office Network         |
| (access via hostname)  |
+------------------------+
```

### What's NOT Included

- ❌ Docker image build (`Dockerfile.prod`)
- ❌ Docker image deployment (`docker-compose.prod.yml`)
- ❌ Azure Container Registry (ACR) deployment
- ❌ Kubernetes/cloud deployment

These remain available for future production deployment but are **not used for beta**.

---

## Part 2: Environment Setup

### 2.1 Clone & Initial Setup

**For each office developer:**

```bash
# Clone repository
git clone <repo-url>
cd insight-gen

# Copy environment template
cp env.local.example .env.local

# Edit .env.local with actual values
vim .env.local
```

### 2.2 `.env.local` Configuration

**Sample configuration for beta testing:**

```env
# =============================================================================
# DATABASE (PostgreSQL - provided by docker-compose)
# =============================================================================
INSIGHT_GEN_DB_URL="postgresql://user:password@localhost:5432/insight_gen_db"

# =============================================================================
# AI PROVIDERS (Choose one or more)
# =============================================================================

# Anthropic Claude (recommended for reliability)
ANTHROPIC_API_KEY="sk-ant-api03-YOUR_KEY_HERE"
ANTHROPIC_DEFAULT_MODEL_NAME="claude-3-5-sonnet-20240620"

# Google Vertex AI (optional)
# GOOGLE_CLOUD_PROJECT="your-project-id"
# GOOGLE_CLOUD_LOCATION="us-central1"
# GOOGLE_APPLICATION_CREDENTIALS="path/to/credentials.json"
# GOOGLE_DEFAULT_MODEL_NAME="gemini-2.5-pro"

# Open WebUI (optional, for local LLM)
# OPENWEBUI_BASE_URL="http://localhost:3000"
# OPENWEBUI_API_KEY="your-api-key"

# =============================================================================
# APPLICATION CONFIGURATION
# =============================================================================
NODE_ENV=development
PORT=3005

# =============================================================================
# AUTHENTICATION & SESSION
# =============================================================================
NEXTAUTH_SECRET="1bTpPH8q6lUJwFG41iP7PU2FFQxydEEXZKGKlC5ZAPY="
NEXTAUTH_URL="http://localhost:3005"
NEXTAUTH_SESSION_MAX_AGE="604800"

# Bootstrap admin user (first login)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="ChangeMe123!"
ADMIN_EMAIL="admin@yourdomain.local"
ADMIN_FULL_NAME="System Administrator"

# Enable authentication system
AUTH_SYSTEM_ENABLED="true"

# =============================================================================
# DATABASE ENCRYPTION & SECURITY
# =============================================================================
DB_ENCRYPTION_KEY="2d6ddaba554afd293fb5787dcc937049e8017d400a58415208391ff829b0aedf"
ENTITY_HASH_SALT="WorQm963w8XVVbywC1PsHmEIfaI3JwTv2JQT4Lp32cw="

# Note: Chart Insights, Templates, Audit Dashboard, and semantic (concept-ID)
# search are always on; no feature flags. See FEATURE_FLAGS_REMOVAL_PLAN.md.

# =============================================================================
# LOGGING & DEBUG (Optional, for troubleshooting)
# =============================================================================
LOG_LLM_PROMPTS=true
DEBUG_COMPOSITION=true
```

**Important Notes:**

- Replace `ANTHROPIC_API_KEY` with your actual key (or choose another provider)
- Keep `NEXTAUTH_SECRET` consistent across all office deployments
- The admin user created on first run uses credentials above
- Chart Insights, Templates, Audit Dashboard, and semantic search are always on (feature flags were removed post-beta)

### 2.3 Credential Management

**For Google Vertex AI (if used):**

```bash
# Place credentials file in project root
cp ~/path/to/google-credentials.json ./

# Update .env.local:
GOOGLE_APPLICATION_CREDENTIALS="./google-credentials.json"
```

**For other AI providers:**

- Follow their documentation to get API keys
- Store in `.env.local` only (never commit to git)
- `.gitignore` automatically excludes `.env.local`

---

## Part 3: Database Setup

### 3.1 Start PostgreSQL

```bash
# Start PostgreSQL container in background
docker-compose up -d db

# Verify it's running
docker-compose ps

# Output should show:
# NAME              STATUS
# insight-gen-db-1  Up (healthy)
```

### 3.2 Run Migrations

**One-time setup:**

```bash
# Install dependencies first (if not done)
pnpm install

# Run all migrations (creates schema)
npm run migrate

# Output should show:
# ✅ Migration complete: 000_create_ai_insight_table.sql
# ✅ Migration complete: 001_create_ai_analysis_plan_cache.sql
# ... (48 migrations total)
```

**To verify migrations:**

```bash
npm run check-tables

# Output shows all tables created
```

### 3.3 Seed Initial Data (Optional)

```bash
# Seed admin user
npm run seed-admin

# Output:
# ✅ Admin user created: admin@yourdomain.local
# ℹ️  Use ADMIN_USERNAME/ADMIN_PASSWORD from .env.local to login

# Seed AI configuration (optional)
npm run seed-ai-config

# Output:
# ✅ AI config seeded
```

---

## Part 4: Application Startup

### 4.1 First Time Start

```bash
# Install dependencies (if not already done)
pnpm install

# Start development server
pnpm dev

# Output:
# > next dev -p 3005
# - ready started server on 0.0.0.0:3005, url: http://localhost:3005
# - event compiled /app/page (192ms)
# - wait compiling /login...
# - event compiled /login (1.2s)
```

### 4.2 Verify It's Running

**In another terminal:**

```bash
# Test API endpoint
curl -s http://localhost:3005/api/health || echo "Not ready yet"

# Once running, visit browser:
# http://localhost:3005
```

### 4.3 Troubleshooting Startup

**If database connection fails:**

```bash
# Check PostgreSQL is running
docker-compose ps db

# If not running:
docker-compose up -d db

# Wait 10 seconds for database to be ready
sleep 10

# Try pnpm dev again
pnpm dev
```

**If port 3005 is in use:**

```bash
# Change port in .env.local:
PORT=3006

# Or kill process using 3005:
lsof -ti:3005 | xargs kill -9
```

**If migrations fail:**

```bash
# Check database connection
psql postgresql://user:password@localhost:5432/insight_gen_db -c "SELECT 1"

# If that fails, reset database:
docker-compose down
docker volume rm insight-gen_postgres_data  # WARNING: Deletes all data
docker-compose up -d db
npm run migrate
```

---

## Part 5: First-Time User Guide

Once the app is running, users should:

### 5.1 Login

1. Navigate to `http://localhost:3005/login`
2. Use credentials from `.env.local`:
   - **Username:** `admin`
   - **Password:** Value of `ADMIN_PASSWORD`
3. Click **Sign In**

### 5.2 Main Features to Test

#### Chart Insights / Dashboard

- **URL:** `http://localhost:3005/dashboard`
- **What to test:**
  - Create new insights (select form → generate question)
  - Bind insights to dashboard panels
  - Execute queries and view charts
  - Save insights for later

#### Query Templates

- **URL:** `http://localhost:3005/templates`
- **What to test:**
  - Browse available templates
  - Create new template from query
  - Test template matching in insights

#### Audit Dashboard

- **URL:** `http://localhost:3005/admin/audit`
- **What to test:**
  - View query execution logs
  - Check performance metrics
  - Review SQL validation results
  - Check clarification audit trail

#### Analysis / Schema Viewer

- **URL:** `http://localhost:3005/analysis/schema`
- **What to test:**
  - Browse available forms
  - View field semantics
  - Check ontology mappings

---

## Part 6: Pre-Flight Checks

### 6.1 Pre-Deployment Verification

**Before handing off to office developers, run:**

```bash
# Clean install
rm -rf node_modules package-lock.json
pnpm install

# Lint check
pnpm lint

# Run tests
pnpm test:run

# Build check
pnpm build

# Start app and verify
pnpm dev &
sleep 10
curl -s http://localhost:3005 | grep -q "<html>" && echo "✅ App running"
```

### 6.2 Database Pre-Flight

```bash
# Start PostgreSQL
docker-compose up -d db

# Wait for readiness
sleep 5

# Verify connection
psql postgresql://user:password@localhost:5432/insight_gen_db -c "\dt"

# Should list all 48 migrations' tables
```

### 6.3 Checklist

- [ ] Environment template file exists: `env.local.example` is clear and complete
- [ ] All 48 migrations are in `database/migration/`
- [ ] No uncommitted `.env.local` or credentials in git
- [ ] Docker Compose works: `docker-compose up -d db` succeeds
- [ ] Migrations run cleanly: `npm run migrate` completes
- [ ] App starts: `pnpm dev` reaches "ready" state
- [ ] Login works with admin credentials
- [ ] Basic insight creation works
- [ ] Dashboard loads without errors
- [ ] Audit dashboard visible to admin
- [ ] Tests pass: `pnpm test:run`

---

## Part 7: Network Deployment

### 7.1 Local Network Access

**If developers want to access the app from other machines on the office network:**

```bash
# Find local IP address
ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1
# Example output: inet 192.168.1.100

# Update .env.local
NEXTAUTH_URL="http://192.168.1.100:3005"

# Restart pnpm dev
# Ctrl+C to stop
pnpm dev

# Other machines can now access:
# http://192.168.1.100:3005
```

**Important:**

- This works only on local LAN; not suitable for remote access
- If app is behind a firewall, may need IT approval to open port 3005
- For security, use VPN or SSH tunneling for remote access

### 7.2 Multi-User Setup

**For multiple developers on the same network:**

Option A: **Each developer runs their own instance**

- Each clones repo, runs `docker-compose up db`, and `pnpm dev`
- Each has separate port (3005, 3006, 3007, etc.)
- Easier, more isolation, but more resource usage

Option B: **Shared PostgreSQL, separate app instances**

- One machine runs `docker-compose up db`
- Others point `DATABASE_URL` to that machine
- Saves resources, but database is single point of failure

Option C: **Central app server + multi-user**

- One machine runs both DB and app
- Others access via local network
- Simplest for users, but server is SPOF

---

## Part 8: Known Issues & Workarounds

### 8.1 Common Issues

| Issue                              | Symptom                                | Workaround                                                                            |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| Database migration fails           | `ERROR: relation "..." already exists` | Run: `docker-compose down && docker volume rm insight-gen_postgres_data` then restart |
| Port 3005 already in use           | `Error: listen EADDRINUSE :::3005`     | Change `PORT` in `.env.local` or kill process: `lsof -ti:3005 \| xargs kill -9`       |
| `ANTHROPIC_API_KEY` not set        | Insights fail silently                 | Add valid key to `.env.local` and restart                                             |
| Login always redirects to `/login` | Session not persisting                 | Verify `NEXTAUTH_SECRET` and `NEXTAUTH_URL` match in `.env.local`                     |
| Database connection timeout        | `Error: connect ECONNREFUSED`          | Wait 10 seconds after `docker-compose up db`, then retry                              |
| TypeScript errors in IDE           | Editor shows red squiggles             | Run `pnpm install` and restart IDE                                                    |

### 8.2 Debugging Tips

```bash
# Check PostgreSQL logs
docker-compose logs db

# Check app logs
pnpm dev  # Logs appear in console

# Check environment is correct
node -e "console.log(process.env.DATABASE_URL)"

# Check all tables created
psql postgresql://user:password@localhost:5432/insight_gen_db -c "\dt"

# Clear Next.js cache
rm -rf .next

# Full clean rebuild
rm -rf .next node_modules package-lock.json
pnpm install
pnpm build
```

### 8.3 Performance Notes

- First build takes ~2 minutes (TypeScript compilation)
- Subsequent builds take ~10-30 seconds
- Hot reload works for `.tsx` and `.ts` files
- Database queries should be <1s for most operations
- If slow, check: AI API latency, database performance, network

---

## Part 9: Quick Reference

### Quick Start for Office Developers

```bash
# 1. Clone and setup
git clone <repo>
cd insight-gen
cp env.local.example .env.local
# Edit .env.local with your AI API key

# 2. Start PostgreSQL
docker-compose up -d db

# 3. Setup dependencies and database
pnpm install
npm run migrate

# 4. Start app
pnpm dev

# 5. Open browser
# http://localhost:3005
# Login with: admin / ChangeMe123! (or your password from .env.local)
```

### Useful Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm lint             # Run linter
pnpm test:run         # Run tests

# Database
npm run migrate       # Run pending migrations
npm run check-tables  # List all tables
npm run seed-admin    # Create admin user

# Docker
docker-compose ps    # Show running containers
docker-compose logs  # Show logs
docker-compose down  # Stop all services
docker-compose up -d db  # Start only PostgreSQL
```

### Ports & URLs

| Service      | URL                           | Notes                 |
| ------------ | ----------------------------- | --------------------- |
| **App**      | `http://localhost:3005`       | Main web app          |
| **Database** | `localhost:5432`              | PostgreSQL (internal) |
| **API**      | `http://localhost:3005/api/*` | REST endpoints        |

---

## Part 10: Feedback & Reporting Issues

### For Beta Testers

**How to report bugs:**

1. **Clear title:** "Dashboard chart rendering slow" (not "app broken")
2. **Steps to reproduce:** Exact clicks/actions to recreate issue
3. **Expected vs actual:** What should happen vs what happened
4. **Environment:** Browser, OS, network conditions
5. **Screenshots/logs:** Include if helpful

**Format:**

```
Title: [Feature] Brief description

Steps to reproduce:
1. Login as admin
2. Go to /dashboard
3. Click "Bind Insight"
4. ...

Expected: Insight binds to panel
Actual: Error message appears

Environment:
- Browser: Chrome 124
- OS: Windows 11
- Time: Feb 3, 2026 10:45 AM

Logs/Screenshots:
[attach if available]
```

### For Developers

**Post-beta tasks:**

- Collect feedback from office testers
- Prioritize bugs vs. enhancements
- Plan Phase 2 improvements
- Document lessons learned
- Prepare for production rollout

---

## Part 11: Post-Beta Checklist

After beta feedback is collected:

### Refactoring Phase

- [x] Remove feature flags (completed; see `FEATURE_FLAGS_REMOVAL_PLAN.md`)
- [ ] Clean up one-off debug scripts
- [ ] Archive internal documentation
- [ ] Update environment examples (feature-flag vars already removed from examples)

### Testing Phase

- [ ] Run full test suite
- [ ] Perform smoke tests on new environment
- [ ] Load testing (simulate office network usage)
- [ ] Security audit (if not done)

### Documentation Phase

- [ ] Create production deployment guide
- [ ] Create user onboarding guide
- [ ] Create admin/troubleshooting guide
- [ ] Update README for production deployment

### Deployment Phase

- [ ] Build and test Docker image (`Dockerfile.prod`)
- [ ] Create production `.env.production.example`
- [ ] Test in staging environment
- [ ] Plan rollout schedule

---

## Appendix: File Structure

**Key deployment files:**

```
insight-gen/
├── .env.local                 # ← EDIT THIS (git ignored)
├── env.local.example          # ← Template (git tracked)
├── docker-compose.yml         # ← Dev setup (PostgreSQL + app)
├── docker-compose.prod.yml    # ← Production (Docker image)
├── package.json               # ← Dependencies & scripts
├── pnpm-lock.yaml             # ← Lock file
├── database/
│   └── migration/             # ← 48 schema migrations
├── app/
│   ├── api/                   # ← API routes
│   ├── dashboard/             # ← Dashboard page
│   ├── insights/              # ← Insights page
│   ├── admin/                 # ← Admin pages
│   └── ...
├── lib/
│   ├── services/              # ← Business logic
│   ├── config/                # ← Configuration
│   └── ...
└── docs/
    ├── refactoring/           # ← Refactoring guides
    └── ...
```

---

## Related Documentation

- **Deployment index (all deployment guides):** `docs/refactoring/DEPLOYMENT_INDEX.md` — beta, production, and package guides
- **Production / Docker deployment:** `docs/refactoring/README-DEPLOYMENT.md`, `docs/refactoring/DEPLOYMENT-PACKAGE.md`
- **Feature Flags Removal (completed):** `docs/refactoring/FEATURE_FLAGS_REMOVAL_PLAN.md` — all flags removed; features are always on
- **Database Migrations:** `database/migration/README.md` (if exists, or create)
- **Architecture:** `readme.md`
- **Development:** `docs/` folder

---

## Version History

| Version | Date        | Changes                                                              |
| ------- | ----------- | -------------------------------------------------------------------- |
| 1.0     | Feb 3, 2026 | Initial beta deployment guide                                        |
| 1.1     | Feb 3, 2026 | Updated for feature-flag removal: env sample and post-beta checklist |

---

**Last Updated:** Feb 3, 2026  
**Next Review:** After beta testing period completes
