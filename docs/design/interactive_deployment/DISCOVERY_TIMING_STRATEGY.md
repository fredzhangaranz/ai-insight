# Refined Approach: Customer Setup & Discovery Integration

**Status:** Updated Proposal Based on Discovery Timing Reality  
**Key Issue:** Discovery takes 10-15+ minutes (database dependent)  
**Challenge:** Long blocking in wizard is poor UX, but discovery is non-negotiable

---

## The Real Constraint

Discovery is **mandatory** before using the app:

- Without it: AI returns inaccurate results
- With it: Schemas indexed, semantic search works
- **Can't be skipped** (app won't function properly)

Current estimate: **10-15+ minutes** (longer for large databases)

---

## Problem with Blocking Approach

**Current proposal:** Wizard blocks for 10-15 minutes waiting for discovery

```
$ pnpm setup:beta
...
Running discovery...
[████░░░░░] 40% - Forms discovered (5m elapsed)
[Would wait another 5-10 minutes]
```

**Issues:**

- ❌ Too long to block (user loses attention)
- ❌ No sense of progress (feels stuck)
- ❌ Can't do anything else
- ❌ Network interruption kills everything
- ❌ Unclear if still working (just showing progress bar?)

---

## Recommended Solution: Three-Phase Approach

### Phase 1: Quick Setup (2-3 minutes)

**What wizard does:**

```
✓ Configure InsightGen database
✓ Setup admin user
✓ Configure AI provider
✓ Create customer
✓ Test Silhouette connection
```

**Result:** App is technically ready to start

### Phase 2: Prepare for Discovery (During startup)

**Automatic when app starts:**

```
$ pnpm dev

...
⚠️  DATABASE INITIALIZATION REQUIRED

Your database schema hasn't been discovered yet.
This is a one-time process that takes 10-15 minutes
(depending on your database size).

Starting discovery now...
(You can check progress in the admin panel)
```

### Phase 3: Background Discovery (Non-blocking)

**Happens while user explores app:**

```
[In progress]
├─ Forms Discovery        [████████░░] 80% - 3m elapsed
├─ Fields Discovery       [starting]
├─ Tables Discovery       [pending]
└─ Relationships          [pending]

Dashboard shows:
  "Schema is being indexed... check back in 10-15 minutes"
  "Features available: Limited (read-only until discovery completes)"
```

---

## Implementation: Two Options

### Option A: Auto-Start Discovery During App Boot (Recommended)

```typescript
// app/page.tsx or middleware

async function checkAndInitializeDiscovery() {
  // Check if discovery has been run
  const lastDiscovery = await getLastDiscoveryRun(customerId);

  if (!lastDiscovery) {
    // Discovery not done
    if (isFirstVisit) {
      // Start discovery in background
      startDiscoveryInBackground(customerId);

      // Show message
      return <DiscoveryInitializationMessage />;
    }
  }
}

// User sees banner:
// "Setting up your schema... This takes 10-15 minutes.
//  Check admin panel for progress. You can explore
//  the app in the meantime (features limited until ready)."
```

**Flow:**

1. Wizard completes ✓
2. User runs `pnpm dev`
3. App starts
4. Detects discovery needed
5. Shows message & starts discovery
6. Discovery runs in background
7. User can explore (limited features)
8. Discovery completes
9. Full features unlock

**Pros:**

- ✅ Wizard finishes quickly (2-3 min)
- ✅ Discovery can't block startup
- ✅ User can explore while waiting
- ✅ Clear messaging about wait time
- ✅ Progress visible in admin panel

**Cons:**

- ❌ User needs to understand "limited mode"
- ❌ Can't create insights until ready
- ❌ Requires UI to show discovery status

---

### Option B: Run Discovery During Wizard (Explicit About Time)

**If you prefer discovery in wizard:**

```bash
$ pnpm setup:beta

[After customer setup]

4️⃣  Schema Discovery

⚠️  IMPORTANT: This step is required for the app to work!

Your database will now be scanned for forms, fields, and
tables. This process:

  • Typically takes 10-15 minutes
  • Can take longer (30+ min) for very large databases
  • Happens only once
  • Cannot be interrupted (connection must stay active)

? Start discovery now? (Recommended: yes)
  > Yes, start now
    No, skip (you can run manually later)

Starting discovery...

Discovery Progress:
[████████░░░░░░░░░░] 20% Complete - 2m 30s elapsed
├─ Forms discovered:      245
├─ Fields indexed:        1,200
├─ Tables found:          89
└─ Estimated time left:   10-12 minutes

[System is working... estimated 10-12 more minutes...]
```

**Pros:**

- ✅ Everything done in one flow
- ✅ No surprises after wizard
- ✅ User commits to wait upfront
- ✅ Clearer for users

**Cons:**

- ❌ 15-20 minute total wizard
- ❌ Long blocking on terminal
- ❌ User can't do anything else
- ❌ Network issues kill setup

---

## My Recommendation: Hybrid Approach

**Best of both worlds:**

### Setup Phase (In Wizard: 2-3 minutes)

```bash
pnpm setup:beta

Wizard completes with:
  ✓ Database ready
  ✓ Admin created
  ✓ AI configured
  ✓ Customer created
  ✓ Connection tested

⚠️  Schema discovery required before using app
    (normally 10-15 minutes)

? Start discovery now? (y/n)
```

**Two paths:**

**Path 1: Skip (for now)**

```bash
? Start discovery now? n

✅ Setup complete!

Next steps:
  1. pnpm dev
  2. Login to admin panel
  3. Click "Run Discovery" to start schema indexing

(Discovery can take 10-15+ minutes. Run whenever convenient)
```

**Path 2: Start Now**

```bash
? Start discovery now? y

Starting discovery...

Discovery Progress:
[Detailed output showing stages, forms, fields, etc.]
[~12-15 minutes of streaming output]

✓ Discovery complete!
✓ App is ready to use!
```

---

## User Communication Strategy

### Upfront: Set Expectations

**In the wizard:**

```
Before customer setup, show:

"⚠️  Important Information

Your InsightGen setup has two phases:

Phase 1: Quick Setup (2-3 minutes)
  • Configure database & admin
  • Create customer organization
  • Ready to start

Phase 2: Schema Discovery (10-15+ minutes)
  • One-time process that discovers your data structure
  • Required before creating insights
  • Runs in background or during setup (your choice)
  • Can take longer for large databases

Let's begin! →"
```

### Clear Messaging During Discovery

```
📊 SCHEMA DISCOVERY IN PROGRESS

This is analyzing your database to understand:
  • Assessment forms and fields
  • Data types and relationships
  • Tables and columns
  • Semantic concepts

Progress: [████████░░░░░░░░░░] 35%
├─ Forms discovered:    245
├─ Fields indexed:      1,200
├─ Tables scanned:      89/156
└─ Estimated time:      8-10 more minutes

What's happening now: Discovering relationship links
Last activity: 2 minutes ago

☕ This is a good time for coffee!
```

### After Discovery

```
✅ SCHEMA DISCOVERY COMPLETE!

Your InsightGen is now fully configured:
  ✓ Database ready
  ✓ Admin user created
  ✓ Customer organization set up
  ✓ 245 forms discovered
  ✓ 1,200+ fields indexed
  ✓ 89 tables analyzed

Ready to use! 🎉

Next: pnpm dev
```

---

## Handling Discovery Failures

**If discovery fails:**

```
❌ DISCOVERY FAILED

Stage: Table discovery (75% complete)
Error: Connection timeout after 8 minutes
Suggestion: Database may be very large

Options:
  1. Retry discovery (y/n)
     └─ May take 20-30 minutes given database size

  2. Skip for now (y/n)
     └─ Run manually later from admin panel
     └─ App will have limited functionality

  3. Check admin panel for manual controls
     └─ You can schedule discovery for off-peak hours

What would you like to do?
```

---

## Database Size Estimation

**Provide guidance upfront:**

```
Expected Discovery Time (rough estimates):

Small database (< 500K records):       5-10 minutes
Medium database (500K - 5M records):   10-20 minutes
Large database (5M - 50M records):     20-40 minutes
Very large database (> 50M records):   45+ minutes
                                       (run overnight)

Your estimated database size: [auto-detect if possible]
Estimated discovery time: 12-15 minutes
```

---

## Configuration for Large Deployments

**For customers with huge databases:**

```json
{
  "customer": {
    "enabled": true,
    "name": "Acme Healthcare",
    "code": "acme-prod",
    "silhouetteDbUrl": "...",
    "runDiscovery": true,
    "discoveryMode": "background", // NEW
    "skipInitialDiscovery": false // NEW
  }
}
```

**Options:**

- `discoveryMode: "blocking"` — Wait for discovery (2-3 database size)
- `discoveryMode: "background"` — Start discovery after setup completes
- `skipInitialDiscovery: true` — Setup only, run discovery manually later

---

## Updated Wizard Flow

```
pnpm setup:beta

1️⃣  Database Configuration      [1m]
    ✓ PostgreSQL detected

2️⃣  AI Provider Setup           [1m]
    ✓ Anthropic configured

3️⃣  Admin User Creation         [1m]
    ✓ Admin created

4️⃣  Customer Setup              [1m]
    ✓ Customer created
    ✓ Silhouette DB tested

5️⃣  Discovery Options           [prompt]

    ⚠️  Schema discovery is required

    ? Would you like to start discovery now?
      • Yes, start now (takes 10-15+ minutes)
      • No, I'll run it manually later
      • Check database size first
```

**If "Yes":**

- Blocking discovery in wizard (15-20 min total)
- Detailed progress output
- Clear messaging about time

**If "No":**

- Quick exit (3-4 min total)
- Instructions on how to run manually
- Message on startup about running discovery

---

## Implementation Decision

### Which approach should we use?

**Option 1: Hybrid (My Recommendation) ✅**

```
✓ Quick setup phase (2-3 min)
✓ Optional: Start discovery in wizard or later
✓ Clear messaging about time
✓ Flexible for large databases
✓ Best user experience
```

**Option 2: Always Blocking**

```
✓ Everything done in wizard
✗ Long wait (15-20 minutes)
✗ Not good for very large databases
```

**Option 3: Always Background**

```
✓ Wizard quick (2-3 min)
✗ Users confused about "ready but not ready"
✗ Needs UI to show status
```

---

## Summary

**Key Insights:**

1. Discovery is **mandatory** (can't skip)
2. Discovery takes **10-15+ minutes** (database dependent)
3. Long blocking wizard = poor UX
4. But skipping setup = incomplete deployment

**Solution:**

- Make discovery **required but flexible**
- **Clear messaging**: "This takes 10-15+ minutes"
- **User's choice**: Start now or run later
- **Background option**: For very large databases
- **Progress visibility**: Show detailed output

**Recommendation:**
Implement **Hybrid Approach** with optional immediate or deferred discovery, with clear messaging about time investment and why it's necessary.

---

## Next Steps

1. Do you want hybrid approach (optional immediate/deferred)?
2. Or always run discovery during setup (longer but complete)?
3. Should we estimate database size and show time prediction?
4. Should background mode be available for large databases?

Let me know your preference and I'll update the implementation plan!
