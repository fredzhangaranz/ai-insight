# AI Query Workflow Improvement Todo List

## Phase 1: Foundation Setup

### 1.1 Types and Interfaces (Milestone 1)

- [x] Create new types for funnel-based query generation:
  ```typescript
  // lib/types/funnel.ts
  export type SubQuestionStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed";
  export interface SubQuestion {
    id: string;
    text: string;
    order: number;
    sqlQuery?: string;
    data?: any[];
    status: SubQuestionStatus;
    lastExecutionDate?: Date;
  }
  export type QueryFunnelStatus = "active" | "archived";
  export interface QueryFunnel {
    id: string;
    assessmentFormVersionFk: string;
    originalQuestion: string;
    subQuestions: SubQuestion[];
    status: QueryFunnelStatus;
    createdDate: Date;
    lastModifiedDate: Date;
  }
  ```
- [x] Add new prompt types for sub-question generation
- [x] Add validation types for SQL query generation
- **Validation**: All new types compile without errors and integrate with existing types.ts

### 1.2 New Prompt Templates (Milestone 2)

- [x] Create `funnel-subquestions.prompt.ts`:
  - Implement prompt for breaking down complex questions
  - Include context management for maintaining question relationships
  - Add template matching logic to identify common patterns
- [x] Create `funnel-sql.prompt.ts`:
  - Implement prompt for generating SQL for each sub-question
  - Include validation rules and safety checks
  - Add query template selection logic
- [x] Update prompt index to export new prompts
- **Validation**: New prompts can be loaded and compiled successfully

## Phase 1.5: Basic Storage Infrastructure

### 1.5.1 Database Schema Updates (Milestone 2.5)

- [ ] Create minimal tables for POC:

  ```sql
  -- Core table for storing question breakdowns
  CREATE TABLE [rpt].[QueryFunnel] (
    [id] [int] IDENTITY(1,1) NOT NULL,
    [assessmentFormVersionFk] [uniqueidentifier] NOT NULL,
    [originalQuestion] [nvarchar](1000) NOT NULL,
    [status] [nvarchar](50) NOT NULL DEFAULT ('active'), -- 'active' or 'archived'
    [createdDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
    [lastModifiedDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
    CONSTRAINT [PK_QueryFunnel] PRIMARY KEY CLUSTERED ([id] ASC)
  );

  -- Store sub-questions and their queries
  CREATE TABLE [rpt].[SubQuestions] (
    [id] [int] IDENTITY(1,1) NOT NULL,
    [funnelId] [int] NOT NULL,
    [questionText] [nvarchar](1000) NOT NULL,
    [order] [int] NOT NULL,
    [sqlQuery] [nvarchar](max) NULL,
    [status] [nvarchar](50) NOT NULL DEFAULT ('pending'), -- 'pending', 'completed', 'failed'
    [lastExecutionDate] [datetime] NULL,
    CONSTRAINT [PK_SubQuestions] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [FK_SubQuestions_QueryFunnel] FOREIGN KEY ([funnelId])
      REFERENCES [rpt].[QueryFunnel] ([id])
  );

  -- Simple result caching
  CREATE TABLE [rpt].[QueryResults] (
    [id] [int] IDENTITY(1,1) NOT NULL,
    [subQuestionId] [int] NOT NULL,
    [resultData] [nvarchar](max) NOT NULL, -- JSON field for storing query results
    [executionDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
    CONSTRAINT [PK_QueryResults] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [FK_QueryResults_SubQuestions] FOREIGN KEY ([subQuestionId])
      REFERENCES [rpt].[SubQuestions] ([id])
  );
  ```

- [ ] Create basic indexes:
  ```sql
  CREATE INDEX [IX_SubQuestions_FunnelId] ON [rpt].[SubQuestions] ([funnelId]);
  CREATE INDEX [IX_SubQuestions_Order] ON [rpt].[SubQuestions] ([funnelId], [order]);
  CREATE INDEX [IX_QueryResults_SubQuestion] ON [rpt].[QueryResults] ([subQuestionId], [executionDate]);
  ```

### 1.5.2 Basic Storage Service (Milestone 2.6)

- [ ] Implement FunnelStorageService:
  - Basic CRUD for funnels and sub-questions
  - Simple result storage and retrieval
  - Basic error handling
- [ ] Add simple cleanup job for old results (e.g., older than 24 hours)
- **Validation**: Storage service handles basic operations correctly

## Phase 1.6: Dynamic Template Management for Prompts

### 1.6.1 Centralize Template Storage

- [ ] Create a JSON file for query templates (e.g., `lib/prompts/templates/query-templates.json`)
  - Each template should have: `name`, `description`, `examples` (sample questions), and `sqlPattern` (parameterized SQL snippet)
  - Example:
    ```json
    {
      "name": "Aggregation by Category",
      "description": "Aggregate numeric fields grouped by categorical columns.",
      "examples": ["Average wound area by etiology."],
      "sqlPattern": "SELECT {categoryColumn}, AVG({numericColumn}) FROM {table} GROUP BY {categoryColumn}"
    }
    ```
- [ ] (Optional for production) Create a database table for templates

### 1.6.2 Dynamic Template Loading

- [ ] Update prompt construction helpers to load templates from the JSON file
- [ ] Render the template list (name, description, examples) into the prompt at runtime for both sub-question and SQL prompts
- [ ] If a template has a `sqlPattern`, make it available to the query generation logic for auto-suggestion or substitution
- [ ] Ensure prompt always reflects the latest templates without code changes

### 1.6.3 Template Management (Optional, for future)

- [ ] Add CLI or admin UI for managing templates (add, edit, remove)
- [ ] Add versioning/audit trail for template changes

### 1.6.4 Validation

- [ ] Add tests to ensure prompt construction works with dynamic templates
- [ ] Add validation to prevent malformed templates

## Phase 2: Backend Implementation

### 2.1 Core Services (Milestone 3)

- [ ] Implement SubQuestionGenerator service:
  - Method to break down complex questions
  - Validation of sub-question relationships
- [ ] Implement FunnelQueryGenerator service:
  - Generate SQL for each sub-question
  - Validate query safety and performance
- [ ] Add unit tests for both services
- **Validation**: Services pass all unit tests with mock data

### 2.2 API Endpoints (Milestone 4)

- [ ] Create `/api/funnel/generate-subquestions`:
  - Accept original question and form definition
  - Return structured sub-questions
- [ ] Create `/api/funnel/generate-query`:
  - Accept sub-question and context
  - Return validated SQL query
- [ ] Add API documentation
- **Validation**: All endpoints respond correctly with mock data

## Phase 3: Frontend Implementation

### 3.1 Basic UI Components (Milestone 5)

- [ ] Create FunnelPanel component:
  - Display question
  - Show SQL query
  - Display data results
- [ ] Create FunnelContainer component:
  - Manage multiple panels
  - Handle horizontal scrolling
- [ ] Add basic styling and layout
- **Validation**: Components render correctly with mock data

### 3.2 Interactive Features (Milestone 6)

- [ ] Add question editing capability:
  - Edit sub-questions
  - Regenerate subsequent queries
- [ ] Implement SQL query editing:
  - SQL editor integration
  - Query validation
- [ ] Add data preview functionality
- **Validation**: All interactive features work with mock data

## Phase 4: Integration

### 4.1 Backend Integration (Milestone 7)

- [ ] Connect FunnelPanel to real API endpoints
- [ ] Implement error handling and loading states
- [ ] Add retry mechanisms for failed queries
- **Validation**: Components work with real backend services

### 4.2 Data Flow Integration (Milestone 8)

- [ ] Integrate with existing chart generation flow
- [ ] Add data transformation layer
- [ ] Implement caching for query results
- **Validation**: End-to-end flow works with real data

## Phase 5: Enhancement and Polish

### 5.1 UX Improvements (Milestone 9)

- [ ] Add progress indicators
- [ ] Implement undo/redo functionality
- [ ] Add keyboard shortcuts
- [ ] Improve error messages and user feedback
- **Validation**: User testing confirms improved experience

### 5.2 Performance Optimization (Milestone 10)

- [ ] Implement query result caching
- [ ] Add lazy loading for panels
- [ ] Optimize SQL query generation
- [ ] Add performance monitoring
- **Validation**: Performance metrics meet targets

## Phase 6: Testing and Documentation

### 6.1 Testing (Milestone 11)

- [ ] Add end-to-end tests
- [ ] Implement integration tests
- [ ] Add load testing for API endpoints
- **Validation**: All test suites pass

### 6.2 Documentation (Milestone 12)

- [ ] Update API documentation
- [ ] Add user guide
- [ ] Create developer documentation
- [ ] Document prompt templates and their usage
- **Validation**: Documentation review complete

## Notes

- Each milestone should be completed and validated before moving to the next
- UI components can be developed with mock data initially
- Integration should be done incrementally to catch issues early
- Regular testing should be performed throughout development

## Future Improvements

### 1. Advanced Query Graph Implementation

- Replace linear funnel with DAG (Directed Acyclic Graph) structure
- Implement parallel execution of independent questions
- Add question reuse and result sharing
- Build graph visualization tools

### 2. Materialized Views Optimization

- Automatic materialized view creation for frequent patterns
- View lifecycle management based on usage
- Incremental view updates
- Resource usage optimization

### 3. Advanced Caching Strategies

- Implement predictive cache warming
- Add partial cache updates
- Build cache dependency graph
- Implement distributed caching

### 4. AI-Powered Query Optimization

- Learn from query execution patterns
- Automatic query refactoring
- Dynamic resource allocation
- Query cost prediction

### 5. Enhanced Error Recovery

- Implement multiple recovery strategies
- Add automatic fallback options
- Build comprehensive error tracking
- Implement automated recovery workflows

### 6. User Feedback Integration

- Add feedback collection system
- Implement feedback-based prompt improvement
- Build query suggestion system
- Create query effectiveness metrics

### 7. Advanced Monitoring and Analytics

- Real-time query performance monitoring
- Usage pattern analysis
- Resource utilization tracking
- Cost optimization recommendations

### 8. Enhanced Caching and Storage

- Add sophisticated caching with invalidation rules:
  ```typescript
  interface CacheStrategy {
    invalidationRules: {
      timeBasedExpiry: boolean;
      dataVersioning: boolean;
      formVersioning: boolean;
    };
    warmingStrategy: {
      preloadPopularQueries: boolean;
      predictiveWarming: boolean;
    };
  }
  ```
- Implement query template storage and matching
- Add execution metrics and performance tracking
- Implement distributed caching
- Add partial result updates
- Build cache dependency management
- Implement advanced cleanup strategies
- Add data versioning support

### 9. Query Template System

- Template storage and management
- Pattern matching for common queries
- Template performance tracking
- Automatic template generation from successful queries
- Template versioning and validation

## Implementation Notes

- Focus on getting the basic funnel workflow working end-to-end first
- Add template support early as it will improve reliability
- Keep execution tracking from the start for future optimization
- Design for extensibility but avoid over-engineering initial implementation
- Validate each step with real user scenarios
- Collect metrics from day one to guide future improvements
