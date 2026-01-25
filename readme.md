# InsightGen: AI-Powered Analytics Dashboard

## Background

InsightGen is a proof-of-concept (POC) application designed to demonstrate a new paradigm for data analytics in clinical healthcare settings. The project was developed to address the challenge of deriving meaningful insights from clinical data, which traditionally requires a lengthy, manual, and costly process involving custom dashboard development.

### Problem Statement

Silhouette Central holds a wealth of valuable clinical data, including highly configurable assessment forms and quantitative wound measurements. Currently, deriving meaningful insights from this data is a slow, reactive process that relies on a support-to-development pipeline to build custom dashboards. Furthermore, customers often don't know what analytical questions to ask, making it difficult to provide proactive, valuable reporting.

### Solution

InsightGen leverages Large Language Models (AI) to dynamically analyze the structure of any configured form, suggest relevant clinical and operational questions, and instantly generate corresponding data visualizations. The goal is to showcase the feasibility and business value of AI-driven analytics, with the ultimate aim of embedding this capability into Silhouette Central to empower users with self-serve, on-demand insights.

## Key Features

### Core Functionality

- **Form Discovery**: Browse and select from available assessment forms in the database
- **Dynamic Form Rendering**: Visual display of form schemas and field configurations
- **AI-Powered Insight Suggestion**: Generate categorized analytical questions based on form structure
- **AI-Powered SQL Generation**: Convert natural language questions into executable SQL queries
- **Dynamic Data Visualization**: Render responsive charts (bar, line, pie) based on query results
- **Patient Selection Module**: Filter analysis for specific patients when needed
- **Transparency View**: Display generated SQL queries with syntax highlighting and raw data tables

### User Flows

1. **All-Patient Aggregate Analysis**: Analyze patterns across the entire patient population
2. **Single-Patient Trend Analysis**: Track individual patient progress over time

### Advanced Features

- **Query Funnel System**: Break down complex questions into sub-questions for better analysis
- **Caching System**: Cache AI analysis plans and query results for improved performance
- **Metrics Tracking**: Monitor AI performance, query execution times, and cache effectiveness
- **Multi-Model AI Support**: Support for various AI providers (Anthropic Claude, OpenAI, Google Vertex AI)

## Architecture

### Tech Stack

- **Frontend**: Next.js 14 with React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes with TypeScript
- **Database**:
  - PostgreSQL (tool-specific data)
  - Microsoft SQL Server (customer clinical data)
- **AI Engine**: Anthropic Claude API, OpenAI, Google Vertex AI
- **Data Visualization**: Recharts
- **Containerization**: Docker with Docker Compose

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API   │    │   AI Providers  │
│   (React/TS)    │◄──►│   Routes        │◄──►│   (Claude/      │
│                 │    │                 │    │    OpenAI/      │
└─────────────────┘    └─────────────────┘    │    Vertex AI)    │
                                              └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   MS SQL Server │    │   Monitoring    │
│   (Tool Data)   │◄──►│   (Clinical     │◄──►│   & Metrics     │
│                 │    │    Data)        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Database Architecture

The application uses a dual-database architecture:

1. **PostgreSQL Database** (InsightGen-specific):

   - Stores AI insights, analysis plans, metrics, and application data
   - Handles caching and performance monitoring
   - Manages query funnel and sub-question breakdowns

2. **Microsoft SQL Server** (Customer Clinical Data):
   - Read-only access to customer clinical data
   - Contains assessment forms, patient data, and measurements
   - Accessed through secure connection within private network

## AI Insight Database ERD

### Core Tables

#### AIInsights

```sql
CREATE TABLE "AIInsights" (
    id SERIAL PRIMARY KEY,
    "assessmentFormVersionFk" UUID NOT NULL,
    "insightsJson" JSONB NOT NULL,
    "generatedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "generatedBy" VARCHAR(255) NOT NULL
);
```

#### AIAnalysisPlanCache

```sql
CREATE TABLE "AIAnalysisPlanCache" (
    id SERIAL PRIMARY KEY,
    "assessmentFormVersionFk" UUID NOT NULL,
    "analysisPlanJson" JSONB NOT NULL,
    "createdDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL
);
```

#### QueryFunnel

```sql
CREATE TABLE "QueryFunnel" (
    id SERIAL PRIMARY KEY,
    "assessmentFormVersionFk" UUID NOT NULL,
    "originalQuestion" TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    "createdDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "lastModifiedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### SubQuestions

```sql
CREATE TABLE "SubQuestions" (
    id SERIAL PRIMARY KEY,
    "funnelId" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sqlQuery" TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    "lastExecutionDate" TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY ("funnelId") REFERENCES "QueryFunnel" (id)
);
```

#### Metrics Tables

- **QueryMetrics**: Track query execution performance
- **AIMetrics**: Monitor AI model usage and performance
- **CacheMetrics**: Track caching effectiveness

### Relationships

- `QueryFunnel` → `SubQuestions` (1:N)
- `SubQuestions` → `QueryResults` (1:N)
- All tables reference `assessmentFormVersionFk` for form-specific data

## Development Setup

### Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Docker and Docker Compose (for database only)
- Access to Microsoft SQL Server (for clinical data)

### Environment Setup

#### Debugging: LLM Prompt Logging

To log all prompts sent to the LLM API for debugging and prompt optimization, add this to your `.env.local`:

```env
LOG_LLM_PROMPTS=true
```

When enabled, this will log:
- System prompts
- User messages
- Conversation history
- Temperature and other parameters

**Note:** This generates a lot of output, so only enable it when debugging prompt issues.

1. Clone the repository
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create environment file `.env.local`:

   ```env
   # Database Connections
   INSIGHT_GEN_DB_URL=postgresql://user:password@localhost:5432/insight_gen_db
   SILHOUETTE_DB_URL=Server=server;Database=SilhouetteDatabaseName;User Id=user;Password=password;Encrypt=true;TrustServerCertificate=true

   # AI Provider Configuration
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json

   # Application Settings
   NEXTAUTH_SECRET=your_secret
   NEXTAUTH_URL=http://localhost:3005
   ```

### Database Setup

1. Start PostgreSQL database using Docker Compose:

   ```bash
   # Start only the database (recommended for development)
   docker-compose up db
   ```

2. Run database migrations:

   ```bash
   pnpm migrate
   ```

3. Verify database tables:
   ```bash
   pnpm check-tables
   ```

## Development Workflow

### **Recommended: Local Development with Docker Database**

This is the **preferred approach** for development:

```bash
# Terminal 1: Start the database
docker-compose up db

# Terminal 2: Run your application
pnpm dev
```

**Benefits:**

- Fast iteration cycles with hot reloading
- Clean, isolated database environment
- Easy database reset when needed
- Better debugging experience
- No container overhead for your app

### **Alternative: Full Docker Development**

Use this approach sparingly:

```bash
# Start both app and database
docker-compose up
```

**When to use:**

- Testing the full containerized setup
- Verifying Docker configuration
- Team consistency testing
- CI/CD testing

### Development Commands

```bash
# Start development server (recommended)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Lint code
pnpm lint
```

### Database Management Commands

```bash
# Start database only
docker-compose up db

# Stop database
docker-compose stop db

# Reset database (removes all data)
docker-compose down -v
docker-compose up db

# View database logs
docker-compose logs db

# Connect to database directly
docker-compose exec db psql -U user -d insight_gen_db
```

### Migration Management

#### Running Migrations

```bash
# Run all pending migrations (standard)
pnpm migrate

# View migration help
pnpm migrate -- --help
```

#### Re-running Migrations (Development Only)

During development, you may need to re-run migrations after making changes:

```bash
# Re-run a specific migration
pnpm migrate -- --rerun=035_seed_measurement_field_concepts.sql

# Re-run multiple migrations
pnpm migrate -- --rerun=035_seed_measurement_field_concepts.sql,036_fix_measurement_field_concepts.sql

# Remove migration record (allows re-run on next migrate)
pnpm migrate -- --remove=035_seed_measurement_field_concepts.sql
pnpm migrate  # Then run normally

# Force re-run all migrations (use with caution)
pnpm migrate -- --force

# Start from a specific migration
pnpm migrate -- --from=034_audit_measurement_fields.sql
```

**Common Development Workflow:**

```bash
# 1. Make changes to a migration file
# Edit database/migration/035_seed_measurement_field_concepts.sql

# 2. Remove the migration record
pnpm migrate -- --remove=035_seed_measurement_field_concepts.sql

# 3. Re-run migrations
pnpm migrate
```

#### Consolidating Migrations (Before Production)

Before deploying to production, consolidate multiple related migrations into a single migration:

```bash
# Consolidate migrations 034-037 into one file
pnpm consolidate-migrations -- --from=034 --to=037 --output=038_consolidated_measurement_fields.sql
```

This creates a single migration file that combines the SQL from all migrations in the range. After consolidation:

1. Test the consolidated migration on a development database
2. Update `scripts/run-migrations.js` to remove individual migrations and add the consolidated one
3. Delete individual migration files (optional - keep for history)

**Example Consolidation Workflow:**

```bash
# 1. Consolidate related migrations
pnpm consolidate-migrations -- --from=034 --to=037 --output=038_consolidated_measurement_fields.sql

# 2. Test the consolidated migration
pnpm migrate -- --remove=034_audit_measurement_fields.sql
pnpm migrate -- --remove=035_seed_measurement_field_concepts.sql
pnpm migrate -- --remove=036_fix_measurement_field_concepts.sql
pnpm migrate -- --remove=037_force_fix_measurement_field_concepts.sql
pnpm migrate  # Should run the consolidated migration

# 3. Update run-migrations.js to use consolidated migration
# 4. Commit changes
```

### Project Structure

```
insight-gen/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── components/        # React components
│   └── page.tsx          # Main page
├── components/            # Shared components
├── lib/                   # Utility libraries
│   ├── ai/               # AI provider configurations
│   ├── services/         # Business logic services
│   └── types/            # TypeScript type definitions
├── database/             # Database migrations
├── docs/                 # Documentation
└── scripts/              # Build and deployment scripts
```

## Production Deployment

### Docker Production Build

For production deployment, use the production Dockerfile:

```bash
# Build production image
docker build -f Dockerfile.prod -t insight-gen:prod .

# Run production container
docker run -p 3005:3005 insight-gen:prod
```

### Production Docker Compose

```bash
# Start production stack
docker-compose -f docker-compose.prod.yml up -d
```

### Production Environment Variables

Create a production `.env` file:

```env
# Database
INSIGHT_GEN_DB_URL=postgresql://user:password@db:5432/insight_gen_db
SILHOUETTE_DB_URL=your_sql_server_connection_string

# AI Providers
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json

# Application
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=https://yourdomain.com
```

## Documentation

For detailed information about specific aspects of the project, refer to the documentation in the `docs/` directory:

- **API Documentation**: `docs/api.md`
- **Design Documents**: `docs/design/`
  - Application Flow: `docs/design/app_flow.md`
  - Dockerization: `docs/design/dockerization-and-separate-db.md`
  - Query Enrichment: `docs/design/query_enrichment.md`
  - Charting Design: `docs/design/agnostic-charting-design.md`
- **Database Schema**: `lib/database-schema-context.md`
- **Deployment**: `README-DEPLOYMENT.md`

## Contributing

This project follows the workspace rules and coding standards defined in the project configuration. Key principles include:

- **Good taste**: Start from data structures & data flow
- **Never break userspace**: Maintain backward compatibility
- **Ruthless simplicity**: Avoid over-engineering
- **Single responsibility**: One thing per function/class

## License

This project is proprietary software developed for Silhouette Central.
