# Trajectory Profile Filtering Implementation

## Problem Statement

Previously, the data generation system **always generated field profiles for all 4 trajectory types** (Exponential, JaggedLinear, JaggedFlat, NPTraditionalDisposable) regardless of the user's actual selection:

- **Single wound**: User selects 1 trajectory (e.g., "Fast healing"), but system generates profiles for all 4
- **Multiple wounds**: User assigns different trajectories per wound (e.g., 2 wounds with 2 different types), but system generates all 4 profiles
- **Randomised mode**: Ambiguity about which trajectories would actually be needed

This was inefficient and confusing, especially when users explicitly selected a subset of trajectories.

## Solution Overview

The implementation uses a **three-tier trajectory selection system** that determines which profiles are actually needed based on the configuration mode:

### Tier 1: Single Trajectory (1 wound, 1 type)
- User selects one trajectory type (healing, stable, deteriorating, or treatmentChange)
- System generates **only 1 profile** for that trajectory
- Example: User selects "Fast healing" → generates only Exponential profile

### Tier 2: Explicit Per-Wound Assignments (multiple wounds, explicit assignments)
- User assigns each wound a trajectory type
- System generates **only unique trajectories actually used**
- Example: 2 wounds with [healing, healing] → generates only 1 profile (Exponential)
- Example: 2 wounds with [healing, stable] → generates only 2 profiles (Exponential + JaggedFlat)
- Reduces API calls and profile generation time proportionally

### Tier 3: Randomised Per Patient (probabilistic)
- User enables "Randomise trajectory per patient" toggle
- Each wound independently gets a random trajectory at generation time
- System generates **all 4 profiles** (because selection happens after config time)
- UI clearly marks this mode as "probabilistic" and explains why all profiles are needed

## Architecture

### New Files

**`lib/services/data-gen/trajectory-selector.ts`**
- Utility module that examines the trajectory configuration and determines which profiles to generate
- Exports `selectRequiredTrajectories()` function
- Returns `TrajectorySelectionResult` containing:
  - `selectedStyles`: Array of WoundProgressionStyle to generate
  - `isRandomised`: Boolean flag (true for Tier 3)
  - `description`: Human-readable explanation

Mapping between user-facing types and internal progression styles:
```
healing → Exponential
stable → JaggedFlat
deteriorating → JaggedLinear
treatmentChange → NPTraditionalDisposable
```

### Modified Files

#### 1. `lib/services/data-gen/profile-generator.service.ts`
- Updated `GenerateProfilesInput` interface to include optional `selectedStyles: WoundProgressionStyle[]`
- Modified `generateFieldProfiles()` to only generate profiles for requested styles
- Backward compatible: if `selectedStyles` is omitted, generates all 4 (old behavior)

#### 2. `app/api/admin/data-gen/generate-profiles/route.ts`
- Extracts trajectory configuration from request body:
  - `trajectoryAssignments`: Explicit per-wound assignments (Tier 1/2)
  - `trajectoryRandomisePerPatient`: Randomise flag (Tier 3)
- Calls `selectRequiredTrajectories()` to determine which styles needed
- Passes `selectedStyles` to `generateFieldProfiles()`
- Returns `trajectorySelection` metadata in response for UI display

#### 3. `app/admin/data-gen/components/field-profiles-review-step.tsx`
- Added `trajectorySelection?: TrajectorySelectionResult` prop
- Displays informational alert showing:
  - Number of profiles being generated
  - Selection mode (single trajectory, explicit assignments, or randomised)
  - Special note for randomised mode explaining why all profiles needed
- Uses different visual styling for randomised mode (blue alert with warning icon)

#### 4. `app/admin/data-gen/page.tsx`
- Added `trajectorySelection` state to track selection metadata
- Updated profile generation fetch call to include:
  - `trajectoryAssignments` from config
  - `trajectoryRandomisePerPatient` from config
- Stores returned `trajectorySelection` in state
- Passes `trajectorySelection` prop to `FieldProfilesReviewStep`

## Data Flow

```
┌─────────────────────────────────────────────┐
│ WoundTrajectoryStep (User selects)          │
│ - Single trajectory or per-wound assignments│
│ - Randomise toggle                          │
└────────────┬────────────────────────────────┘
             │
             │ trajectoryConfig with:
             │  - trajectoryAssignments
             │  - trajectoryRandomisePerPatient
             │
             ▼
┌─────────────────────────────────────────────┐
│ page.tsx (Fetch profiles)                   │
│ POSTs trajectory config to API              │
└────────────┬────────────────────────────────┘
             │
             │ Request includes trajectory config
             │
             ▼
┌─────────────────────────────────────────────┐
│ /api/admin/data-gen/generate-profiles       │
│ selectRequiredTrajectories()                │
│ - Determines which styles needed            │
│ - Returns TrajectorySelectionResult         │
└────────────┬────────────────────────────────┘
             │
             │ selectedStyles[] to generator
             │
             ▼
┌─────────────────────────────────────────────┐
│ generateFieldProfiles()                     │
│ - Only requests needed styles from AI       │
│ - Returns filtered FieldProfileSet          │
└────────────┬────────────────────────────────┘
             │
             │ Response with profiles +
             │ trajectorySelection metadata
             │
             ▼
┌─────────────────────────────────────────────┐
│ FieldProfilesReviewStep (Shows results)     │
│ - Alert with trajectory selection info      │
│ - Displays only generated profiles          │
│ - Explains randomised mode if applicable    │
└─────────────────────────────────────────────┘
```

## Benefits

1. **Efficiency**: Single-trajectory wounds generate 1 profile instead of 4 (75% reduction)
2. **Multi-wound optimization**: If user only uses 2 trajectory types across wounds, generates 2 profiles instead of 4
3. **Clarity**: UI explicitly shows which trajectories were selected/generated
4. **Transparent randomisation**: Users understand why all profiles needed in randomise mode
5. **Backward compatible**: Old code without trajectory config still works (generates all 4)

## Examples

### Example 1: Single Wound, Fast Healing
```
User selects: Fast healing
trajectoryAssignments: ["healing"]
Result: Generates 1 profile (Exponential)
Alert: "Single trajectory: healing (Exponential)"
```

### Example 2: Two Wounds, Different Types
```
User assigns:
  - Wound 1: Fast healing
  - Wound 2: Slow healing
trajectoryAssignments: ["healing", "stable"]
Result: Generates 2 profiles (Exponential, JaggedFlat)
Alert: "Multiple wounds assigned: healing, stable. Generating 2 profiles: Exponential, JaggedFlat"
```

### Example 3: Randomised Mode
```
User enables: "Randomise trajectory per patient"
trajectoryRandomisePerPatient: true
Result: Generates all 4 profiles
Alert (blue, with warning icon):
  "4 profiles selected: Randomised per patient: all trajectory types needed (each wound gets random trajectory at generation time)"
  "Since trajectories are randomised per wound at generation time, all trajectory types are needed to ensure every possible trajectory can be assigned."
```

## Testing

When testing the implementation:

1. **Single wound with one trajectory**: Verify only 1 profile generated
2. **Multiple wounds with repeated trajectory**: Verify deduplication works (2 wounds, both "healing" → 1 profile)
3. **Multiple wounds with different trajectories**: Verify all unique ones generated (2 wounds with 2 different types → 2 profiles)
4. **Randomised mode**: Verify all 4 profiles generated and blue alert displayed
5. **Backward compatibility**: Verify old code paths (without trajectory config) still generate all 4 profiles

## Migration Notes

### For Existing Code

No breaking changes. If calling `generateFieldProfiles()` without `selectedStyles`, all 4 profiles are generated as before.

### For New Features

When invoking the profile generation API, always pass:
- `trajectoryAssignments?: SingleTrajectoryType[]` — for explicit per-wound assignments
- `trajectoryRandomisePerPatient?: boolean` — for randomise mode

The server will automatically compute `selectedStyles` based on these inputs.
