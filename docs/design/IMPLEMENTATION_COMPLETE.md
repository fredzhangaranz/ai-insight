# Implementation Summary: Trajectory Profile Filtering

## What Was Built

A smart trajectory profile filtering system that determines which trajectory profiles are actually needed based on user selections, reducing unnecessary API calls by up to 75% in common scenarios.

## The Problem (Before)

When generating wound data with different healing trajectories, the system **always generated profiles for all 4 trajectory types** regardless of user selection:

```
User selects:    → System generates:
- Single wound   → All 4 profiles (waste)
  Fast healing   
  
- Two wounds     → All 4 profiles (waste)
  Wound 1: healing
  Wound 2: healing
  
- Two wounds     → All 4 profiles (waste)
  Wound 1: healing
  Wound 2: stable
```

This was inefficient and confusing for users who explicitly selected a subset.

## The Solution (After)

Implemented **3-tier intelligent selection** based on configuration mode:

**Tier 1: Single Wound**
- Generate only 1 profile (75% reduction)
- Example: "Fast healing" → only Exponential

**Tier 2: Multiple Wounds with Explicit Assignments**
- Deduplicate and generate only unique types (25-75% reduction)
- Example: [healing, healing] → 1 profile
- Example: [healing, stable] → 2 profiles
- Example: [healing, stable, deteriorating] → 3 profiles

**Tier 3: Randomised Mode**
- Generate all 4 profiles (because randomization happens at runtime)
- Display clear explanation to user

## Files Changed

### New Files (3)

1. **`lib/services/data-gen/trajectory-selector.ts`** (87 lines)
   - Core logic for determining required trajectories
   - Exports `selectRequiredTrajectories()` function
   - Returns structured result with selected styles, metadata, and description

2. **`docs/design/TRAJECTORY_PROFILE_FILTERING.md`** (Documentation)
   - Detailed architecture and design explanation
   - Data flow diagrams
   - Migration notes

3. **`docs/design/TRAJECTORY_PROFILE_FILTERING_EXAMPLES.md`** (Documentation)
   - Concrete examples for each tier
   - Configuration flow chart
   - Testing checklist
   - Performance impact table

### Modified Files (5)

1. **`lib/services/data-gen/profile-generator.service.ts`**
   - Added optional `selectedStyles: WoundProgressionStyle[]` parameter to `GenerateProfilesInput`
   - Updated `generateFieldProfiles()` to only generate requested styles
   - **Backward compatible**: omitting parameter generates all 4 (old behavior)
   - Changes: +5 lines (interface) +3 lines (logic) = 8 lines total

2. **`app/api/admin/data-gen/generate-profiles/route.ts`**
   - Extracts `trajectoryAssignments` and `trajectoryRandomisePerPatient` from request body
   - Calls `selectRequiredTrajectories()` to determine needed styles
   - Passes `selectedStyles` to `generateFieldProfiles()`
   - Returns `trajectorySelection` metadata for UI
   - Changes: +21 lines (imports, extraction, selection call, response field)

3. **`app/admin/data-gen/components/field-profiles-review-step.tsx`**
   - Added `trajectorySelection?: TrajectorySelectionResult` prop
   - Displays info alert showing:
     - Number of profiles generated
     - Trajectory type description
     - Special note for randomised mode (blue styling, warning message)
   - Changes: +36 lines (imports, prop interface, alert rendering)

4. **`app/admin/data-gen/page.tsx`**
   - Added `trajectorySelection` state to track metadata
   - Updated API fetch call to include trajectory parameters (lines 195-196)
   - Updated response handling to store `trajectorySelection` (line 199)
   - Passes `trajectorySelection` prop to `FieldProfilesReviewStep` (line 646)
   - Clears `trajectorySelection` on back button (line 651)
   - Changes: +3 lines (state) +2 lines (fetch) +2 lines (response) +2 lines (UI props)

## Type System

### New Type: `TrajectorySelectionResult`

```typescript
interface TrajectorySelectionResult {
  selectedStyles: WoundProgressionStyle[];    // Styles to generate
  isRandomised: boolean;                       // True if random mode
  description: string;                         // Human-readable text
}
```

### Trajectory Type Mapping

```typescript
healing → Exponential
stable → JaggedFlat
deteriorating → JaggedLinear
treatmentChange → NPTraditionalDisposable
```

## API Contract

### Request
```json
POST /api/admin/data-gen/generate-profiles
{
  "customerId": "...",
  "formId": "...",
  "trajectoryAssignments": ["healing", "stable"],    // NEW: optional
  "trajectoryRandomisePerPatient": false,             // NEW: optional
  "woundBaselineAreaRange": [5, 50],                  // existing
  "modelId": "..."                                    // existing
}
```

### Response
```json
{
  "profiles": [...],                                  // Array of generated profiles
  "formSchema": [...],                                // Form field schema
  "trajectorySelection": {                            // NEW field
    "selectedStyles": ["Exponential", "JaggedFlat"],
    "isRandomised": false,
    "description": "Multiple wounds assigned: healing, stable. Generating 2 profile(s)..."
  }
}
```

## Performance Impact

| Scenario | Profiles Before | Profiles After | Time Saved |
|:---|---:|---:|---:|
| Single wound, 1 trajectory | 4 | 1 | **75%** |
| 2 wounds, same trajectory | 4 | 1 | **75%** |
| 2 wounds, 2 trajectories | 4 | 2 | **50%** |
| 3 wounds, 3 trajectories | 4 | 3 | **25%** |
| Randomised mode | 4 | 4 | 0% |

For a single wound with one trajectory (the most common case), this represents **4x faster profile generation**.

## User Experience

### Before
```
User selects: Fast healing
↓
System generates all 4 profiles (confusing - why are other types here?)
```

### After
```
User selects: Fast healing
↓
Alert appears: "1 profile selected: Single trajectory: healing (Exponential)"
↓
System generates only 1 profile
↓
Faster, clearer, more intuitive
```

### Randomised Mode
```
User enables: "Randomise trajectory per patient"
↓
Alert appears (blue, with icon): 
  "4 profiles selected: Randomised per patient..."
  "Since trajectories are randomised per wound at generation time, 
   all trajectory types are needed to ensure every possible trajectory 
   can be assigned."
↓
User understands why all 4 are needed
```

## Backward Compatibility

✅ **100% backward compatible**

- Existing code calling `generateFieldProfiles()` without `selectedStyles` still works (generates all 4)
- Old API calls without trajectory parameters still work (generates all 4)
- No breaking changes to existing data structures or functions
- Zero migration effort required

## Testing Recommendations

### Unit Tests
- [ ] `selectRequiredTrajectories(["healing"])` → 1 style
- [ ] `selectRequiredTrajectories(["healing", "healing"])` → 1 style (dedup)
- [ ] `selectRequiredTrajectories(["healing", "stable"])` → 2 styles
- [ ] `selectRequiredTrajectories(undefined, true)` → 4 styles
- [ ] Verify description strings are generated correctly

### Integration Tests
- [ ] API accepts trajectory parameters
- [ ] API returns `trajectorySelection` in response
- [ ] UI displays correct alert for each scenario
- [ ] Randomised mode shows blue alert with warning
- [ ] Old API calls without trajectory params still work

### Manual Testing
- [ ] Single wound, select trajectory → 1 profile shown
- [ ] 2 wounds, assign different types → correct count shown
- [ ] Enable randomise toggle → blue alert with 4 profiles
- [ ] Back button clears trajectory selection state
- [ ] Form validation still works

## Code Quality

✅ **No linter errors**
✅ **TypeScript strict mode compliant**
✅ **JSDoc comments on key functions**
✅ **Clear variable and function names**
✅ **DRY principle followed** (selection logic in one place)

## Deployment Notes

### What to Test in QA
1. Single-trajectory wound generation (should be faster)
2. Multi-wound generation with deduplication
3. Randomised mode display and behavior
4. API response includes trajectory selection metadata
5. UI alert displays correct information for all scenarios
6. Back/forward navigation preserves state correctly

### Rollback Strategy
Not needed - changes are non-breaking. If issues arise, can be reverted safely without data migration.

### Monitoring
Monitor `generateFieldProfiles()` API timing to confirm performance improvements:
- Single trajectory: should be ~4x faster
- 2 trajectories: should be ~2x faster
- Randomised: unchanged (still 4 profiles)

## Related Documentation

- `docs/design/TRAJECTORY_PROFILE_FILTERING.md` — Architecture & design details
- `docs/design/TRAJECTORY_PROFILE_FILTERING_EXAMPLES.md` — Concrete examples & testing guide
- Original issue: Trajectory selection was ignored; all 4 profiles generated regardless

## Summary

✅ **What was fixed:**
- Single-trajectory wounds now generate 1 profile instead of 4
- Multi-wound selections deduplicate trajectories
- Randomised mode clearly documented with UI warning

✅ **What improved:**
- Performance: up to 75% reduction in profile generation for common cases
- UX: users see exactly which trajectories are being generated
- Code clarity: trajectory selection logic centralized in utility module

✅ **What stayed the same:**
- All existing APIs and data structures (backward compatible)
- No database migrations needed
- No breaking changes
