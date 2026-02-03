# Deployment Troubleshooting Guide

**Common issues and solutions during InsightGen deployment.**

---

## Setup Wizard Issues

### Wizard Crashes on Start

**Problem:** `pnpm setup:beta` fails with an error

**Solution:**
```bash
# Ensure dependencies are installed
pnpm install

# Try running wizard again
pnpm setup:beta

# Or try verbose mode
pnpm setup:beta --verbose
```

---

### "PostgreSQL not running" Error

**Problem:** Wizard can't find PostgreSQL container

**Solution:**
```bash
# Check if Docker is running
docker ps

# Check if container exists
docker-compose ps

# Start PostgreSQL manually
docker-compose up -d db

# Wait for readiness
sleep 10

# Verify it's running
docker-compose ps db

# Try wizard again
pnpm setup:beta
```

---

### Database Connection Validation Fails

**Problem:** Wizard shows "Connection failed" when validating database

**Causes & Solutions:**

1. **Wrong credentials:**
   ```bash
   # Check connection string format
   # Should be: postgresql://username:password@host:port/database
   psql "postgresql://user:password@localhost:5432/insight_gen_db" -c "SELECT 1"
   ```

2. **Database doesn't exist:**
   ```bash
   # Create database first
   psql postgresql://user:password@localhost:5432 -c "CREATE DATABASE insight_gen_db;"
   ```

3. **Wrong port:**
   ```bash
   # Docker Compose default is port 5432
   # Check in docker-compose.yml:
   grep -A 5 "ports:" docker-compose.yml | grep -A 1 "db:"
   ```

4. **Network connectivity:**
   ```bash
   # If on remote server, verify connection
   nc -zv prod-db-server 5432
   ```

---

### "Anthropic API Key Invalid" Error

**Problem:** Wizard rejects your Anthropic API key

**Solution:**
1. Get a fresh API key from https://console.anthropic.com/
2. Verify it starts with `sk-ant-`
3. Copy the full key (don't truncate)
4. Paste into wizard

---

### Google Credentials File Not Found

**Problem:** Wizard shows "Credentials file not found"

**Solution:**
```bash
# Verify file exists
ls -la credentials/google-credentials.json

# Or provide absolute path
/Users/yourname/Downloads/google-credentials.json

# Ensure it's valid JSON
python3 -m json.tool credentials/google-credentials.json > /dev/null && echo "Valid JSON"
```

---

### Password Rejected - "Too Weak"

**Problem:** Wizard says password doesn't meet requirements

**Solution:** Use a stronger password with:
- ✅ At least 8 characters (14+ recommended)
- ✅ Mix of uppercase and lowercase
- ✅ At least one number
- ✅ At least one special character (!@#$%^&*)

Example: `SecurePass123!`

---

## Database Issues

### "Migrations Failed" Error

**Problem:** `npm run migrate` fails

**Solution:**

1. **Check database connection:**
   ```bash
   psql "$INSIGHT_GEN_DB_URL" -c "SELECT 1"
   ```

2. **Check database exists:**
   ```bash
   psql "$INSIGHT_GEN_DB_URL" -c "\dt"
   # Should list tables (or be empty if first run)
   ```

3. **Try migration again:**
   ```bash
   npm run migrate
   ```

4. **Force migration (WARNING: only for dev):**
   ```bash
   npm run migrate:force
   ```

5. **If still stuck:**
   ```bash
   # Reset database (DELETES ALL DATA)
   docker-compose down
   docker volume rm insight-gen_postgres_data
   docker-compose up -d db
   sleep 10
   npm run migrate
   ```

---

### "Admin User Already Exists" Message

**Problem:** `npm run seed-admin` says admin exists but you haven't set one up

**Solution:**
```bash
# This is normal - migration 012 creates default user
# You can:
# 1. Use the existing admin user
# 2. Or reset and re-seed (dev only):

npm run seed-admin --force  # Force re-seed

# Check existing users
psql "$INSIGHT_GEN_DB_URL" -c "SELECT username, email FROM \"Users\";"
```

---

### "Template Catalog Already Loaded"

**Problem:** `npm run seed-template-catalog` says it's already loaded

**Solution:**
```bash
# This is normal if you've run the wizard before
# Templates persist; re-seeding won't hurt but won't add new ones

# To see what's loaded
psql "$INSIGHT_GEN_DB_URL" -c "SELECT COUNT(*) FROM template_catalog;"

# If you want fresh data:
# WARNING: Deletes existing templates
psql "$INSIGHT_GEN_DB_URL" -c "DELETE FROM template_catalog;"
npm run seed-template-catalog
```

---

## Server / Port Issues

### Port 3005 Already in Use

**Problem:** `pnpm dev` fails with "Port already in use"

**Solution:**

```bash
# Find what's using port 3005
lsof -i :3005

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3006 pnpm dev

# Or add to .env.local
echo "PORT=3006" >> .env.local
pnpm dev
```

---

### "Cannot connect to localhost:3005"

**Problem:** Browser shows connection refused

**Check:**

1. **Is the server running?**
   ```bash
   curl http://localhost:3005
   ```

2. **Is it still starting?**
   ```bash
   # Wait for output: "ready started server"
   # Usually takes 10-30 seconds on first run
   ```

3. **Check for errors in terminal**
   - Look for red errors in `pnpm dev` output
   - Common: environment variables missing, database not ready

4. **Try explicit host:**
   ```bash
   # Stop server (Ctrl+C)
   # Edit package.json, change:
   # "dev": "next dev -p 3005"
   # to:
   # "dev": "next dev -H 0.0.0.0 -p 3005"
   pnpm dev
   ```

---

### Login Fails - "Invalid Credentials"

**Problem:** Can't login with admin credentials

**Solution:**

1. **Check admin user exists:**
   ```bash
   psql "$INSIGHT_GEN_DB_URL" -c "SELECT username, email FROM \"Users\" WHERE role = 'admin';"
   ```

2. **Verify .env.local has correct credentials:**
   ```bash
   grep ADMIN .env.local
   ```

3. **Re-seed admin user:**
   ```bash
   npm run seed-admin
   ```

4. **Check password is set:**
   ```bash
   # Login page shows error if password is wrong
   # Try the exact password from .env.local
   ```

---

## Docker Issues

### "docker: command not found"

**Problem:** Docker is not installed

**Solution:**
```bash
# Install Docker
# macOS: https://docs.docker.com/desktop/install/mac-install/
# Linux: https://docs.docker.com/engine/install/
# Windows: https://docs.docker.com/desktop/install/windows-install/

# Verify installation
docker --version
docker-compose --version
```

---

### "Cannot connect to Docker daemon"

**Problem:** Docker is installed but not running

**Solution:**
```bash
# macOS:
open /Applications/Docker.app

# Linux:
sudo systemctl start docker

# Windows:
# Open Docker Desktop from Start Menu
```

---

### Docker Container Keeps Restarting

**Problem:** `docker-compose logs db` shows restarts

**Solution:**
```bash
# Check logs
docker-compose logs db

# Most common: Port conflict
# Check if 5432 is in use
lsof -i :5432

# Stop conflicting container
docker stop <container_id>

# Restart
docker-compose restart db

# View logs again
docker-compose logs db
```

---

## AI Provider Issues

### "API Key Rejected" (Anthropic)

**Problem:** Anthropic API key shows as invalid

**Solution:**
1. Verify key hasn't expired: https://console.anthropic.com/
2. Check key format: should start with `sk-ant-`
3. Ensure no extra spaces or line breaks
4. Try a fresh key

---

### "Project Not Found" (Google)

**Problem:** Google Cloud project ID is not recognized

**Solution:**
```bash
# Verify project exists
gcloud projects list | grep your-project-id

# Or check in Google Cloud Console
# https://console.cloud.google.com/

# Ensure Vertex AI API is enabled
gcloud services enable aiplatform.googleapis.com --project=your-project-id

# Check credentials file
gcloud auth list
gcloud config get-value project
```

---

### "Credentials File Invalid" (Google)

**Problem:** Google service account JSON file is corrupt or missing

**Solution:**
```bash
# Verify file exists and is valid JSON
python3 -m json.tool credentials/google-credentials.json > /dev/null

# Download fresh credentials
# https://cloud.google.com/docs/authentication/getting-started

# Or update environment variable path
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/correct/file.json"
```

---

## Performance Issues

### App Starts Very Slowly

**Problem:** `pnpm dev` takes > 30 seconds to start

**Solution:**
```bash
# First time: normal (30-60 seconds)
# Subsequent times should be < 10 seconds

# If slow every time:
# 1. Check CPU/Memory
# 2. Check disk space
# 3. Try clean install
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm dev
```

---

### Migrations Take Too Long

**Problem:** `npm run migrate` runs for > 5 minutes

**Solution:**
```bash
# Check database logs
docker-compose logs db

# Check if migrations are running
psql "$INSIGHT_GEN_DB_URL" -c "SELECT * FROM migrations LIMIT 10;"

# Verify database performance
psql "$INSIGHT_GEN_DB_URL" -c "SELECT version();"

# Check disk space
df -h /
```

---

## Getting Help

### Debug Information to Gather

When reporting an issue, include:

```bash
# System info
node --version
pnpm --version
docker --version

# Environment
cat .env.local | grep -v "PASS\|SECRET\|KEY"

# Log output (sanitized)
pnpm setup:beta 2>&1 | tail -50

# Database status
psql "$INSIGHT_GEN_DB_URL" -c "\d" 2>&1

# Docker status
docker-compose ps
docker-compose logs db | tail -30
```

---

### Useful Commands for Debugging

```bash
# Test database connection
psql "$INSIGHT_GEN_DB_URL" -c "SELECT 1;"

# List all tables
npm run check-tables

# View running processes
ps aux | grep node
ps aux | grep postgres

# Network diagnostics
netstat -an | grep 3005
netstat -an | grep 5432

# Docker diagnostics
docker system df
docker ps -a
```

---

## Still Stuck?

1. **Check the logs** - most errors are in the output
2. **Read DEPLOYMENT_MANUAL.md** - step-by-step instructions
3. **Search existing issues** - others may have faced it
4. **Enable debug mode**:
   ```bash
   DEBUG=* pnpm setup:beta
   LOG_LEVEL=debug pnpm dev
   ```

---

**Last updated:** February 2026  
**Version:** 1.0
