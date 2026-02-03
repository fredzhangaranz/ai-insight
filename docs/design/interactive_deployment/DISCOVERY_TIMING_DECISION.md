# Discovery Timing: Final Decision Guide

**Your Feedback:** Discovery takes 10-15+ minutes (database dependent)  
**Challenge:** Long blocking in wizard is poor UX  
**Constraint:** Discovery is mandatory before app functions properly

---

## The Dilemma

```
Option 1: Blocking Discovery in Wizard
  ✓ Everything done in one flow
  ✓ App is fully ready when wizard exits
  ✗ Users wait 15-20 minutes (poor UX)
  ✗ Doesn't work well for large databases (30+ min)
  ✗ Network interruption fails entire setup

Option 2: Skip Discovery in Wizard
  ✓ Quick setup (2-3 minutes)
  ✓ Users get app started
  ✗ App won't work properly until discovery runs
  ✗ Users confused about what to do next
  ✗ Easy to forget to run discovery
  ✗ App gives inaccurate results

Option 3: Hybrid (My Recommendation)
  ✓ Quick setup (2-3 minutes)
  ✓ Optional: Run discovery immediately or defer
  ✓ Clear messaging about time & necessity
  ✓ Works for any database size
  ✓ Flexible for various deployments
  ✓ Users understand trade-off
```

---

## Recommended: Hybrid Approach

**Setup wizard completes in 2-3 minutes:**

```
✓ Database configured
✓ Admin created
✓ AI provider set
✓ Customer created
✓ Connection tested
```

**Then prompt user:**

```
⚠️  SCHEMA DISCOVERY REQUIRED

Your database must be analyzed before you can use
the app. This process discovers your forms, fields,
and tables for intelligent query generation.

Typical time: 10-15 minutes (depends on database size)

? Start discovery now?
  → Yes (blocks wizard for ~15-20 minutes total)
     No (run manually later from admin panel)
     Estimate time first (see database size)
```

**Path 1: Start Now**

- Discovery runs in wizard
- Shows detailed progress
- ~15-20 minutes total setup time
- App fully ready when done

**Path 2: Run Later**

- Wizard exits quickly
- Admin opens admin panel
- Clicks "Run Discovery"
- Discovery starts in background
- App shows "Discovery in progress" until done

---

## Why This Works Better

### For Small Databases (< 10M records)

- User runs wizard
- Chooses "Start discovery now"
- Waits 10-15 minutes (acceptable)
- App is fully ready

### For Large Databases (> 50M records)

- User runs wizard
- Sees "Estimated time: 40+ minutes"
- Chooses "Run later"
- Schedules discovery for off-peak hours
- No blocking during business hours

### For Production Deployments

- IT admin runs wizard
- Chooses "Run later"
- Schedules discovery overnight
- App ready in morning (discovery already done)

### For Development

- Dev runs wizard
- Chooses "Start now"
- Gets full app in ~15 minutes
- Can test everything

---

## Implementation Details

### Phase 1: Quick Setup (In Wizard)

```bash
$ pnpm setup:production

[2-3 minutes]

✓ InsightGen database ready
✓ Admin user created
✓ AI provider configured
✓ Customer "Acme Healthcare" created
✓ Silhouette connection tested
  └─ Detected 500 forms, 120M+ records
  └─ Estimated discovery time: 20-30 minutes
```

### Phase 2: Discovery Choice

```
⚠️  SCHEMA DISCOVERY REQUIRED

Before you can use InsightGen, your database schema
must be analyzed and indexed. This is a one-time
process that enables accurate AI-powered query generation.

🕐 Estimated time for your database: 20-30 minutes
   (Very large: 120M+ records)

Options:
  1. Start now (wizard will wait 20-30 minutes)
  2. Run later (manually from admin, whenever convenient)
  3. Schedule for specific time (see advanced options)

What would you prefer?
  > Start now
    Run later
    More info
```

### Phase 3a: If "Start Now"

```
Starting discovery...

[████████░░░░░░░░░░] 25% - 4m 30s elapsed
├─ Forms discovered:      245/500
├─ Fields indexed:        1,200/2,100
├─ Tables found:          89/156
└─ Estimated time left:   15-18 minutes

Discovering form relationships...
Last update: 30 seconds ago
```

**After completion:**

```
✅ Discovery Complete!

Results:
  • Forms analyzed:     500
  • Fields indexed:     2,100
  • Tables processed:   156
  • Time taken:         24 minutes
  • Next step:          Ready to use!

$ pnpm dev
→ Your app is fully configured and ready! 🎉
```

### Phase 3b: If "Run Later"

```
✅ Setup Complete!

Your InsightGen is configured and ready to start:
  ✓ Database ready
  ✓ Admin user created
  ✓ Customer "Acme Healthcare" created
  ✓ Connection tested

⚠️  Before using the app:
    Schema discovery must be completed

    This typically takes 20-30 minutes for your database

How to run discovery:
  1. pnpm dev
  2. Open http://localhost:3005
  3. Login to admin panel
  4. Click "Run Discovery" (admin tab)
  5. Let it run (you'll see progress)

Once complete, you can start creating insights!

Advanced: Schedule discovery for specific time
  → See: docs/admin/discovery-scheduling.md
```

---

## Handling Large Databases

### Detection & Estimation

```typescript
// During connection test:
const dbStats = await testConnection(connectionString);

if (dbStats.estimatedRecords > 50_000_000) {
  // Very large database
  console.warn(`
⚠️  Large Database Detected (${formatNumber(dbStats.estimatedRecords)} records)

Estimated discovery time: 40+ minutes
Recommendation: Run discovery during off-hours
  `);

  // Suggest deferring discovery
  return {
    suggested: "defer",
    reason: "large_database",
    estimatedTime: "40+ minutes",
  };
}
```

### Deployment Script Version

```bash
# For automated large deployments
pnpm setup:production \
  --config=prod.json \
  --discovery-mode=defer \
  --discovery-schedule="2:00 AM UTC"
```

---

## Status Messages for App

### Before Discovery Runs

```
⚠️  Database Schema Setup Required

Your InsightGen is configured but awaiting schema
discovery. This is a one-time process that:

• Analyzes your database structure
• Indexes forms, fields, and tables
• Enables semantic AI search

Status: Not started
Estimated time: 20-30 minutes

Actions:
  → Start discovery now (admin panel)
  → Schedule for later (admin panel)
  → View detailed info

Limited features available until discovery completes:
  ✓ Login & settings
  ✗ Create insights
  ✗ Run queries
  ✗ AI features
```

### During Discovery

```
📊 Discovery in Progress: 45% Complete

Current stage: Analyzing field relationships
Elapsed: 12 minutes
Estimated remaining: 15 minutes

Forms analyzed:   245/500
Fields indexed:   1,200/2,100
Tables found:     89/156

View detailed progress in admin panel →
```

### After Discovery

```
✅ Schema Discovery Complete!

Your InsightGen is fully configured and ready to use.

✓ Forms analyzed:   500
✓ Fields indexed:   2,100
✓ Tables processed: 156
✓ AI enabled:       Ready
✓ Semantic search:  Ready

You can now:
  • Create insights
  • Run natural language queries
  • Use AI-powered analysis
  • Access all features

Ready to go! 🚀
```

---

## Three Questions to Answer

### Q1: Wizard Behavior

**Should wizard:**

- ✅ Offer choice (start now or defer) — RECOMMENDED
- ❌ Always run discovery (simpler but long wait)
- ❌ Never run discovery (requires manual step)

### Q2: Discovery Mode

**For large databases, offer:**

- ✅ Background option (run anytime) — RECOMMENDED
- ❌ Only blocking (all or nothing)

### Q3: Time Estimation

**Should wizard show:**

- ✅ Estimated time based on database size — RECOMMENDED
- ❌ Generic "10-15 minutes" (not accurate)
- ❌ No time estimate (user surprised)

---

## Recommendation

**Use Hybrid Approach:**

1. **Quick setup phase** (2-3 minutes)
   - All core configuration

2. **Discovery choice** (user decides)
   - Start now: Blocks for 10-30 minutes (depends on DB)
   - Run later: Quick exit, run anytime

3. **Clear messaging**
   - Show estimated time based on DB size
   - Explain why discovery is needed
   - Provide options

4. **Flexible for all scenarios**
   - Dev: Quick 10-15 min setup
   - Small org: ~15 min full setup
   - Large org: Quick setup, defer discovery

---

## Decision Needed

**Which approach do you prefer?**

Option 1 (Recommended): Hybrid

- ✅ Wizard offers choice
- ✅ Shows estimated time
- ✅ Works for any database size
- ✅ Flexible for various deployments

Option 2: Always Blocking

- ✓ Everything in one flow
- ✗ 15-20+ minute wait
- ✗ Not ideal for large databases

Option 3: Always Defer

- ✓ Quick wizard
- ✗ Users must remember to run discovery
- ✗ App doesn't work until discovery done

**My strong recommendation: Option 1 (Hybrid)**

---

**Ready? Confirm which approach and I'll finalize the integration plan!**
