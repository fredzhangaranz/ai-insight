# Dockerization and Separate Database Implementation Plan

This document outlines the steps to containerize the application using Docker and to separate the tool-specific database from the customer database.

## Phase 1: Docker Setup [Completed]

### 1.1. Create a `Dockerfile` [Completed]

- **Goal:** Create a `Dockerfile` in the project root to define the application's container image.
- **Steps:**
  1.  Use a Node.js base image (e.g., `node:18-alpine`).
  2.  Set the working directory.
  3.  Copy `package.json`, `pnpm-lock.yaml`, and other relevant configuration files.
  4.  Install dependencies using `pnpm install`.
  5.  Copy the rest of the application code.
  6.  Build the Next.js application.
  7.  Expose the application port (e.g., 3000).
  8.  Define the command to start the application.

### 1.2. Create a `.dockerignore` file [Completed]

- **Goal:** Prevent unnecessary files from being copied into the Docker image to reduce image size and build times.
- **Steps:**
  1.  Create a `.dockerignore` file in the project root.
  2.  Add `node_modules`, `.next`, `*.log`, `.env.local`, and other unnecessary files and directories.

### 1.3. Set up Docker Compose [Completed]

- **Goal:** Create a `docker-compose.yml` file to manage the application and its database services.
- **Services:**
  - `app`: The Next.js application.
    - Build from the `Dockerfile`.
    - Map ports.
    - Set up environment variables for database connections.
    - Mount volumes for local development (optional).
  - `db`: The PostgreSQL database for tool-specific data.
    - Use the official PostgreSQL image (e.g., `postgres:15-alpine`).
    - Set up environment variables for the database name, user, and password.
    - Define a volume to persist database data.

## Phase 2: Database Separation [In Progress]

### 2.1. Update Database Connection Logic [Completed]

- **Goal:** Modify the application to connect to two separate databases.
- **Steps:**
  1.  Update `lib/db.ts` to manage two database connections:
      - `insightGenDb`: For the new PostgreSQL database (read/write).
      - `customerDb`: For the customer's database (read-only).
  2.  Use a library like `node-postgres` (pg) for the PostgreSQL connection.
  3.  Use environment variables to configure connection details for both databases (e.g., `INSIGHT_GEN_DB_URL`, `CUSTOMER_DB_URL`).

### 2.2. Migrate AI Insight Tables [Completed]

- **Goal:** Create a new set of migration scripts for the tool-specific database.
- **Steps:**
  1.  Create a new directory for the tool-specific migrations (e.g., `database/tool-migration/`).
  2.  Copy the existing migration scripts for the AI insight tables to the new directory.
  3.  Modify the scripts to be compatible with PostgreSQL if necessary.

### 2.2.1. Running Migrations [Completed]

- **Goal:** Apply the migration scripts to the tool-specific database.
- **Process:** The project does not use an automated migration tool. Migrations must be run manually.
- **Steps:**
  1.  Start the PostgreSQL database using Docker: `docker-compose up -d db`.
  2.  Connect to the database container: `docker-compose exec -T db psql -U user -d insight_gen_db`.
  3.  Run each migration script in order using the `\i` command. For example: `\i /app/database/migration/001_create_ai_analysis_plan_cache.sql`.

### 2.3. Refactor Data Access Code [Pending]

- **Goal:** Update the application's code to use the correct database connection for each query.
- **Steps:**
  1.  Identify all database queries in the application.
  2.  Update queries related to AI insights and other tool-specific data to use the `insightGenDb` connection.
  3.  Ensure all queries to the customer's data use the `customerDb` connection and are read-only.

## Phase 3: Validation and Documentation [Pending]

### 3.1. Local Validation [Pending]

- **Goal:** Ensure the new Docker setup works as expected.
- **Steps:**
  1.  Run `docker-compose up --build` to build the images and start the services.
  2.  Verify that the application is accessible in the browser.
  3.  Test all features to ensure that data is being read from and written to the correct databases.
  4.  Check the database volumes to ensure data is being persisted.

### 3.2. Update Documentation [Pending]

- **Goal:** Update the project's documentation with instructions for the new setup.
- **Steps:**
  1.  Update the `README.md` with a "Getting Started with Docker" section.
  2.  Explain how to configure the environment variables for the database connections.
  3.  Provide instructions on how to run the application using `docker-compose`.
