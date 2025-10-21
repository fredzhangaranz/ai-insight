# Insight Gen Deployment Guide

This guide covers deploying the Insight Gen application to customer on-premises environments or Azure hosting.

## 🔐 AI Credentials Setup

**IMPORTANT**: The Docker image does NOT include any AI API keys. Customers must provide their own credentials.

### Option A: Company-Provided AI Keys

If your company provides AI services to customers:

1. Set up company accounts with Anthropic and/or Google Cloud
2. Provide customers with API keys and credentials
3. Include setup instructions in deployment package

### Option B: Customer-Provided AI Keys

If customers use their own AI services:

1. Guide customers to create their own API accounts
2. Provide setup instructions for credential configuration
3. Support both Anthropic Claude and Google Vertex AI

## Deployment Options

### Option 1: Docker Image Export/Import (Recommended for On-Premises)

**Best for**: Customer Windows servers with Docker installed

1. **Build and export the image** (on your development machine):

   ```bash
   ./scripts/deploy.sh export
   ```

2. **Set up credentials** (on customer server):

   ```bash
   ./scripts/deploy.sh setup-credentials
   ```

3. **Transfer the tar file** to the customer server:

   - Copy `insight-gen.tar` to the customer server
   - Use secure file transfer (SFTP, USB drive, etc.)

4. **Configure AI credentials**:

   ```bash
   # Create credentials directory
   mkdir -p credentials

   # For Anthropic Claude - create .env.production
   cat > .env.production << EOF
   DATABASE_URL=your-silhouette-db-connection-string
   ANTHROPIC_API_KEY=sk-ant-api03-your-customer-key-here
   AI_MODEL_NAME=claude-3-5-sonnet-latest
   EOF

   # For Google Vertex AI - place credentials file
   # Copy customer's Google service account JSON to:
   # credentials/google-credentials.json
   ```

5. **Deploy on customer server**:

   ```bash
   # Load the image
   docker load < insight-gen.tar

   # Run the application
   docker run -d \
     --name insight-gen \
     -p 3005:3005 \
     --env-file .env.production \
     -v $(pwd)/credentials:/app/credentials:ro \
     --restart unless-stopped \
     insight-gen:latest
   ```

### Option 2: Azure Container Registry (Recommended for Azure)

**Best for**: Azure hosting environments

1. **Create Azure Container Registry**:

   ```bash
   az acr create --resource-group your-rg --name yourregistry --sku Basic
   az acr login --name yourregistry
   ```

2. **Build and push to ACR**:

   ```bash
   ./scripts/deploy.sh acr yourregistry
   ```

3. **Set up credentials on Azure server**:

   ```bash
   # Create credentials directory
   mkdir -p credentials

   # Configure environment variables
   cat > .env.production << EOF
   DATABASE_URL=your-silhouette-db-connection-string
   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
   GOOGLE_CLOUD_PROJECT=your-google-project-id
   GOOGLE_CLOUD_LOCATION=us-central1
   EOF

   # Place Google credentials if using Vertex AI
   # credentials/google-credentials.json
   ```

4. **Deploy on Azure server**:
   ```bash
   # Pull and run
   docker pull yourregistry.azurecr.io/insight-gen:latest
   docker run -d \
     --name insight-gen \
     -p 3005:3005 \
     --env-file .env.production \
     -v $(pwd)/credentials:/app/credentials:ro \
     --restart unless-stopped \
     yourregistry.azurecr.io/insight-gen:latest
   ```

### Option 3: Docker Compose (Full Stack)

**Best for**: Complete deployment with database

**IMPORTANT**: This deployment now includes PostgreSQL with vector extension support for semantic features.

1. **Create production environment file**:

   ```bash
   # .env.production
   DATABASE_URL=postgresql://user:password@db:5432/insight_gen_db
   POSTGRES_DB=insight_gen_db
   POSTGRES_USER=user
   POSTGRES_PASSWORD=secure_password

   # AI Credentials
   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
   GOOGLE_CLOUD_PROJECT=your-google-project-id
   GOOGLE_CLOUD_LOCATION=us-central1
   AI_MODEL_NAME=claude-3-5-sonnet-latest
   ```

2. **Set up credentials directory**:

   ```bash
   mkdir -p credentials
   # Place google-credentials.json here if using Vertex AI
   ```

3. **Deploy with docker-compose**:

   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Enable vector extension** (required for semantic features):

   ```bash
   docker-compose -f docker-compose.prod.yml exec db psql -U user -d insight_gen_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

5. **Run migrations**:

   ```bash
   docker-compose -f docker-compose.prod.yml exec app node scripts/run-migrations.js
   ```

6. **Load clinical ontology** (required for semantic search):

   ```bash
   docker-compose -f docker-compose.prod.yml exec app npm run ontology:load
   ```

   This generates embeddings for all clinical concepts using the Gemini embedding model. **Note**: Requires valid Google Cloud credentials configured via `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS`.

## Environment Configuration

### Required Environment Variables

- `DATABASE_URL`: Connection string to Silhouette database
- `NODE_ENV`: Set to `production`

## PostgreSQL Vector Extension Upgrade

**IMPORTANT**: The application now requires the PostgreSQL `vector` extension for semantic features. Follow these steps to safely upgrade your production database.

### Pre-Upgrade Checklist

1. **Backup your database** (CRITICAL):

   ```bash
   # Create full database backup
   pg_dump -h your-db-host -U your-username -d your-database > backup_before_vector_upgrade.sql

   # Verify backup size (should be substantial)
   ls -lh backup_before_vector_upgrade.sql
   ```

2. **Test the upgrade in a staging environment** first
3. **Schedule maintenance window** for production upgrade
4. **Verify current database version**:
   ```bash
   docker exec your-db-container psql -U your-username -d your-database -c "SELECT version();"
   ```

### Production Upgrade Steps

#### Option A: Docker Compose Deployment (Recommended)

If you're using the provided `docker-compose.prod.yml`:

1. **Stop the application**:

   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

2. **Update docker-compose.prod.yml** to use pgvector image:

   ```yaml
   # Change this line in docker-compose.prod.yml
   db:
     image: pgvector/pgvector:pg15 # Changed from postgres:15-alpine
   ```

3. **Start the database with new image**:

   ```bash
   docker-compose -f docker-compose.prod.yml up -d db
   ```

4. **Wait for database to be ready** (30-60 seconds):

   ```bash
   docker-compose -f docker-compose.prod.yml logs -f db
   ```

5. **Enable vector extension**:

   ```bash
   docker-compose -f docker-compose.prod.yml exec db psql -U your-username -d your-database -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

6. **Verify data integrity**:

   ```bash
   # Check that all tables are present
   docker-compose -f docker-compose.prod.yml exec db psql -U your-username -d your-database -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"

   # Check vector extension is available
   docker-compose -f docker-compose.prod.yml exec db psql -U your-username -d your-database -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
   ```

7. **Run migrations**:

   ```bash
   docker-compose -f docker-compose.prod.yml exec app node scripts/run-migrations.js
   ```

8. **Start the full application**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

#### Option B: Standalone Database Upgrade

If you're using an external PostgreSQL database:

1. **Backup your database** (as shown above)

2. **Upgrade your PostgreSQL server** to include pgvector:

   - **Ubuntu/Debian**: `sudo apt-get install postgresql-15-pgvector`
   - **CentOS/RHEL**: `sudo yum install pgvector_15`
   - **Docker**: Switch to `pgvector/pgvector:pg15` image
   - **Cloud providers**: Check if pgvector is available in your region

3. **Enable the extension**:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. **Run application migrations**:

   ```bash
   node scripts/run-migrations.js
   ```

5. **Load clinical ontology** (if using semantic features):

   ```bash
   npm run ontology:load
   ```

   Requires Google Cloud Project ID and credentials to be configured.

### Rollback Procedure

If issues occur after the upgrade:

1. **Stop the application**:

   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

2. **Restore from backup**:

   ```bash
   # Drop the current database (CAREFUL!)
   docker-compose -f docker-compose.prod.yml exec db psql -U your-username -d your-database -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

   # Restore from backup
   docker-compose -f docker-compose.prod.yml exec -T db psql -U your-username -d your-database < backup_before_vector_upgrade.sql
   ```

3. **Revert docker-compose.prod.yml**:

   ```yaml
   db:
     image: postgres:15-alpine # Revert to original
   ```

4. **Restart with original image**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Verification Steps

After successful upgrade, verify:

1. **Vector extension is working**:

   ```bash
   docker-compose -f docker-compose.prod.yml exec db psql -U your-username -d your-database -c "SELECT '[1,2,3]'::vector;"
   ```

2. **ClinicalOntology table exists**:

   ```bash
   docker-compose -f docker-compose.prod.yml exec db psql -U your-username -d your-database -c "\\d \"ClinicalOntology\""
   ```

3. **Application starts successfully**:

   ```bash
   docker-compose -f docker-compose.prod.yml logs app
   ```

4. **All existing data is accessible**:
   - Check that dashboards, insights, and users are still accessible
   - Verify no data loss occurred

### Troubleshooting Vector Extension

**Issue**: `extension "vector" is not available`

**Solution**: Ensure you're using the pgvector image:

```bash
# Check current image
docker-compose -f docker-compose.prod.yml images

# Should show: pgvector/pgvector:pg15
```

**Issue**: Migration fails with vector errors

**Solution**: The migration includes fallback logic, but for full functionality, ensure vector extension is available.

**Issue**: Performance degradation

**Solution**: Vector operations are CPU-intensive. Monitor resource usage and consider:

- Increasing database memory allocation
- Optimizing vector index parameters
- Using connection pooling

### Authentication & Session

1. **Generate a secret for NextAuth**:

   ```bash
   openssl rand -base64 32
   ```

   Copy the output into `NEXTAUTH_SECRET`.

   2. **Set authentication variables** in `.env.production`:

   ```bash
   NEXTAUTH_SECRET=base64-secret-from-step-1
   NEXTAUTH_URL=https://insightgen.yourcompany.local
   NEXTAUTH_SESSION_MAX_AGE=604800  # 7 days

   # Bootstrap admin (rotate after first login)
   ADMIN_USERNAME=initial-admin
   ADMIN_PASSWORD=ChangeMe123!
   ADMIN_EMAIL=admin@yourcompany.local
   ADMIN_FULL_NAME=InsightGen Administrator

   # Feature flag to control rollout
   AUTH_SYSTEM_ENABLED=true
   ```

2. **Rollout toggle**: Set `AUTH_SYSTEM_ENABLED=false` to temporarily disable authentication if you hit issues during cutover.

3. **Seed default admin and backfill ownership** after running migrations:

   ```bash
   npm run migrate
   npm run seed-admin
   node scripts/backfill-user-ownership.js
   ```

   Credentials come from the `ADMIN_*` environment variables above. Rotate the password after first login. The backfill script assigns any legacy insights, dashboards, or funnels without a `userId` to the first admin user (or the username specified via `BACKFILL_OWNER_USERNAME`). Re-run the script after any manual data imports to keep ownership consistent.

4. **Clean up duplicate dashboards** (optional but recommended):

   ```bash
   # Preview what will be deleted
   node scripts/cleanup-duplicate-dashboards.js --dry-run

   # Apply the cleanup
   node scripts/cleanup-duplicate-dashboards.js
   ```

   This script removes duplicate "default" dashboards per user, keeping only the oldest one. This prevents inconsistent behavior when loading dashboards.

5. **Rollback safety**: user ownership columns remain nullable by design. If issues arise, you can temporarily disable auth middleware and re-run the backfill once fixed—no schema rollback required.

### AI Service Configuration

**Choose one or both AI providers:**

#### Anthropic Claude

```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
AI_MODEL_NAME=claude-3-5-sonnet-latest  # Optional, defaults to claude-3-5-sonnet-latest
```

#### Google Vertex AI

```bash
GOOGLE_CLOUD_PROJECT=your-google-project-id
GOOGLE_CLOUD_LOCATION=us-central1  # Optional, defaults to us-central1
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/google-credentials.json
```

**Gemini Embeddings** (required for semantic features):

The application uses Google's `gemini-embedding-001` model to generate embeddings for clinical concepts. This enables semantic search and concept matching.

- **Dimensions**: 3072 (state-of-the-art embeddings)
- **Languages**: 100+ languages supported
- **Setup**: Automatically configured when Google Vertex AI credentials are provided
- **Loading**: Run `npm run ontology:load` after deployment to generate embeddings for clinical concepts

**File structure for Google credentials:**

```
credentials/
└── google-credentials.json  # Customer's Google service account JSON
```

### Database Connection

The app connects to your Silhouette database. Ensure:

- Network connectivity between the Docker container and database
- Proper firewall rules
- Database credentials with appropriate permissions

## Security Considerations

1. **Never include API keys in Docker images**
2. **Use secure passwords** for database connections
3. **Limit network access** to only necessary ports
4. **Regular security updates** for the base Docker image
5. **Monitor logs** for suspicious activity
6. **Use read-only volume mounts** for credentials
7. **Rotate API keys** regularly

## Troubleshooting

### Common Issues

1. **AI API key not configured**:

   ```bash
   # Check environment variables
   docker exec insight-gen env | grep -E "(ANTHROPIC|GOOGLE)"

   # Verify credentials file exists
   docker exec insight-gen ls -la /app/credentials/
   ```

2. **Port already in use**:

   ```bash
   # Check what's using port 3005
   netstat -tulpn | grep 3005

   # Use different port
   docker run -p 3006:3005 insight-gen:latest
   ```

3. **Database connection failed**:

   - Verify `DATABASE_URL` format
   - Check network connectivity
   - Ensure database is accessible from container

4. **Permission denied**:
   ```bash
   # Run with proper permissions
   docker run --user $(id -u):$(id -g) insight-gen:latest
   ```

### Logs and Monitoring

```bash
# View application logs
docker logs insight-gen

# Follow logs in real-time
docker logs -f insight-gen

# Check container status
docker ps

# Check AI service connectivity
docker exec insight-gen node -e "
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
  console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT || 'Not set');
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Not set');
"
```

## Support

For deployment issues:

1. Check the logs: `docker logs insight-gen`
2. Verify environment variables
3. Test database connectivity
4. Verify AI credentials are properly configured
5. Contact support with error details
