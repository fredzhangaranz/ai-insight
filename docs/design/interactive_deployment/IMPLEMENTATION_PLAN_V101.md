# Implementation Plan: Customer Setup & Discovery Integration (v1.0.1)

**Status:** Implementation Started  
**Date:** February 3, 2026  
**Sprint:** v1.0.1 (Post-v1.0 Release)  
**Effort:** 3-4 days

---

## Overview

Integrate customer setup and schema discovery into the interactive deployment wizard with:

- Hybrid approach (user chooses: start now or defer)
- Database size estimation
- Time prediction
- Clear messaging
- Status tracking

---

## Implementation Phases

### Phase 1: Core Setup Changes (Day 1)

#### 1.1 Extend Validation Schemas

**File:** `lib/config/validation.ts`

Add customer setup validation:

```typescript
export const CustomerSetupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().min(1, "Customer name required").max(100),
  code: z.string().regex(/^[a-z0-9-]+$/, "Invalid customer code"),
  silhouetteDbUrl: z.string().url("Invalid database URL"),
  silhouetteVersion: z.string().optional(),
  discoveryMode: z.enum(["start_now", "defer"]).default("start_now"),
  skipIfExists: z.boolean().default(false),
});
```

#### 1.2 Extend Config Manager

**File:** `lib/config/deployment-config.ts`

Add customer-related methods:

```typescript
class DeploymentConfigManager {
  // Existing methods...

  async createCustomer(config: CustomerSetupConfig): Promise<{
    id: string;
    code: string;
    estimatedDiscoveryTime: number;
  }> {
    // Call API to create customer
  }

  async estimateDatabaseSize(dbUrl: string): Promise<{
    formCount: number;
    recordCount: number;
    tableCount: number;
    estimatedMinutes: number;
  }> {
    // Analyze database and estimate
  }

  async startDiscovery(customerCode: string): Promise<void> {
    // Start discovery process
  }
}
```

### Phase 2: Wizard Enhancement (Day 1-2)

#### 2.1 Add Customer Setup Steps

**File:** `scripts/setup.ts`

Add new methods:

```typescript
class DeploymentWizard {
  // Existing methods...

  async setupCustomer(): Promise<CustomerConfig> {
    console.log(chalk.yellow("4️⃣  Customer Setup\n"));

    const name = await this.prompter.input({
      question: "Customer Name (e.g., 'Acme Healthcare'):",
      validate: (v) => v.length > 0,
    });

    const code = await this.prompter.input({
      question: "Customer Code (lowercase, alphanumeric, dashes):",
      validate: (v) => /^[a-z0-9-]+$/.test(v),
    });

    const dbUrl = await this.prompter.input({
      question: "Silhouette Database URL:",
    });

    // Test connection and estimate
    const spinner = ora("Testing connection...").start();
    const result = await this.configManager.testConnection(dbUrl);

    if (!result.success) {
      spinner.fail(`Connection failed: ${result.error}`);
      throw new Error("Database connection failed");
    }

    spinner.succeed("Connection successful");

    // Estimate discovery time
    const spinner2 = ora("Analyzing database size...").start();
    const estimate = await this.configManager.estimateDatabaseSize(dbUrl);
    spinner2.succeed(
      `Database: ${estimate.formCount} forms, ${estimate.recordCount.toLocaleString()} records`,
    );

    console.log(
      chalk.gray(
        `\n📊 Estimated discovery time: ${estimate.estimatedMinutes}-${estimate.estimatedMinutes + 5} minutes\n`,
      ),
    );

    return { name, code, dbUrl, ...estimate };
  }

  async setupDiscoveryMode(estimate: any): Promise<"start_now" | "defer"> {
    console.log(chalk.yellow("5️⃣  Schema Discovery\n"));

    console.log(
      chalk.gray(`
⚠️  Schema Discovery Required

Your database must be analyzed before you can use the app.
This discovers forms, fields, and tables for AI-powered queries.

🕐 Estimated time: ${estimate.estimatedMinutes}-${estimate.estimatedMinutes + 5} minutes
   (Based on ${estimate.formCount} forms, ${estimate.recordCount.toLocaleString()} records)
    `),
    );

    const choice = await this.prompter.select(
      "How would you like to proceed?",
      [
        {
          name: `✅ Start discovery now (wait ${estimate.estimatedMinutes}-${estimate.estimatedMinutes + 5} min)`,
          value: "start_now",
        },
        {
          name: "⏳ Run discovery later (manually from admin)",
          value: "defer",
        },
      ],
    );

    return choice as "start_now" | "defer";
  }
}
```

#### 2.2 Integrate Into Main Flow

Update `run()` method in setup.ts:

```typescript
async run(options: CLIOptions): Promise<void> {
  try {
    // ... existing setup ...

    // NEW: Customer Setup
    const customer = await this.setupCustomer();
    this.config.customer = customer;

    // NEW: Discovery Mode Choice
    const discoveryMode = await this.setupDiscoveryMode(customer);

    if (discoveryMode === "start_now") {
      // Run discovery in wizard
      await this.runDiscoveryInWizard(customer.code);
    }

    // Run automation
    await this.runAutomation();

    // Show summary
    await this.showSummary();

  } catch (error) {
    // ... error handling ...
  }
}
```

### Phase 3: Discovery Integration (Day 2)

#### 3.1 Discovery Streaming

**File:** `scripts/setup.ts`

Add discovery runner:

```typescript
async runDiscoveryInWizard(customerCode: string): Promise<void> {
  console.log(chalk.yellow("\n🔍 Running Schema Discovery\n"));

  const tasks = new Listr(
    [
      {
        title: "Starting discovery process",
        task: async () => {
          await this.configManager.startDiscovery(customerCode);
        },
      },
    ],
    { concurrent: false }
  );

  await tasks.run();

  // Stream discovery progress
  let lastProgress = 0;
  for await (const event of this.configManager.streamDiscoveryProgress(customerCode)) {
    if (event.progress > lastProgress) {
      console.log(
        chalk.cyan(`[${event.stage}] `) +
        chalk.gray(`${event.progress}% - ${event.message}`)
      );
      lastProgress = event.progress;
    }
  }

  console.log(chalk.green("\n✓ Discovery complete!\n"));
}
```

#### 3.2 Deferred Discovery Instructions

Update summary display:

```typescript
async showSummary(): Promise<void> {
  // ... existing summary ...

  if (this.config.customer?.discoveryMode === "defer") {
    console.log(chalk.yellow("\n⚠️  Schema Discovery Pending\n"));
    console.log(chalk.gray(`
Your database schema discovery is ready to run but hasn't
been started yet. You can run it whenever convenient:

How to start discovery:
  1. pnpm dev
  2. Open http://localhost:3005/admin
  3. Login with your admin credentials
  4. Go to "Customers" → your customer → "Discovery" tab
  5. Click "Run Discovery"
  6. Let it complete (${this.config.customer?.estimatedMinutes}-${this.config.customer?.estimatedMinutes! + 5} minutes)

Once complete, you'll have full access to all features!
    `));
  }
}
```

### Phase 4: Status Tracking (Day 2-3)

#### 4.1 Discovery Status Component

**File:** `components/admin/DiscoveryStatus.tsx`

```typescript
export const DiscoveryStatus = ({ customerId }: { customerId: string }) => {
  const [status, setStatus] = useState<"pending" | "in_progress" | "complete">("pending");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Poll discovery status
    const interval = setInterval(async () => {
      const res = await fetch(`/api/admin/customers/${customerId}/discovery-status`);
      const data = await res.json();
      setStatus(data.status);
      setProgress(data.progress);
    }, 2000);

    return () => clearInterval(interval);
  }, [customerId]);

  if (status === "complete") {
    return <SuccessMessage />;
  }

  if (status === "in_progress") {
    return (
      <div>
        <p>Discovery in progress: {progress}%</p>
        <ProgressBar value={progress} />
      </div>
    );
  }

  return (
    <div>
      <p>Discovery pending. Ready to start?</p>
      <Button onClick={() => startDiscovery(customerId)}>
        Start Now
      </Button>
    </div>
  );
};
```

#### 4.2 Dashboard Banner

**File:** `app/page.tsx` or middleware

Show banner if discovery pending:

```typescript
async function checkDiscoveryStatus(customerId: string) {
  const status = await getDiscoveryStatus(customerId);

  if (status === "pending") {
    return (
      <Banner type="warning">
        <strong>Setup Required:</strong> Database schema discovery hasn't started yet.
        <Link href="/admin/discovery">Start Discovery →</Link>
      </Banner>
    );
  }

  if (status === "in_progress") {
    return (
      <Banner type="info">
        <strong>Indexing in Progress:</strong> Your database is being analyzed.
        Features are limited until complete.
        <Link href="/admin/discovery">View Progress →</Link>
      </Banner>
    );
  }

  return null;
}
```

### Phase 5: Documentation (Day 3)

#### 5.1 Update README-DEPLOYMENT.md

Add customer setup section:

```markdown
## Customer Setup & Discovery

During setup, you'll be prompted to:

1. **Create a customer/organization**
   - Name (e.g., "Acme Healthcare")
   - Code (unique identifier)

2. **Connect to Silhouette database**
   - Provide connection string
   - Wizard tests connection

3. **Choose discovery timing**
   - Start now (recommended): Discovery runs immediately (10-15+ min)
   - Run later: Complete setup quickly, run discovery anytime

Discovery analyzes your database for:

- Forms and assessment fields
- Data types and relationships
- Tables and columns
- Semantic concepts

**Discovery is required before using the app.**
```

#### 5.2 Update NEXT_STEPS.md

Add customer setup testing:

```markdown
## Testing Customer Setup

1. Run wizard:
   pnpm setup:beta

2. Follow customer setup prompts
   - Enter customer name
   - Enter Silhouette DB URL
   - See estimated discovery time

3. Choose discovery mode:
   - Start now: Wait for discovery
   - Run later: Exit quickly

4. Verify customer created:
   - Open admin panel
   - Check Customers page
```

---

## Implementation Checklist

### Code Changes

- [ ] Add customer validation schemas
- [ ] Extend DeploymentConfigManager
- [ ] Add setupCustomer() to wizard
- [ ] Add setupDiscoveryMode() to wizard
- [ ] Add runDiscoveryInWizard() to wizard
- [ ] Create DiscoveryStatus component
- [ ] Add discovery check to app startup
- [ ] Create discovery-status API endpoint
- [ ] Update showSummary() for deferred mode

### Testing

- [ ] Test customer creation
- [ ] Test DB connection validation
- [ ] Test discovery time estimation
- [ ] Test "start now" flow (full flow)
- [ ] Test "run later" flow (quick exit)
- [ ] Test status updates during discovery
- [ ] Test dashboard banner
- [ ] Test on Windows/Mac/Linux

### Documentation

- [ ] Update README-DEPLOYMENT.md
- [ ] Update NEXT_STEPS.md
- [ ] Update QUICK_START_WIZARD.md
- [ ] Add discovery status screenshots
- [ ] Update troubleshooting guide

### Quality

- [ ] Run linter
- [ ] Run tests
- [ ] Check TypeScript types
- [ ] Review error handling
- [ ] Performance check

---

## Files to Create

```
lib/config/
├── customer-setup.ts               (NEW - customer setup manager)
└── discovery-manager.ts            (NEW - discovery orchestration)

app/api/admin/customers/
├── [code]/discovery-status/
│   └── route.ts                    (NEW - status endpoint)
└── [code]/discovery/
    └── start/
        └── route.ts                (NEW - start discovery endpoint)

components/admin/
├── DiscoveryStatus.tsx             (NEW - status display)
└── DiscoveryProgressModal.tsx      (NEW - progress modal)

scripts/
├── customer-setup-steps.ts         (NEW - extracted steps)
└── discovery-runner.ts             (NEW - discovery logic)
```

## Files to Modify

```
scripts/setup.ts                    (add customer & discovery flow)
lib/config/validation.ts            (add customer schema)
lib/config/deployment-config.ts     (add customer methods)
package.json                        (if new dependencies)
app/page.tsx or middleware.ts       (add discovery check)
README-DEPLOYMENT.md                (document customer setup)
NEXT_STEPS.md                       (add testing steps)
QUICK_START_WIZARD.md               (update flow)
```

---

## API Endpoints to Create

```
POST /api/admin/customers
  • Payload: { name, code, connectionString }
  • Returns: { id, code }

GET /api/admin/customers/[code]/discovery-status
  • Returns: { status: "pending|in_progress|complete", progress: 0-100 }

POST /api/admin/customers/[code]/discovery/start
  • Returns: { jobId, startedAt }

GET /api/admin/customers/[code]/discovery/events
  • Returns: Server-Sent Events stream of progress
  • Stream events: { stage, progress, message, eta }
```

---

## Timeline

| Day | Task                        | Output               |
| --- | --------------------------- | -------------------- |
| 1   | Validation + Config Manager | Core infrastructure  |
| 1-2 | Wizard integration          | Customer setup flow  |
| 2   | Discovery integration       | Start/defer decision |
| 2-3 | Status tracking             | Dashboard + banners  |
| 3   | Documentation               | Updated guides       |

---

## Risk Mitigation

| Risk                         | Mitigation                        |
| ---------------------------- | --------------------------------- |
| Long discovery blocks wizard | User can choose "run later"       |
| Large database hangs         | Progress streaming shows activity |
| Network interruption         | Status persists, can resume       |
| User forgets discovery       | Dashboard banner reminds them     |
| API not ready yet            | Use existing discovery API        |

---

## Success Criteria

✅ Customer setup works end-to-end  
✅ Discovery choice works (start now & defer)  
✅ Time estimation is accurate  
✅ Status displayed correctly  
✅ All tests pass  
✅ Works on Windows/Mac/Linux  
✅ No breaking changes  
✅ Documentation updated

---

## Next Steps

1. **Code Review:** Review this plan
2. **Approval:** Confirm we proceed
3. **Development:** Start Day 1 tasks
4. **Testing:** Test as we go
5. **Release:** Ship v1.0.1

---

**Ready to start? I'll begin with Phase 1 now!**
