# Dockerization and Separate Database Design Document

## 1. Problem Statement

Currently, the AI insight application has a few key challenges that hinder its ease of use for developers and pose potential risks in a production environment:

1.  **Shared Database:** AI insight relevant table structures are part of the test database. This is not ideal as we do not want our AI insight and all tool relevant data to be stored in our customer database. Storing tool-specific data separately from customer data is crucial for security, scalability, and data integrity.

2.  **Direct Customer Database Connection:** The tool needs to connect directly to the customer database to read data. Due to customer data privacy and protection rules, the most straightforward approach to enable this is to deploy the application in the same private network as the customer database, which is hosted on Azure.

3.  **Deployment Complexity:** To ensure the application can be easily configured and deployed, a more streamlined process is needed. A containerized approach would allow for consistent environments and simplified deployments.

## 2. Proposed Solution

To address these challenges, we propose the following:

1.  **Separate Tool-Specific Database:** We will introduce a separate database to store all tool-specific data, such as AI insight tables, user configurations, and other application-specific information. This database will be independent of the customer's database.

2.  **Containerization with Docker:** We will use Docker to containerize the application and its dependencies. This will ensure that the application runs in a consistent and isolated environment, both for local development and production deployments. A `docker-compose` setup will be created to manage the application and its new, separate database.

3.  **Secure Database Connection:** The application will continue to connect to the customer's database for read-only operations. By deploying the application within the same Azure private network, we can maintain a secure and low-latency connection without exposing the customer's database to the public internet.

## 3. Database Selection

For the tool-specific database, we recommend using **PostgreSQL**.

### Rationale:

- **Consistency:** The project already uses SQL and has a migration system in place (`database/migration/`). Sticking with a relational database like PostgreSQL will be a natural fit and require minimal changes to the existing data access patterns.
- **Features and Scalability:** PostgreSQL is a powerful, open-source object-relational database system with a strong reputation for reliability, feature robustness, and performance. It can handle a wide variety of workloads and scales well as the application's needs grow.
- **Cloud Support:** PostgreSQL is well-supported by major cloud providers, including Azure. Azure Database for PostgreSQL is a fully managed service that simplifies the setup, maintenance, and scaling of PostgreSQL databases in the cloud.
- **Local Development:** For local development, we can easily run PostgreSQL in a Docker container, ensuring that the development environment closely mirrors the production environment. For simpler local setups, we could also consider using SQLite, but PostgreSQL in Docker is preferred for consistency.

While a NoSQL database could be considered, the existing data structures and the relational nature of the AI insight data make a relational database like PostgreSQL a more suitable choice.

## 4. Docker as a Deployment Strategy

Using Docker is an excellent choice for achieving the desired deployment goals.

### Rationale:

- **Consistency:** Docker containers package the application and all its dependencies into a single, immutable artifact. This ensures that the application runs the same way, regardless of where it is deployed, eliminating the "it works on my machine" problem.
- **Portability:** Docker containers can run on any machine that has Docker installed, whether it's a developer's laptop, an on-premises server, or a cloud provider like Azure.
- **Simplified Setup:** With a `docker-compose.yml` file, a developer can spin up the entire application stack, including the application server and the PostgreSQL database, with a single command (`docker-compose up`). This dramatically simplifies the local development setup.
- **Scalability:** Docker makes it easy to scale the application horizontally by running multiple instances of the application container. This can be managed with container orchestration platforms like Kubernetes, which is available on Azure as Azure Kubernetes Service (AKS).

## 5. High-Level Implementation Plan

1.  **Create a Dockerfile:** Create a `Dockerfile` for the Next.js application.
2.  **Set up Docker Compose:** Create a `docker-compose.yml` file to define the application service and a PostgreSQL service.
3.  **Update Database Connection Logic:** Modify the application's database connection logic to connect to two databases:
    - The new PostgreSQL database for tool-specific data (read/write).
    - The customer's database (read-only).
    - Connection details for both databases will be managed through environment variables.
4.  **Migrate AI Insight Tables:** Create new migration scripts to set up the AI insight tables in the new PostgreSQL database.
5.  **Update Data Access Code:** Update the application's data access code to read and write from the appropriate database.
6.  **Documentation:** Update the project's documentation to include instructions on how to set up and run the application using Docker.
