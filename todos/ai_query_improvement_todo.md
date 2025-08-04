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

- [x] Create minimal tables for POC:

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

- [x] Create basic indexes:
  ```sql
  CREATE INDEX [IX_SubQuestions_FunnelId] ON [rpt].[SubQuestions] ([funnelId]);
  CREATE INDEX [IX_SubQuestions_Order] ON [rpt].[SubQuestions] ([funnelId], [order]);
  CREATE INDEX [IX_QueryResults_SubQuestion] ON [rpt].[QueryResults] ([subQuestionId], [executionDate]);
  ```

### 1.5.2 Basic Storage Service (Milestone 2.6)

- [x] Implement FunnelStorageService:
  - Basic CRUD for funnels and sub-questions
  - Simple result storage and retrieval
  - Basic error handling
- [x] Add simple cleanup job for old results (e.g., older than 24 hours)
- [x] Create API endpoints for funnel operations:
  - POST/GET `/api/ai/funnel` (create and list funnels)
  - POST/GET `/api/ai/funnel/subquestions` (add and list sub-questions)
  - POST/GET `/api/ai/funnel/results` (store and retrieve results)
  - PUT `/api/ai/funnel/subquestions/[id]/status` (update sub-question status)
  - PUT `/api/ai/funnel/subquestions/[id]/sql` (update sub-question SQL)
- **Validation**: ✅ Storage service handles basic operations correctly with full API coverage

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

- [x] Implement SubQuestionGenerator service:
  - Method to break down complex questions
  - Validation of sub-question relationships
- [x] Implement FunnelQueryGenerator service:
  - Generate SQL for each sub-question
  - Validate query safety and performance
- [x] Add unit tests for both services
- [x] Create API endpoints for AI services:
  - POST `/api/ai/funnel/generate-subquestions` (break down complex questions)
  - POST `/api/ai/funnel/generate-query` (generate SQL for sub-questions)
- **Validation**: ✅ Services pass all unit tests with mock data and are accessible via API endpoints

### 2.2 API Endpoints (Milestone 4)

- [x] Create `/api/funnel/generate-subquestions`:
  - Accept original question and form definition
  - Return structured sub-questions
- [x] Create `/api/funnel/generate-query`:
  - Accept sub-question and context
  - Return validated SQL query
- [ ] Add API documentation
- **Validation**: ✅ All endpoints respond correctly with mock data and are fully functional

## Phase 3: Frontend Implementation

### 3.1 Basic UI Components (Milestone 5)

- [x] Create FunnelPanel component:
  - Display question
  - Show SQL query
  - Display data results
- [x] Create FunnelContainer component:
  - Manage multiple panels
  - Handle horizontal scrolling
- [x] Add basic styling and layout
- [x] Integrate with existing frontend workflow
- [x] Create funnel test page for testing with mock data
- [x] Integrate funnel workflow into existing question selection flow
- [x] Support both patient-specific and non-patient questions
- [x] Implement full-page funnel workflow (replaces entire page, not just right panel)
- [x] Improve funnel panel layout with main panel + preview navigation
- [x] Implement funnel workflow logic (sequential completion required)
- [x] Add visual feedback for locked/unavailable steps
- [x] Implement new 3-section layout (Top: Original Question, Middle: Sub-Questions Overview, Bottom: Current Panel)
- [x] Add scrollable sub-question overview cards with status indicators
- [x] Add JSON/Table toggle for result display
- **Validation**: ✅ Components render correctly with mock data and are integrated into the main application flow as full-page experience

### 3.2 Interactive Features (Milestone 6)

- [x] Add question editing capability:
  - Edit sub-questions
  - Clear SQL and results when question is edited
  - Regenerate SQL button (placeholder for future AI integration)
- [x] Implement SQL query editing:
  - SQL editor integration
  - Clear results when SQL is edited
- [x] Add data preview functionality
- **Validation**: ✅ All interactive features work with mock data and maintain data consistency

## Phase 4: Backend Integration

### 4.1 Sub-Question Generation API Integration (Milestone 7.1)

- [x] Connect "Generate Sub-Questions" button to `/api/ai/funnel/generate-subquestions`
- [x] Implement loading state during sub-question generation
- [x] Add error handling for sub-question generation failures
- [x] Update UI to display generated sub-questions in overview cards
- [x] Test with real AI API responses
- [x] Fix validation to support array dependencies in sub-questions
- **Validation**: ✅ Sub-questions are generated and displayed correctly from real API

### 4.2 SQL Generation API Integration (Milestone 7.2)

- [x] Connect "Regenerate SQL" button to `/api/ai/funnel/generate-query`
- [x] Implement loading state during SQL generation
- [x] Add error handling for SQL generation failures
- [x] Update SQL section to display generated queries
- [x] Test with real AI API responses
- **Validation**: ✅ SQL queries are generated and displayed correctly from real API

### 4.3 SQL Execution & Results Integration (Milestone 7.3)

- [x] Connect "Execute" button to database query execution
- [x] Implement loading state during query execution
- [x] Add error handling for query execution failures
- [x] Update results section to display real data
- [x] Test with real database queries and results
- **Validation**: ✅ SQL queries execute successfully and display real results

### 4.4 Caching Strategy Implementation (Milestone 7.4)

- [x] Design caching strategy for sub-questions and SQL queries
- [x] Implement caching for sub-question generation results
- [ ] Implement caching for SQL generation results
- [ ] **Decision needed**: Implement caching for query execution results (consider data size)
- [ ] Add cache invalidation logic when questions/SQL are edited
- [x] Test caching behavior with real data
- **Validation**: ✅ Sub-question caching works correctly and improves performance (6s → instant)

### 4.5 Error Handling & Retry Mechanisms (Milestone 7.5)

- [ ] Implement comprehensive error handling for all API calls
- [ ] Add retry mechanisms for transient failures
- [ ] Add user-friendly error messages
- [ ] Implement fallback behaviors for failed operations
- [ ] Test error scenarios and recovery
- **Validation**: ✅ System handles errors gracefully and provides good user feedback

## Phase 5: Data Flow Integration

### 5.1 Chart Generation Integration (Milestone 8)

- [ ] Integrate with existing chart generation flow
- [ ] Add data transformation layer for chart compatibility
- [ ] Implement chart type recommendation based on query results
- [ ] Test end-to-end flow from query to chart
- **Validation**: End-to-end flow works with real data

## Phase 6: Enhancement and Polish

### 6.1 UX Improvements (Milestone 9)

- [ ] Add progress indicators
- [ ] Implement undo/redo functionality
- [ ] Add keyboard shortcuts
- [ ] Improve error messages and user feedback
- **Validation**: User testing confirms improved experience

### 6.2 Performance Optimization (Milestone 10)

- [ ] Add lazy loading for panels
- [ ] Optimize SQL query generation
- [ ] Add performance monitoring
- [ ] Implement advanced caching strategies (if needed)
- **Validation**: Performance metrics meet targets

## Phase 7: Testing and Documentation

### 7.1 Testing (Milestone 11)

- [ ] Add end-to-end tests
- [ ] Implement integration tests
- [ ] Add load testing for API endpoints
- [ ] Test caching behavior under load
- **Validation**: All test suites pass

### 7.2 Documentation (Milestone 12)

- [ ] Update API documentation
- [ ] Add user guide
- [ ] Create developer documentation
- [ ] Document prompt templates and their usage
- [ ] Document caching strategy and decisions
- **Validation**: Documentation review complete

## Notes

- Each milestone should be completed and validated before moving to the next
- UI components can be developed with mock data initially
- Integration should be done incrementally to catch issues early
- Regular testing should be performed throughout development

## Caching Strategy Considerations

### What to Cache:

- ✅ **Sub-questions**: Small text data, safe to cache
- ✅ **SQL queries**: Small text data, safe to cache
- ❓ **Query results**: Large data, need careful consideration

### Query Results Caching Options:

1. **No caching**: Always execute fresh queries (simplest, most accurate)
2. **Limited caching**: Cache small result sets (< 1000 rows) for 1 hour
3. **Smart caching**: Cache based on query hash + data freshness requirements
4. **User-controlled**: Let users choose to cache specific results

### Cache Invalidation Rules:

- **Sub-questions**: Invalidated when original question changes
- **SQL queries**: Invalidated when sub-question text changes
- **Query results**: Invalidated when SQL query changes or data freshness expires

### Performance Considerations:

- **Memory usage**: Large result sets can consume significant memory
- **Database load**: Caching reduces database queries but increases memory usage
- **User experience**: Caching improves response time but may show stale data

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
