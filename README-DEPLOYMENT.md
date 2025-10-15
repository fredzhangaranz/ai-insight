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

## Environment Configuration

### Required Environment Variables

- `DATABASE_URL`: Connection string to Silhouette database
- `NODE_ENV`: Set to `production`

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

3. **Rollout toggle**: Set `AUTH_SYSTEM_ENABLED=false` to temporarily disable authentication if you hit issues during cutover.

4. **Seed default admin** after running migrations:

   ```bash
   npm run migrate
   npm run seed-admin
   ```

   Credentials come from the `ADMIN_*` environment variables above. Rotate the password after first login.

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
