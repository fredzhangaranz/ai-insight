# Integration Proposal: Customer Setup & Discovery in Deployment Wizard

**Status:** Proposal for Review  
**Date:** February 3, 2026  
**Scope:** Add customer initialization workflow to interactive setup wizard

---

## Problem Statement

**Current Flow:**

1. Deploy application (via setup wizard)
2. Admin manually creates customer via UI
3. Admin tests connection
4. Admin runs discovery manually
5. **Only then** can users start using the application

**Issues:**

- Multiple manual steps after deployment
- Users don't know discovery must run first
- Error-prone (easy to skip steps)
- No guidance on what's needed
- Discovery can fail silently

**Proposed:** Integrate customer setup + discovery into the wizard so it's guided and automatic.

---

## Proposed Workflow

### New Deployment Flow (After Setup Wizard)

```
┌─────────────────────────────────────────┐
│ pnpm setup:beta / pnpm setup:production │
└────────────┬────────────────────────────┘
             │
      ✓ Database ready
      ✓ Admin user created
             │
             ▼
┌─────────────────────────────────────────────────┐
│ NEW: Customer Setup & Discovery Flow            │
├─────────────────────────────────────────────────┤
│                                                 │
│ 1️⃣  Customer Information                        │
│   ? Customer Name: [e.g., "Acme Healthcare"]   │
│   ? Customer Code: [e.g., "acme-prod"]         │
│   ? Silhouette Version: [auto-detect]          │
│                                                 │
│ 2️⃣  Database Connection                         │
│   ? Silhouette Database URL: [enter or paste]  │
│   ✓ Testing connection...                      │
│   ✓ Connection successful!                     │
│                                                 │
│ 3️⃣  Run Discovery                               │
│   ? Start schema discovery now? (y/n)          │
│   ✓ Discovering forms...                       │
│   ✓ Discovering fields...                      │
│   ✓ Discovering tables...                      │
│   ✓ Discovery complete!                        │
│                                                 │
│ ✅ Customer ready to use                        │
│                                                 │
└─────────────────────────────────────────────────┘
             │
             ▼
   🎉 App is ready!
      Users can create insights
```

---

## Implementation Plan

### Phase 1: Add Customer Setup Steps to Wizard (Week 1)

**New prompts in `scripts/setup.ts`:**

```typescript
// After admin user creation, add:

// Step: Customer Information
async setupCustomer(): Promise<CustomerConfig> {
  console.log(chalk.yellow("5️⃣  Customer Setup\n"));

  const name = await this.prompter.input({
    question: "Customer Name (e.g., 'Acme Healthcare'):",
  });

  const code = await this.prompter.input({
    question: "Customer Code (e.g., 'acme-prod', lowercase alphanumeric):",
    validate: (val) => /^[a-z0-9-]+$/.test(val) || "Invalid format",
  });

  const dbUrl = await this.prompter.input({
    question: "Silhouette Database Connection String:",
    defaultValue: "postgresql://...",
  });

  // Test connection
  const validation = await this.testCustomerConnection(dbUrl);
  if (!validation.success) {
    throw new Error(`Connection failed: ${validation.error}`);
  }

  return { name, code, dbUrl, version: validation.version };
}

// Step: Run Discovery
async setupDiscovery(customerCode: string): Promise<void> {
  const shouldRun = await this.prompter.confirm(
    "Run schema discovery now?"
  );

  if (!shouldRun) {
    console.log(chalk.gray(
      "You can run discovery later via admin panel.\n"
    ));
    return;
  }

  // Run discovery with progress
  await this.runDiscoveryWithProgress(customerCode);
}
```

### Phase 2: Add Backend Integration (Week 1)

**New utilities in `lib/config/customer-setup.ts`:**

```typescript
export class CustomerSetupManager {
  // Create customer via API
  async createCustomer(config: CustomerSetupConfig): Promise<string> {
    const response = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: config.name,
        code: config.code,
        connectionString: config.dbUrl,
        deploymentType: config.deploymentType,
      }),
    });

    if (!response.ok) throw new Error("Failed to create customer");
    return response.json();
  }

  // Test connection
  async testConnection(dbUrl: string): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    // Call test endpoint
  }

  // Run discovery with streaming progress
  async *runDiscoveryStreaming(customerCode: string) {
    const response = await fetch(
      `/api/admin/customers/${customerCode}/discovery`,
      { method: "POST" },
    );

    for await (const event of response.body) {
      yield JSON.parse(event);
    }
  }
}
```

### Phase 3: Update Documentation (Week 1)

**New section in `README-DEPLOYMENT.md`:**

```markdown
## Customer Setup During Deployment

The wizard will guide you through:

1. Creating a customer/organization
2. Connecting to the Silhouette database
3. Running schema discovery

This ensures your deployment is fully ready for use!

## Post-Deployment

After the wizard completes:

- Login to the admin panel
- Create users
- Create insights based on discovered fields
```

### Phase 4: Update Non-Interactive Mode (Week 2)

**Extend config schema:**

```typescript
// lib/config/validation.ts

export const CustomerSetupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().min(1),
  code: z.string().regex(/^[a-z0-9-]+$/),
  silhouetteDbUrl: z.string().url(),
  deploymentType: z.enum(["onprem", "cloud"]),
  runDiscovery: z.boolean().default(true),
  skipIfExists: z.boolean().default(false),
});

// For non-interactive mode:
// pnpm setup:production --config=prod-with-customer.json
```

---

## Configuration Example

### Full Config with Customer Setup

```json
{
  "version": "1.0.0",
  "mode": "production",
  "database": {
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "username": "user",
    "password": "password",
    "database": "insight_gen_db"
  },
  "providers": {
    "anthropic": {
      "enabled": true,
      "apiKey": "sk-ant-...",
      "modelName": "claude-3-5-sonnet-20240620"
    },
    "google": { "enabled": false },
    "openwebui": { "enabled": false }
  },
  "adminUser": {
    "username": "admin",
    "email": "admin@company.local",
    "password": "SecurePass123!",
    "fullName": "System Administrator"
  },
  "customer": {
    "enabled": true,
    "name": "Acme Healthcare",
    "code": "acme-prod",
    "silhouetteDbUrl": "postgresql://acme_user:password@silhouette-db:5432/acme",
    "deploymentType": "onprem",
    "runDiscovery": true,
    "skipIfExists": false
  }
}
```

---

## User Experience Examples

### Beta Deployment with Customer

```bash
$ pnpm setup:beta

🚀 InsightGen Deployment Wizard
────────────────────────────────

1️⃣  Database Configuration
  ✓ PostgreSQL auto-detected at localhost:5432

2️⃣  AI Provider Setup
  ? Enable Anthropic Claude? y
  ? API Key? ••••••••••

3️⃣  Admin User Setup
  ? Username? admin
  ? Email? admin@silhouette.local
  ? Password? ••••••••••

4️⃣  Customer Setup
  ? Customer Name? Acme Healthcare
  ? Customer Code? acme-prod
  ? Silhouette DB URL? postgresql://acme:pass@localhost:5433/acme
  ✓ Connection validated
  ✓ Silhouette version: 5.0.1

5️⃣  Schema Discovery
  ? Run discovery now? (y/n) y
  ✓ Discovering forms...        [20s]
  ✓ Discovering fields...       [45s]
  ✓ Discovering tables...       [30s]
  ✓ Discovering relationships... [15s]
  ✓ Discovery complete!         [2m]

✅ Setup Complete!

Your InsightGen is ready to use:
  • Database: ✓ Ready
  • Admin: ✓ Created
  • Customer: ✓ Created
  • Schema: ✓ Discovered
  • AI: ✓ Configured

Next steps:
  1. pnpm dev
  2. Open http://localhost:3005
  3. Login: admin / [password]
  4. Create your first insight!
```

### Production Deployment

```bash
$ pnpm setup:production

🚀 InsightGen Deployment Wizard
────────────────────────────────

1️⃣  Database Configuration
  ? Database Type? PostgreSQL
  ? Connection String? postgresql://prod:pass@prod-db:5432/insight_gen
  ✓ Connection validated

2️⃣  AI Provider Setup
  ? Enable Anthropic Claude? y
  ? API Key? ••••••••••

3️⃣  Admin User Setup
  ? Username? admin
  ? Email? ops@company.local
  ? Password? ••••••••••

4️⃣  Customer Setup
  ? Customer Name? Acme Healthcare
  ? Customer Code? acme-prod
  ? Silhouette DB URL? postgresql://acme:pass@acme-db:5432/silhouette
  ✓ Connection validated
  ✓ Silhouette version: 5.0.1

5️⃣  Schema Discovery
  ? Run discovery now? (y/n) y
  ✓ Discovering forms... [estimated 1m]
  ✓ Progress: 50% complete...

Running Setup...
  ✓ Configuration saved (200ms)
  ✓ Migrations completed (3.2s)
  ✓ Admin user created (150ms)
  ✓ Customer created (100ms)
  ✓ Schema discovery started (async)

✅ Setup Complete!

⚠️  Schema discovery is running in background.
    Check admin panel for progress.

Next: docker-compose up -d
```

---

## Design Considerations

### When to Skip Customer Setup

**Optional for:**

- Multi-tenant deployments (setup customers later per tenant)
- Testing/development (add customers manually)

**Always required for:**

- Single-customer deployments
- Typical healthcare installations

**Proposed behavior:**

```bash
? Skip customer setup for now? (y/n) n
# Continue with customer setup

? Skip customer setup for now? (y/n) y
# Skip to next step
# Show reminder: "Setup customer via admin panel later"
```

### Discovery Timing

**Option 1: Blocking (Current Proposal)**

- Discovery runs as part of wizard
- Wizard waits for discovery to complete
- Pro: User knows everything is ready
- Con: Long wizard time (can be 2-5 minutes)

**Option 2: Async Background**

- Discovery starts after wizard completes
- Wizard shows progress indicator
- User can proceed, discovery continues
- Pro: Faster wizard completion
- Con: User might start insights before discovery done

**Recommendation:** Option 1 (blocking) for first-time deployment. Add Option 2 for future enhancement.

### Error Handling

**If customer creation fails:**

```bash
❌ Failed to create customer: Customer code already exists
   • Retry with different code? (y/n)
   • Or skip and create manually? (y/n)
```

**If discovery fails:**

```bash
❌ Discovery failed: Form discovery timeout
   ? Retry discovery? (y/n)
   • Or skip and run later? (y/n)

ℹ️  You can run discovery again from admin panel
    No data is lost if discovery fails.
```

---

## Integration Points

### Existing Code to Leverage

1. **Customer Service** (`lib/services/customer-service.ts`)
   - Already has `createCustomer()` method
   - Just need to call it from setup wizard

2. **Discovery Orchestrator** (`lib/services/discovery-orchestrator.service.ts`)
   - Already has `runFullDiscoveryWithProgress()` for streaming
   - Perfect for wizard integration

3. **Connection Testing** (`app/api/admin/customers/[code]/test-connection/route.ts`)
   - Already auto-detects Silhouette version
   - Can reuse in wizard

4. **Admin UI** (`components/admin/CreateCustomerDialog.tsx`)
   - Form components already exist
   - Can extract and reuse in wizard

---

## Files to Create/Modify

### New Files

```
lib/config/customer-setup.ts          # Customer setup manager
lib/config/customer-setup-validation.ts  # Zod schemas for customer
scripts/customer-setup-steps.ts       # Extracted setup steps
```

### Modified Files

```
scripts/setup.ts                      # Add customer flow
lib/config/validation.ts              # Add customer schema to DeploymentConfig
lib/config/deployment-config.ts       # Add customer validation
package.json                          # (no changes)
README-DEPLOYMENT.md                  # Add customer setup docs
docs/refactoring/DEPLOYMENT_MANUAL.md # Add manual customer setup
```

---

## Testing Considerations

### Test Cases

1. **Happy Path - Beta**
   - Create customer
   - Test connection succeeds
   - Run discovery successfully
   - Verify schemas are indexed

2. **Happy Path - Production**
   - Same but with production database

3. **Connection Fails**
   - Invalid connection string
   - Database unreachable
   - Wrong credentials

4. **Discovery Fails**
   - Timeout during form discovery
   - Database errors during discovery
   - Partial discovery (some forms succeed, others fail)

5. **Non-Interactive Mode**
   - Load from JSON config
   - Verify customer created
   - Verify discovery runs

6. **Skip Customer Setup**
   - Skip customer step
   - App still works
   - Customer can be added later

---

## Backward Compatibility

**Existing deployments won't break:**

- Customer setup is optional (can skip)
- Existing customers can be managed via admin panel
- No changes to customer API
- Discovery still works via admin UI

---

## Future Enhancements (v1.2+)

1. **Multiple Customers During Setup**
   - Add customer loop: "Add another customer? (y/n)"
   - Useful for multi-tenant deployments

2. **Discovery Customization**
   - Choose which discovery stages to run
   - Skip form discovery if only tables
   - Adjust discovery parameters

3. **Customer Templates**
   - Save customer configs
   - "Use a template?" (Acme Healthcare, Community Hospital, etc.)
   - Faster setup for similar customers

4. **Automated Discovery Scheduling**
   - Schedule discovery to run nightly
   - Detect schema changes automatically
   - Update semantic index regularly

---

## Decision Points

### 1. Should customer setup be required or optional?

- **Option A (Recommended):** Optional but encouraged
  - Ask: "Setup a customer now? (y/n)"
  - Pro: Flexible for multi-tenant or testing
  - Con: Users might forget

- **Option B:** Always required
  - Pro: Ensures app is fully functional
  - Con: Adds time to setup (2-5 min for discovery)

### 2. Should discovery be blocking or async?

- **Option A (Recommended):** Blocking for first deployment
  - Pro: User knows everything is ready
  - Con: Longer wizard time

- **Option B:** Async background
  - Pro: Faster wizard completion
  - Con: User might be confused if discovery incomplete

### 3. Support multiple customers in one setup?

- **Option A (Now):** Single customer per deployment
  - Simple, clear flow
  - Multi-tenant users can add customers later

- **Option B (Future):** Loop: "Add another? (y/n)"
  - More powerful but complex
  - Can add in v1.2

---

## Effort Estimate

| Task                         | Time      | Complexity |
| ---------------------------- | --------- | ---------- |
| Extract customer setup logic | 1-2h      | Low        |
| Add prompts to wizard        | 2-3h      | Low        |
| Integrate discovery          | 2-3h      | Medium     |
| Testing                      | 2-3h      | Medium     |
| Documentation                | 1-2h      | Low        |
| **Total**                    | **8-13h** | **Medium** |

**Timeline:** Can be done in 1-2 days

---

## Recommendation

**Implement this enhancement:** YES

**Why:**

- Completes the deployment workflow (deploy → configure → ready to use)
- Guides users through required steps
- Reduces manual error
- Improves first-time user experience
- Leverages existing code (minimal new logic)

**Scope:** Add to v1.0.1 as a minor enhancement (not blocking v1.0)

---

## Questions for You

1. **Should customer setup be required or optional?**
   - I recommend: Optional (more flexible)

2. **Should discovery block the wizard?**
   - I recommend: Yes (user knows everything is ready)

3. **Support multiple customers at once?**
   - I recommend: No for now (add in v1.2)

4. **When to implement?**
   - I recommend: After v1.0.0 ships (v1.0.1)

---

**Ready to implement if you approve the approach!** Let me know your preferences on the decision points above.
