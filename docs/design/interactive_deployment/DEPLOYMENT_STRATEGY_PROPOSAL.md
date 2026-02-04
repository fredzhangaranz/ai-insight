# Deployment Strategy Proposal: Interactive Setup Wizard

**Date:** February 3, 2026  
**Status:** Proposal for Review  
**Goal:** Replace manual deployment steps with a single, interactive, self-explanatory onboarding command

---

## Current State Analysis

### Problems with Current Approach

1. **Multiple Manual Steps:** Users must:
   - Clone repo
   - Copy `.env.local.example` → `.env.local` and edit
   - Start PostgreSQL with Docker Compose
   - Run `npm run migrate`
   - Run `npm run seed-admin`
   - Run `npm run seed-template-catalog`
   - Run `pnpm dev`
   - Read 3+ deployment documents to understand the process

2. **Error-Prone:** Each step can fail silently or with cryptic errors
3. **Poor UX:** No guidance; users must refer to documentation
4. **Scattered Configuration:** Environment variables spread across multiple docs; easy to miss fields

### Current Asset Inventory

**Existing Scripts:**
- `scripts/run-migrations.js` — Database migrations
- `scripts/seed-default-admin.js` — Create first admin user
- `scripts/seed-template-catalog.js` — Load template catalog
- `scripts/seed-ai-config.js` — Configure AI providers
- `scripts/validate-credentials.sh` — Validate `.env.production` (bash)
- `scripts/deploy.sh` — Docker build/push (bash)

**Environment Files:**
- `env.local.example` — Development config template
- `env.production.example` — Production config template

**Deployment Documentation:**
- `BETA_RELEASE_DEPLOYMENT_PREP.md` (706 lines) — Beta deployment
- `README-DEPLOYMENT.md` (production guide)
- `DEPLOYMENT-PACKAGE.md` (Docker packaging guide)

---

## Proposed Solution: Single Interactive Setup Wizard

### Architecture

Create a **single, user-friendly CLI setup wizard** (`scripts/setup.ts`) that:

```
┌─────────────────────────────────────────────────────────┐
│  🚀 InsightGen Deployment Wizard                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Welcome! Let's set up InsightGen.                      │
│                                                         │
│  This wizard will guide you through:                    │
│  1. Choosing deployment mode (Beta/Production)          │
│  2. Database setup                                      │
│  3. AI provider configuration                           │
│  4. Admin user creation                                 │
│  5. Running migrations & seeds                          │
│  6. Starting the application                            │
│                                                         │
│  Estimated time: 5-10 minutes                           │
│  ❯ Press Enter to begin...                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Key Features

#### 1. **Deployment Mode Selection**
   - Interactive choice: Beta (local dev) or Production (Docker)
   - Different workflows per mode

#### 2. **Database Configuration**
   - Auto-detect PostgreSQL from running Docker container
   - Or allow manual configuration
   - Validate connection before proceeding

#### 3. **AI Provider Setup**
   - Guide user through provider selection (Anthropic, Google Vertex, OpenWebUI)
   - Step-by-step credential entry
   - Validate credentials before saving
   - Save to `.env.local` or `.env.production`

#### 4. **Admin User Creation**
   - Prompt for username, email, password
   - Validate password strength (min 8 chars)
   - Set default admin full name
   - Option to save for later (`seed-admin`)

#### 5. **Automated Setup**
   - Run all migrations automatically
   - Load template catalog
   - Seed AI config if provided
   - Provide progress indicators
   - Clear error messages if anything fails

#### 6. **Post-Setup Summary**
   - Show what was configured
   - Next steps (start app, login credentials, useful URLs)
   - Troubleshooting tips if issues detected

---

## Implementation Plan

### Phase 1: Create Setup Wizard CLI

**File:** `scripts/setup.ts`

```typescript
// Pseudo-code structure
class DeploymentWizard {
  // Lifecycle methods
  async run(): Promise<void>
  
  // Step 1: Welcome & Mode Selection
  async selectDeploymentMode(): Promise<'beta' | 'production'>
  
  // Step 2: Database Setup
  async configureDatabse(): Promise<DatabaseConfig>
  async detectPostgres(): Promise<DatabaseConfig | null>
  async validateDatabaseConnection(config: DatabaseConfig): Promise<boolean>
  
  // Step 3: AI Providers
  async configureAIProviders(): Promise<AIProviderConfig>
  async promptAnthropicSetup(): Promise<AnthropicConfig | null>
  async promptGoogleSetup(): Promise<GoogleConfig | null>
  async promptOpenWebUISetup(): Promise<OpenWebUIConfig | null>
  
  // Step 4: Admin User
  async setupAdminUser(): Promise<AdminUserConfig>
  async validatePassword(password: string): Promise<boolean>
  
  // Step 5: Run Automation
  async runMigrations(): Promise<boolean>
  async seedAdminUser(config: AdminUserConfig): Promise<boolean>
  async seedTemplateCatalog(): Promise<boolean>
  async seedAIConfig(config: AIProviderConfig): Promise<boolean>
  
  // Step 6: Summary & Next Steps
  async showSummary(config: CompleteConfig): Promise<void>
  async offerToStartApp(): Promise<boolean>
}
```

### Phase 2: Consolidate Environment Configuration

**File:** `lib/config/deployment-config.ts`

- Unified interface for `.env.local` and `.env.production`
- Validation schemas using Zod
- Auto-generation of config files
- Smart defaults based on deployment mode

### Phase 3: Update npm Scripts

```json
{
  "setup": "tsx scripts/setup.ts",
  "setup:beta": "tsx scripts/setup.ts --mode=beta",
  "setup:production": "tsx scripts/setup.ts --mode=production"
}
```

### Phase 4: Create Simplified README-DEPLOYMENT.md

Replace current complex guide with:

```markdown
# InsightGen Deployment

## Quick Start (5 minutes)

### Beta (Office Network - Local Development)
```bash
pnpm setup:beta
```

### Production (Docker - Customer On-Prem/Cloud)
```bash
pnpm setup:production
```

That's it! The wizard guides you through everything.

---

### For Advanced Users
- [Manual Configuration Guide](./DEPLOYMENT_MANUAL.md)
- [Full API Reference](./docs/refactoring/BETA_RELEASE_DEPLOYMENT_PREP.md)
- [Architecture Documentation](./docs/refactoring/README-DEPLOYMENT.md)
```

### Phase 5: Update Refactoring Folder

Move advanced/reference docs to:
- `docs/refactoring/DEPLOYMENT_MANUAL.md` — step-by-step manual guide
- `docs/refactoring/DEPLOYMENT_ARCHITECTURE.md` — technical deep-dive
- `docs/refactoring/DEPLOYMENT_TROUBLESHOOTING.md` — common issues & fixes

---

## Technology Stack

### Dependencies to Add

```json
{
  "devDependencies": {
    "chalk": "^5.3.0",           // Colored terminal output
    "inquirer": "^9.2.0",        // Interactive prompts
    "listr2": "^8.0.0",          // Progress indicators
    "ora": "^8.0.0",             // Spinners
    "dotenv": "^17.2.3"          // Already present
  }
}
```

### Why These?

- **chalk**: Beautiful colored terminal output (modern, not verbose)
- **inquirer**: Battle-tested interactive prompts (select, input, confirm, password)
- **listr2**: Task lists with progress indicators (like Yarn's installer)
- **ora**: Elegant spinners for long-running operations

---

## User Experience Examples

### Example 1: Beta Setup (5 minutes)

```
🚀 InsightGen Deployment Wizard
────────────────────────────────

? Which deployment mode?
❯ Beta (Office Network - Local Development)
  Production (Docker - Customer On-Prem)

? PostgreSQL Configuration
❯ Auto-detect from Docker Compose
  Manual configuration

✅ Found PostgreSQL at localhost:5432

? AI Provider Setup
Select at least one:
✔ Anthropic Claude (recommended)
  Google Vertex AI
  Open WebUI

? Anthropic API Key: ••••••••••••••••••

✅ Credentials validated

? Admin User Setup
Username: admin
Email: admin@yourdomain.local
Password (min 8 chars): ••••••••••

Running setup...
  ✓ Database connection verified (50ms)
  ✓ Migrations completed (2.3s)
  ✓ Admin user created (120ms)
  ✓ Template catalog loaded (890ms)
  ✓ AI config seeded (50ms)

✅ Setup complete!

Next steps:
  1. Start the app: pnpm dev
  2. Open browser: http://localhost:3005
  3. Login: admin / [password]
  4. Begin testing!

Questions? See: docs/deployment/TROUBLESHOOTING.md
```

### Example 2: Production Setup (10 minutes)

```
🚀 InsightGen Deployment Wizard
────────────────────────────────

? Which deployment mode?
  Beta (Office Network - Local Development)
❯ Production (Docker - Customer On-Prem)

? Database Type
❯ PostgreSQL
  SQL Server
  MySQL

? Database Connection String: postgresql://user:pass@prod-db:5432/insight_gen

✅ Connection verified (200ms)

? AI Provider Setup
Select at least one:
✔ Anthropic Claude
  Google Vertex AI (requires service account)
  Open WebUI (local LLM)

? Anthropic API Key: ••••••••••••••••••

✅ Credentials validated

? Admin User Setup
Username: admin
Email: admin@yourdomain.local
Password (min 8 chars): ••••••••••

? Docker Image Configuration
Deploy as:
❯ Docker Container (on this server)
  Docker Image Export (transfer to another server)
  Docker Compose Stack

Running setup...
  ✓ Build Docker image (45s)
  ✓ Run migrations in container (3.2s)
  ✓ Create admin user (150ms)
  ✓ Load template catalog (920ms)
  ✓ Start application container (2.1s)

✅ Setup complete!

Application running at:
  Web: http://localhost:3005
  API: http://localhost:3005/api

Login credentials:
  Username: admin
  Password: [as configured]

Next steps:
  1. Verify app at http://localhost:3005
  2. Login with admin credentials
  3. Configure users via admin panel
  4. Begin production testing

Questions? See: docs/deployment/TROUBLESHOOTING.md
```

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Single Command** | Reduces 7+ manual steps to 1 |
| **Interactive Guidance** | No need to read docs; wizard explains each step |
| **Validation at Each Step** | Catch errors immediately, not after 10 minutes |
| **Idempotent** | Can re-run wizard safely; won't double-seed |
| **Progress Feedback** | Users see what's happening; no silent failures |
| **Error Recovery** | Clear messages; suggestions to fix issues |
| **Modern UX** | Matches tools like Vite, Supabase CLI, OpenClaw |
| **Consistent Across Environments** | Same experience for beta, production, Docker |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| User loses connection mid-setup | Save state; resume from checkpoint |
| Wizard too complex/slow | Keep to 5-10 questions max; parallelize where possible |
| Dependencies not available | Ship with prebuilt CLI (if using pkg/nexe) |
| Doesn't work on Windows | Use cross-platform Node libs; test on Win/Mac/Linux |
| Users still refer to old docs | Update all docs; add wizard link prominently |

---

## Timeline

- **Week 1:** Create setup wizard core + environment config
- **Week 2:** Add AI provider setup, validation, error handling
- **Week 3:** Test across Windows/Mac/Linux; refine UX
- **Week 4:** Update deployment docs; deprecate old guides

---

## Decision Points for You

1. **Should we support Docker image build in the wizard?**
   - Yes: Unified experience, but adds complexity
   - No: Keep setup wizard simple; use separate `scripts/build-docker.sh` for Docker

2. **Should we auto-detect Docker Compose?**
   - Yes: Better UX, but requires Docker to be running
   - No: Always require manual config

3. **Should we support 3+ database types (PostgreSQL, SQL Server, MySQL)?**
   - Yes: More flexibility, but more validation needed
   - No: Support PostgreSQL only initially; add others later

4. **Should we embed setup wizard in main README?**
   - Yes: Most users see it first
   - No: Keep as deployment-specific docs

---

## Next Steps

If you approve this approach, I will:

1. **Create `scripts/setup.ts`** — Interactive wizard (300-400 lines)
2. **Create `lib/config/deployment-config.ts`** — Unified config handling (200-300 lines)
3. **Update `package.json`** — Add `setup` commands
4. **Create simplified `README-DEPLOYMENT.md`** — Just two code blocks; rest is reference
5. **Move existing docs to `docs/refactoring/`** — Keep as reference, not primary guide

---

## Questions for You

1. Do you want the wizard to **also handle Docker image building**, or keep that separate?
2. Should the wizard **require user input** for all settings, or use smart defaults (e.g., auto-detect PostgreSQL)?
3. For production, should we support **multi-database backends** (PostgreSQL, SQL Server, MySQL), or PostgreSQL-only for now?
4. Should we create a **non-interactive mode** (for CI/CD)? E.g., `pnpm setup --non-interactive --config=prod.json`

---

**Ready to proceed? I'll create the wizard implementation once you confirm the approach and answer the questions above.**
