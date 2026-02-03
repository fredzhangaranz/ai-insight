# Deployment Manual: Step-by-Step Guide

**For advanced users who prefer manual control instead of the interactive wizard.**

**Estimated time:** 20-30 minutes  
**Difficulty:** Intermediate

---

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Beta Deployment](#beta-deployment)
3. [Production Deployment](#production-deployment)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)

---

## Before You Start

### Prerequisites

- **Git** (for cloning the repository)
- **Node.js** 18+ & **pnpm** (for running the app)
- **Docker & Docker Compose** (for PostgreSQL)
- **API Key** for at least one AI provider:
  - Anthropic Claude: https://www.anthropic.com/
  - Google Vertex AI: https://cloud.google.com/vertex-ai
  - OpenWebUI: https://openwebui.com/

### Repository Setup

```bash
# Clone repository
git clone <repo-url>
cd insight-gen

# Verify structure
ls -la
# Should show: .env.local.example, docker-compose.yml, scripts/, lib/, docs/
```

---

## Beta Deployment

### Step 1: Environment Configuration

```bash
# Copy template
cp env.local.example .env.local

# Edit with your values
nano .env.local  # or vim, code, etc.
```

**Key environment variables to set:**

```bash
# Database (update with your values if different)
INSIGHT_GEN_DB_URL="postgresql://user:password@localhost:5432/insight_gen_db"

# AI Provider (choose at least one)
ANTHROPIC_API_KEY="sk-ant-YOUR_KEY_HERE"
ANTHROPIC_DEFAULT_MODEL_NAME="claude-3-5-sonnet-20240620"

# OR for Google
GOOGLE_CLOUD_PROJECT="your-project-id"
GOOGLE_CLOUD_LOCATION="us-central1"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"

# Admin User (for first login)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="ChangeMe123!"
ADMIN_EMAIL="admin@yourdomain.local"
ADMIN_FULL_NAME="System Administrator"

# Optional debugging
DEBUG_COMPOSITION=false
LOG_LLM_PROMPTS=false
```

### Step 2: Start PostgreSQL

```bash
# Start PostgreSQL container in background
docker-compose up -d db

# Verify it's running
docker-compose ps

# Wait for database to be ready (usually 5-10 seconds)
sleep 10

# Test connection
psql postgresql://user:password@localhost:5432/insight_gen_db -c "SELECT 1"
# Should return: 1
```

### Step 3: Install Dependencies

```bash
pnpm install
```

### Step 4: Run Database Migrations

```bash
npm run migrate

# Output should show:
# ✅ Migration complete: 000_create_ai_insight_table.sql
# ✅ Migration complete: 001_create_ai_analysis_plan_cache.sql
# ... (48 migrations total)
```

### Step 5: Seed Initial Data

```bash
# Create default admin user
npm run seed-admin

# Output:
# ✅ Admin user created: admin@yourdomain.local

# Load template catalog
npm run seed-template-catalog

# Output:
# ✅ Template catalog seeded successfully
```

### Step 6: Start Development Server

```bash
pnpm dev

# Output:
# - ready started server on 0.0.0.0:3005, url: http://localhost:3005
```

### Step 7: Verify Installation

**In another terminal:**

```bash
# Test API
curl http://localhost:3005/api/health

# Open in browser
open http://localhost:3005  # Mac
xdg-open http://localhost:3005  # Linux
start http://localhost:3005  # Windows
```

**Login:**
- Username: `admin` (from `ADMIN_USERNAME`)
- Password: Value from `ADMIN_PASSWORD`

**Check:**
- ✅ Dashboard loads
- ✅ Can create insights
- ✅ Templates visible
- ✅ Admin panel accessible

---

## Production Deployment

### Step 1: Create Production Environment File

```bash
cp env.production.example .env.production

# Edit with production values
nano .env.production
```

**Key variables:**

```bash
# Database (production database connection)
INSIGHT_GEN_DB_URL="postgresql://prod_user:prod_password@prod-db-server:5432/insight_gen_prod"

# AI Provider(s)
ANTHROPIC_API_KEY="sk-ant-YOUR_PRODUCTION_KEY"

# Authentication
NEXTAUTH_SECRET="generate-random-32-char-string"  # Use: openssl rand -base64 32
NEXTAUTH_URL="http://your-production-url:3005"

# Admin credentials
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="ChangeMe123!"
ADMIN_EMAIL="admin@company.local"

# Environment
NODE_ENV="production"
```

### Step 2: Verify Database Connection

```bash
# Test connection to production database
psql "postgresql://prod_user:prod_password@prod-db-server:5432/insight_gen_prod" -c "SELECT 1"

# Should return: 1
```

### Step 3: Build Application

```bash
pnpm build

# Output should show no errors
# Creates: .next/ directory
```

### Step 4: Run Migrations on Production DB

```bash
# Load .env.production
source .env.production

# Run migrations
npm run migrate

# Verify all tables created
npm run check-tables
```

### Step 5: Seed Production Data

```bash
npm run seed-admin
npm run seed-template-catalog
```

### Step 6: Build Docker Image (Optional)

If deploying via Docker:

```bash
# Build image
docker build -f Dockerfile.prod -t insight-gen:latest .

# Run container
docker run -d \
  --name insight-gen \
  -p 3005:3005 \
  --env-file .env.production \
  --restart unless-stopped \
  insight-gen:latest
```

### Step 7: Start Application

**Option A: Direct execution**
```bash
NODE_ENV=production npm run start
```

**Option B: With process manager (PM2)**
```bash
npm install -g pm2
pm2 start npm --name "insight-gen" -- run start
pm2 save
pm2 startup
```

### Step 8: Verify Production Deployment

```bash
# Test API
curl http://your-production-url:3005/api/health

# Open in browser
# http://your-production-url:3005

# Login with admin credentials from .env.production
```

---

## Verification

### Health Check Endpoints

```bash
# General health
curl http://localhost:3005/api/health

# Database connectivity
curl http://localhost:3005/api/db/status

# AI provider status
curl http://localhost:3005/api/ai/status
```

### Useful Logs

```bash
# Beta: View development server logs
# Already visible in terminal where you ran: pnpm dev

# Production: View application logs
tail -f /var/log/insight-gen/app.log

# Docker: View container logs
docker logs -f insight-gen
```

---

## Troubleshooting

### Database Connection Fails

```bash
# Check PostgreSQL is running
docker-compose ps db

# If not running:
docker-compose up -d db
sleep 10

# Verify connection string in .env.local
echo $INSIGHT_GEN_DB_URL

# Test connection manually
psql "$INSIGHT_GEN_DB_URL" -c "SELECT 1"
```

### Migrations Fail

```bash
# Check database structure
npm run check-tables

# Try running migrations again
npm run migrate

# If stuck, force re-run (WARNING: for dev only)
npm run migrate:force
```

### Admin User Not Created

```bash
# Check .env.local has ADMIN_USERNAME and ADMIN_PASSWORD
grep ADMIN .env.local

# Run seed again
npm run seed-admin

# Verify in database
psql "$INSIGHT_GEN_DB_URL" -c "SELECT username, email FROM \"Users\" LIMIT 5;"
```

### Port 3005 Already in Use

```bash
# Find process using port
lsof -i :3005

# Kill process
kill -9 <PID>

# Or use different port
PORT=3006 pnpm dev
```

### Dependencies Not Installing

```bash
# Clear pnpm cache
pnpm store prune

# Clear node_modules
rm -rf node_modules pnpm-lock.yaml

# Reinstall
pnpm install
```

### Docker Issues

```bash
# Check Docker is running
docker ps

# View docker-compose logs
docker-compose logs db

# Restart services
docker-compose restart

# Full reset (WARNING: deletes data)
docker-compose down
docker volume rm insight-gen_postgres_data
docker-compose up -d db
```

---

## Next Steps

Once deployed:

1. **Configure users** via admin panel
2. **Set up forms** for data access
3. **Create insights** to test AI functionality
4. **Enable audit** for production compliance
5. **Set up backups** for production data

See [DEPLOYMENT_TROUBLESHOOTING.md](./DEPLOYMENT_TROUBLESHOOTING.md) for common issues.

See `README-DEPLOYMENT.md` for interactive setup wizard (recommended for most users).
