# Trajectory Profile Filtering - Quick Reference Guide

## Configuration Flow Chart

```
User Makes Selection
        │
        ├─────────────────────────────────────┐
        │                                     │
        ▼                                     ▼
   Single Wound                        Multiple Wounds
        │                                     │
        ▼                                     ▼
  Select 1 trajectory                  Assign per wound OR
  (Radio buttons)                      Randomise toggle
        │                                     │
        ├─────────────────────────────────────┤
        │                                     │
        ▼                                     ▼
  trajectoryAssignments                Tier 3: Random?
  = [selected]                         │
                                       ├─→ YES: randomisePerPatient=true
                                       │         → Generate ALL 4 profiles
                                       │
                                       └─→ NO: trajectoryAssignments
                                              = [wound1, wound2, ...]
                                              → Deduplicate & generate unique
        │
        └──────────────────────────────┬──────────────────────────┘
                                       │
                              ▼────────────────────▼
                    Tier 1/2: Explicit              Tier 3: Random
                    selectRequiredTrajectories()    → All 4 needed
                    → Only unique types
                       needed
                    Example:
                    ["healing", "stable"]
                    → 2 profiles (Exponential, JaggedFlat)
```

## Selection Examples

### TIER 1: Single Wound, One Trajectory

**User Action:**
- Wound count: 1
- Select: "Fast healing"

**Backend Calculation:**
```
trajectoryAssignments = ["healing"]
randomisePerPatient = undefined (false)

selectRequiredTrajectories(["healing"], undefined)
→ selectedStyles = ["Exponential"]
→ isRandomised = false
→ description = "Single trajectory: healing (Exponential)"
```

**API Result:**
- Generates: **1 profile** (Exponential)
- Alert: ℹ️ "1 profile selected: Single trajectory: healing (Exponential)"
- Time saved: **75%** (4→1 profiles)

---

### TIER 2a: Two Wounds, Same Trajectory

**User Action:**
- Wound count: 2
- Wound 1: "Fast healing"
- Wound 2: "Fast healing"

**Backend Calculation:**
```
trajectoryAssignments = ["healing", "healing"]
randomisePerPatient = undefined (false)

selectRequiredTrajectories(["healing", "healing"], undefined)
→ uniqueTypes = {healing}  ← Deduplicated!
→ selectedStyles = ["Exponential"]
→ isRandomised = false
→ description = "Multiple wounds assigned: healing. Generating 1 profile(s): Exponential"
```

**API Result:**
- Generates: **1 profile** (Exponential)
- Alert: ℹ️ "1 profile selected: Multiple wounds assigned: healing. Generating 1 profile(s): Exponential"
- Time saved: **75%** (4→1 profiles)

---

### TIER 2b: Two Wounds, Different Trajectories

**User Action:**
- Wound count: 2
- Wound 1: "Fast healing"
- Wound 2: "Slow healing"

**Backend Calculation:**
```
trajectoryAssignments = ["healing", "stable"]
randomisePerPatient = undefined (false)

selectRequiredTrajectories(["healing", "stable"], undefined)
→ uniqueTypes = {healing, stable}
→ selectedStyles = ["Exponential", "JaggedFlat"]
→ isRandomised = false
→ description = "Multiple wounds assigned: healing, stable. Generating 2 profile(s): Exponential, JaggedFlat"
```

**API Result:**
- Generates: **2 profiles** (Exponential, JaggedFlat)
- Alert: ℹ️ "2 profiles selected: Multiple wounds assigned: healing, stable. Generating 2 profile(s): Exponential, JaggedFlat"
- Time saved: **50%** (4→2 profiles)

---

### TIER 2c: Three Wounds, Three Different Trajectories

**User Action:**
- Wound count: 3
- Wound 1: "Fast healing"
- Wound 2: "Slow healing"
- Wound 3: "Non-healing"

**Backend Calculation:**
```
trajectoryAssignments = ["healing", "stable", "deteriorating"]
randomisePerPatient = undefined (false)

selectRequiredTrajectories(["healing", "stable", "deteriorating"], undefined)
→ uniqueTypes = {healing, stable, deteriorating}
→ selectedStyles = ["Exponential", "JaggedFlat", "JaggedLinear"]
→ isRandomised = false
→ description = "Multiple wounds assigned: healing, stable, deteriorating. Generating 3 profile(s): Exponential, JaggedFlat, JaggedLinear"
```

**API Result:**
- Generates: **3 profiles** (Exponential, JaggedFlat, JaggedLinear)
- Alert: ℹ️ "3 profiles selected: Multiple wounds assigned: healing, stable, deteriorating..."
- Time saved: **25%** (4→3 profiles)

---

### TIER 3: Randomised Mode

**User Action:**
- Wound count: 2 (or any number)
- Toggle: "Randomise trajectory per patient" ✓

**Backend Calculation:**
```
trajectoryAssignments = undefined (not set when random=true)
randomisePerPatient = true

selectRequiredTrajectories(undefined, true)
→ isRandomised = true (early return!)
→ selectedStyles = ALL_PROGRESSION_STYLES
  = ["Exponential", "JaggedLinear", "JaggedFlat", "NPTraditionalDisposable"]
→ description = "Randomised per patient: all trajectory types needed (each wound gets random trajectory at generation time)"
```

**API Result:**
- Generates: **4 profiles** (ALL types)
- Alert: 🔔 **Blue background** with warning message
  - "4 profiles selected: Randomised per patient: all trajectory types needed..."
  - "Since trajectories are randomised per wound at generation time, all trajectory types are needed to ensure every possible trajectory can be assigned."
- Rationale: Trajectory assignment happens AFTER config time, so all must be available

---

## Trajectory Type to Progression Style Mapping

| User Selection | Internal Style |
|:---|:---|
| 🟢 Fast healing | Exponential |
| 🟡 Slow healing | JaggedLinear |
| 🔴 Non-healing | JaggedFlat |
| 🔄 Treatment change | NPTraditionalDisposable |

---

## Code Integration Points

### 1. Frontend: User Makes Selection
**File:** `app/admin/data-gen/components/wound-trajectory-step.tsx`
- Collects user input for trajectory selection
- Returns `TrajectoryConfig` containing:
  - `trajectoryAssignments?: SingleTrajectoryType[]`
  - `trajectoryRandomisePerPatient?: boolean`

### 2. API Call: Send Selection to Server
**File:** `app/admin/data-gen/page.tsx`
- Line ~194: Extracts trajectory config parameters
- Line ~195-196: Passes to API via JSON body
- Line ~199: Stores `trajectorySelection` from response

### 3. Backend: Compute Required Styles
**File:** `app/api/admin/data-gen/generate-profiles/route.ts`
- Line ~61-64: Calls `selectRequiredTrajectories()`
- Returns `TrajectorySelectionResult` with:
  - `selectedStyles[]` — only styles to generate
  - `isRandomised` — flag for UI
  - `description` — human-readable text

### 4. Profile Generation: Only Request Needed Styles
**File:** `lib/services/data-gen/profile-generator.service.ts`
- Line ~50-57: Accepts optional `selectedStyles` parameter
- Line ~55: Only generates requested styles (parallelized)
- Backward compatible: omitting `selectedStyles` generates all 4

### 5. UI: Display Selection Information
**File:** `app/admin/data-gen/components/field-profiles-review-step.tsx`
- Line ~67-99: Renders `TrajectorySelectionResult` in alert box
- Shows profile count, trajectory types, and explanation
- Blue styling for randomised mode

---

## Performance Impact

### Single Wound Example: 75% Reduction

**Before:** Generate 4 profiles
```
Exponential ────→ ✓ (needed)
JaggedLinear ────→ ✗ (wasted)
JaggedFlat ──────→ ✗ (wasted)
NPTraditional ───→ ✗ (wasted)
```

**After:** Generate 1 profile
```
Exponential ────→ ✓ (needed)
JaggedLinear ────→ (skipped)
JaggedFlat ──────→ (skipped)
NPTraditional ───→ (skipped)
```

### Multi-Wound Example: Up to 75% Reduction

| Wounds Config | Before | After | Savings |
|:---|---:|---:|---:|
| 1 wound, 1 type | 4 | 1 | 75% |
| 2 wounds, same type | 4 | 1 | 75% |
| 2 wounds, 2 types | 4 | 2 | 50% |
| 3 wounds, 3 types | 4 | 3 | 25% |
| Randomised | 4 | 4 | 0% |

---

## Testing Checklist

- [ ] Single wound, fast healing → 1 profile (Exponential)
- [ ] Single wound, slow healing → 1 profile (JaggedLinear)
- [ ] Single wound, non-healing → 1 profile (JaggedFlat)
- [ ] Single wound, treatment change → 1 profile (NPTraditionalDisposable)
- [ ] 2 wounds, [fast, fast] → 1 profile (deduplication works)
- [ ] 2 wounds, [fast, slow] → 2 profiles (no duplication)
- [ ] 3 wounds, [fast, slow, non-healing] → 3 profiles
- [ ] Randomised toggle enabled → 4 profiles + blue alert + warning text
- [ ] API returns `trajectorySelection` object
- [ ] UI displays correct profile count and description
- [ ] Old code without trajectory config still generates all 4 (backward compat)
