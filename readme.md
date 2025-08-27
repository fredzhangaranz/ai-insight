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

## How to Build as a Developer

### Prerequisites

- Node.js 18 or higher
- pnpm package manager
- PostgreSQL database
- Access to Microsoft SQL Server (for clinical data)

### Environment Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create environment file `.env.local`:

   ```env
   # Database Connections
   INSIGHT_GEN_DB_URL=postgresql://user:password@localhost:5432/insight_gen_db
   SILHOUETTE_DB_URL=Server=server;Database=SilhouetteAIDashboard;User Id=user;Password=password;Encrypt=true;TrustServerCertificate=true

   # AI Provider Configuration
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json

   # Application Settings
   NEXTAUTH_SECRET=your_secret
   NEXTAUTH_URL=http://localhost:3005
   ```

### Database Setup

1. Run database migrations:

   ```bash
   pnpm migrate
   ```

2. Verify database tables:
   ```bash
   pnpm check-tables
   ```

### Development Commands

```bash
# Start development server
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

## Build with Docker

### Quick Start with Docker Compose

The easiest way to run InsightGen is using Docker Compose, which sets up both the application and PostgreSQL database:

```bash
# Start the entire stack
docker-compose up

# Start in detached mode
docker-compose up -d

# Stop the stack
docker-compose down
```

### Docker Configuration

The application uses a multi-stage Docker build:

1. **Base Stage**: Node.js 18 Alpine with pnpm
2. **Dependencies**: Install all npm packages
3. **Build Stage**: Compile Next.js application
4. **Production Stage**: Optimized runtime image

### Docker Compose Services

#### Application Service

- **Image**: Built from local Dockerfile
- **Port**: 3005 (mapped to host)
- **Environment**: Loaded from `.env.local`
- **Volumes**: Hot reload for development
- **Dependencies**: PostgreSQL database

#### PostgreSQL Service

- **Image**: postgres:15-alpine
- **Port**: 5432 (mapped to host)
- **Database**: insight_gen_db
- **Credentials**: user/password
- **Persistence**: Named volume for data

### Production Deployment

For production deployment, refer to the existing Docker documentation:

- **Dockerization Design**: See `docs/design/dockerization-and-separate-db.md`
- **Production Dockerfile**: `Dockerfile.prod`
- **Production Compose**: `docker-compose.prod.yml`
- **Deployment Guide**: `README-DEPLOYMENT.md`

### Environment Variables for Docker

Create a `.env.local` file with the following variables:

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
NEXTAUTH_URL=http://localhost:3005
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
