# Field Gap Discovery - Command Reference

## Quick Start

### Option 1: Using Customer Code (Simplest)
```bash
npm run discover-field-gaps DEMO
```

### Option 2: Using Customer UUID
```bash
npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012
```

### Option 3: With Custom Confidence Threshold
```bash
npm run discover-field-gaps DEMO --minConfidence 0.5
```

### Option 4: Diagnose Issues First
```bash
npm run diagnose-field-gaps DEMO
# or
npm run diagnose-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012
```

---

## Why Commands Fail

### ❌ Wrong:
```bash
npm run discover-field-gaps b4328dd3-5977-4e0d-a1a3-a46be57cd012 --minConfidence 0.5
# ERROR: Treats UUID as customer CODE, looks for customer named "B4328DD3-5977-..."
```

### ✅ Correct:
```bash
npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012 --minConfidence 0.5
# Note the -- after npm run discover-field-gaps
```

---

## Argument Rules

### When using Customer Code:
```bash
# Customer code: "DEMO", "ACME", "CUSTOMER_X", etc.
npm run discover-field-gaps <customerCode> [options]
npm run discover-field-gaps DEMO
npm run discover-field-gaps DEMO --limit 50
npm run discover-field-gaps DEMO --minConfidence 0.5 --limit 50
```

### When using UUID:
```bash
# Must use -- separator and --customerId flag
npm run discover-field-gaps -- --customerId <uuid> [options]
npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012
npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012 --limit 50
npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012 --minConfidence 0.5
```

---

## Options

| Option | Default | Example |
|--------|---------|---------|
| `--limit` | 30 | `--limit 50` - Return top 50 results per concept |
| `--minConfidence` | 0.6 | `--minConfidence 0.5` - Lower threshold, more results |

---

## Workflow for Fixing Field Gaps

### Step 1: Diagnose
```bash
npm run diagnose-field-gaps DEMO
```
Tells you:
- ✅ How many measurement fields are indexed
- ❌ Which ones have wrong semantic concepts
- 📍 What needs to be fixed

### Step 2: Apply Corrective Migration
```bash
npm run migrate -- --rerun 039_correct_measurement_field_concepts
```

### Step 3: Re-Diagnose to Verify
```bash
npm run diagnose-field-gaps DEMO
```
Should now show correct concepts

### Step 4: Run Discovery Test
```bash
npm run discover-field-gaps DEMO
```
Should now show:
```
✅ All expected fields found
✅ No gaps detected in golden cases.
```

---

## Troubleshooting

### "Customer not found: <UUID>"
**Cause**: You forgot the `--` separator or `--customerId` flag

**Fix**:
```bash
# Wrong
npm run discover-field-gaps b4328dd3-5977-4e0d-a1a3-a46be57cd012

# Right
npm run discover-field-gaps -- --customerId b4328dd3-5977-4e0d-a1a3-a46be57cd012
```

### "Customer not found: <CODE>"
**Cause**: Customer code doesn't exist in the database

**Fix**:
```bash
# Check admin panel for valid customer codes
# Or use UUID with correct syntax
npm run discover-field-gaps -- --customerId <uuid>
```

### "No gaps detected" but expect gaps
**Cause**: Might need lower confidence threshold

**Fix**:
```bash
npm run discover-field-gaps DEMO --minConfidence 0.5
```

### "Missing expected fields" after fix
**Cause**: Migration 039 may not have been applied correctly

**Fix**:
```bash
# Re-run the migration
npm run migrate -- --rerun 039_correct_measurement_field_concepts

# Verify
npm run diagnose-field-gaps DEMO
```

