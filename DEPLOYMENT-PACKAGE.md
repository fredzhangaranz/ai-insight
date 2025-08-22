# Insight Gen Deployment Package Guide

This guide explains how to create and distribute a complete deployment package for customers.

## 📦 What to Include in the Deployment Package

### Required Files

1. **`insight-gen.tar`** - The Docker image (created with `./scripts/deploy.sh export`)
2. **`README-DEPLOYMENT.md`** - This deployment guide
3. **`env.production.example`** - Environment configuration template
4. **`scripts/`** directory containing:
   - `deploy.sh` - Deployment automation script
   - `validate-credentials.sh` - Credential validation script

### Optional Files

5. **`docker-compose.prod.yml`** - For full-stack deployments
6. **`Dockerfile.prod`** - For custom builds (if needed)

## 🚀 Creating the Deployment Package

### Step 1: Build and Export the Image

```bash
# Build and export the production image
./scripts/deploy.sh export
```

### Step 2: Create Package Directory

```bash
# Create deployment package
mkdir insight-gen-deployment-package
cd insight-gen-deployment-package

# Copy required files
cp ../insight-gen.tar .
cp ../README-DEPLOYMENT.md .
cp ../env.production.example .
cp -r ../scripts/ .
cp ../docker-compose.prod.yml .
cp ../Dockerfile.prod .
```

### Step 3: Create Package Instructions

Create a `SETUP.md` file with customer-specific instructions:

```markdown
# Insight Gen Setup Instructions

## Quick Start

1. Extract this package to your server
2. Run: `./scripts/deploy.sh setup-credentials`
3. Configure your credentials (see README-DEPLOYMENT.md)
4. Run: `./scripts/validate-credentials.sh`
5. Deploy: `docker load < insight-gen.tar && docker run -p 3005:3005 --env-file .env.production -v $(pwd)/credentials:/app/credentials:ro insight-gen:latest`

## Support

Contact: your-support-email@company.com
Documentation: README-DEPLOYMENT.md
```

## 🔐 AI Credential Options

### Option A: Company-Provided AI Services

If your company provides AI services:

1. **Set up company accounts**:

   - Anthropic API account with billing
   - Google Cloud project with Vertex AI enabled

2. **Create customer-specific credentials**:

   - Generate API keys per customer
   - Create Google service accounts per customer
   - Set up usage quotas and billing

3. **Include in package**:
   - Pre-configured `.env.production` with company credentials
   - Google service account JSON files
   - Usage instructions and limits

### Option B: Customer-Provided AI Services

If customers use their own AI services:

1. **Provide setup instructions**:

   - Links to Anthropic console: https://console.anthropic.com/
   - Links to Google Cloud console: https://console.cloud.google.com/
   - Step-by-step credential creation guides

2. **Include validation tools**:
   - `scripts/validate-credentials.sh` for testing
   - Clear error messages for missing credentials

## 📋 Customer Deployment Checklist

### Pre-Deployment

- [ ] Docker installed on target server
- [ ] Network access to Silhouette database
- [ ] AI service accounts created (Anthropic/Google)
- [ ] Firewall rules configured for port 3005

### Deployment Steps

- [ ] Extract deployment package
- [ ] Run credential setup: `./scripts/deploy.sh setup-credentials`
- [ ] Configure `.env.production` with customer credentials
- [ ] Place Google credentials in `credentials/google-credentials.json` (if using)
- [ ] Validate configuration: `./scripts/validate-credentials.sh`
- [ ] Load and run Docker image
- [ ] Test application functionality
- [ ] Configure monitoring and logging

### Post-Deployment

- [ ] Verify database connectivity
- [ ] Test AI functionality
- [ ] Configure backup procedures
- [ ] Set up monitoring alerts
- [ ] Document customer-specific configuration

## 🛡️ Security Considerations

### Package Security

- **Never include real API keys** in the deployment package
- **Use secure file transfer** (SFTP, encrypted USB, etc.)
- **Verify package integrity** with checksums
- **Include security best practices** in documentation

### Runtime Security

- **Read-only volume mounts** for credentials
- **Network isolation** where possible
- **Regular security updates** for base images
- **Access logging** and monitoring

## 📞 Support and Troubleshooting

### Common Issues

1. **Docker not installed**: Provide Docker installation instructions
2. **Port conflicts**: Guide customers to change ports
3. **Database connectivity**: Network troubleshooting steps
4. **AI service errors**: Credential validation and testing
5. **Permission issues**: Docker user configuration

### Support Resources

- **Documentation**: README-DEPLOYMENT.md
- **Validation tools**: `scripts/validate-credentials.sh`
- **Logs**: `docker logs insight-gen`
- **Configuration**: `env.production.example`

## 🔄 Updates and Maintenance

### Image Updates

1. **Version the images**: Use tags like `insight-gen:v1.2.3`
2. **Backward compatibility**: Maintain API compatibility
3. **Migration guides**: Document breaking changes
4. **Rollback procedures**: Keep previous versions available

### Customer Communication

- **Update notifications**: Email customers about new versions
- **Security patches**: Immediate communication for security issues
- **Feature announcements**: Regular updates about new capabilities
- **Support channels**: Clear contact information and response times

## 📊 Monitoring and Analytics

### Deployment Metrics

- Track successful deployments
- Monitor common failure points
- Collect customer feedback
- Measure time to deployment

### Usage Analytics

- AI service usage patterns
- Database query performance
- User engagement metrics
- Error rates and types

## 🎯 Best Practices

### For Your Company

1. **Standardize deployment process**
2. **Automate package creation**
3. **Maintain deployment documentation**
4. **Provide customer training**
5. **Establish support procedures**

### For Customers

1. **Follow security guidelines**
2. **Test in staging environment**
3. **Backup configurations**
4. **Monitor application health**
5. **Report issues promptly**
