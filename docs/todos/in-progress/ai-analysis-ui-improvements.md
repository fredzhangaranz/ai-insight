# AI Analysis UI Improvements - Implementation Plan

## Overview
Enhance the "AI Analysis" section to show more detailed progress information that reflects what's happening behind the scenes, without overwhelming users with debug-level details.

## Goals
- Show meaningful metrics inline (counts, confidence, row counts)
- Break down complex steps (like context discovery) into visible sub-steps
- Add visual indicators for confidence levels
- Implement progressive message updates for better user feedback
- Maintain clean, non-overwhelming UI

---

## High Priority Items

### 1. Show Inline Metrics from step.details

**Goal:** Display contextual information (counts, confidence scores, row counts) next to step messages.

#### Tasks:
- [ ] **1.1** Display formsFound and fieldsFound counts for context discovery step
  - Format: "Found 3 forms, 12 fields"
  - Show as subtle gray text next to step message
  - Only display when details are available

- [ ] **1.2** Display confidence score for relevant steps
  - Steps: template_match, context_discovery, sql_generation
  - Format: "Confidence: 85%" or as badge
  - Show percentage (multiply by 100, round to nearest integer)

- [ ] **1.3** Display rowCount for query execution step
  - Format: "Returned 1,234 rows" (with number formatting)
  - Use toLocaleString() for thousands separators
  - Only show when execution completes successfully

- [ ] **1.4** Display assumption count for SQL generation step
  - Format: "1 assumption made" or "No assumptions"
  - Show when assumptions array exists in details

- [ ] **1.5** Style metrics consistently
  - Use `text-xs text-gray-500` classes
  - Add proper spacing (ml-2 or similar)
  - Format numbers with commas
  - Format percentages with % symbol

**Files to modify:**
- `app/insights/new/components/ThinkingStream.tsx` - Update `ThinkingStepItem` component

---

### 2. Add Complexity Analysis Step

**Goal:** Make the complexity analysis step visible in the UI so users understand why a particular mode was chosen.

#### Tasks:
- [ ] **2.1** Ensure complexity_check step is included in thinking array
  - Verify it's added before context discovery in orchestrator
  - Check that it's not skipped in any code paths

- [ ] **2.2** Update complexity_check step message
  - Show complexity level and score: "Simple query (score: 3/10)"
  - Include strategy: "using direct semantic mode"
  - Make message informative but concise

- [ ] **2.3** Update frontend STEP_TEMPLATE
  - Add complexity_check step to `lib/hooks/useInsights.ts`
  - Position it between template_match and context_discovery
  - Message: "Analyzing question complexity…"

- [ ] **2.4** Update STEP_TRANSITIONS delays
  - Add transition from template_match → complexity_check
  - Add transition from complexity_check → context_discovery
  - Adjust existing delays to maintain smooth flow

**Files to modify:**
- `lib/services/semantic/three-mode-orchestrator.service.ts` - Verify step creation
- `lib/hooks/useInsights.ts` - Update STEP_TEMPLATE and STEP_TRANSITIONS

---

### 3. Break Down Context Discovery into Visible Sub-Steps

**Goal:** Show the 5 sub-steps of context discovery so users see progress within this long-running operation.

#### Tasks:
- [ ] **3.1** Add intent_classification sub-step
  - ID: "intent_classification"
  - Message: "Analyzing question intent…"
  - Include confidence in details

- [ ] **3.2** Add semantic_search sub-step
  - ID: "semantic_search"
  - Message: "Searching semantic index…"
  - Include formsFound and fieldsFound in details

- [ ] **3.3** Add terminology_mapping sub-step
  - ID: "terminology_mapping"
  - Message: "Mapping user terminology…"
  - Include mappingsCount in details

- [ ] **3.4** Add join_path_planning sub-step
  - ID: "join_path_planning"
  - Message: "Planning database joins…"
  - Include pathsCount in details

- [ ] **3.5** Add context_assembly sub-step
  - ID: "context_assembly"
  - Message: "Assembling context…"
  - Include overall confidence in details

- [ ] **3.6** Update context discovery service
  - Modify `ContextDiscoveryService.discoverContext()` to emit thinking steps
  - Or update orchestrator to call discovery service and track sub-steps
  - Ensure sub-steps are added to thinking array as they complete

**Files to modify:**
- `lib/services/semantic/three-mode-orchestrator.service.ts` - Add sub-steps in executeDirect
- `lib/services/context-discovery/context-discovery.service.ts` - Optionally emit progress
- Consider creating a progress callback mechanism

---

## Medium Priority Items

### 4. Implement Expandable/Collapsible Sub-Steps

**Goal:** Allow users to expand main steps to see sub-steps, keeping UI clean by default.

#### Tasks:
- [ ] **4.1** Create SubStepItem component
  - Similar to ThinkingStepItem but with indentation
  - Show with left margin/padding to indicate hierarchy
  - Use subtle border or background to distinguish

- [ ] **4.2** Add expand/collapse button
  - Chevron icon (ChevronRight when collapsed, ChevronDown when expanded)
  - Only show for steps that have sub-steps
  - Position next to step icon or message

- [ ] **4.3** Implement state management
  - Track which steps are expanded (use step.id as key)
  - Default: collapsed for all steps
  - Option: auto-expand if step is currently running

- [ ] **4.4** Style sub-steps with visual hierarchy
  - Indent sub-steps (ml-4 or ml-6)
  - Use lighter text color or smaller font
  - Add subtle left border or background color
  - Ensure spacing between main step and sub-steps

- [ ] **4.5** Add logic to detect sub-steps
  - Check if step has subSteps array
  - Or check step.id pattern (e.g., starts with "context_discovery_")
  - Or use a mapping of parent step IDs to sub-step IDs

**Files to modify:**
- `app/insights/new/components/ThinkingStream.tsx` - Add expand/collapse functionality
- Create new component or extend existing ThinkingStepItem

---

### 5. Add Confidence Badges/Indicators

**Goal:** Provide quick visual feedback on confidence levels for key steps.

#### Tasks:
- [ ] **5.1** Create ConfidenceBadge component
  - Small badge/chip component
  - Color coding: Green (>0.8), Yellow (0.5-0.8), Red (<0.5)
  - Show confidence percentage or icon
  - Size: small, subtle, doesn't dominate

- [ ] **5.2** Define confidence thresholds
  - High confidence: >0.8 (green)
  - Medium confidence: 0.5-0.8 (yellow/amber)
  - Low confidence: <0.5 (red)
  - Consider adding "Very High" (>0.9) and "Very Low" (<0.3) for more granularity

- [ ] **5.3** Display confidence badge
  - Position next to step message or inline metrics
  - Only show for steps that have confidence in details
  - Use small dot or badge icon

- [ ] **5.4** Add hover/tooltip for details
  - Show exact confidence percentage on hover
  - Optionally show what the confidence means
  - Use tooltip component from UI library

**Files to modify:**
- `app/insights/new/components/ThinkingStream.tsx` - Add ConfidenceBadge component
- Or create separate `ConfidenceBadge.tsx` component

---

### 6. Implement Progressive Message Updates

**Goal:** Update main step messages to show current sub-step progress for better feedback.

#### Tasks:
- [ ] **6.1** Create message update system
  - Track current sub-step for main steps
  - Update main step message as sub-steps complete
  - Preserve original message structure

- [ ] **6.2** Update context discovery message
  - Show current sub-step: "Discovering semantic context… (analyzing intent)"
  - Update as each sub-step completes
  - Final message: "Discovering semantic context… (complete)"

- [ ] **6.3** Update SQL generation message
  - Show progress: "Generating SQL… (validating query)"
  - Or show current phase if available from LLM service

- [ ] **6.4** Ensure compatibility with server steps
  - Don't override server-provided messages
  - Only update simulated progress messages
  - Merge server messages when they arrive

**Files to modify:**
- `lib/hooks/useInsights.ts` - Add message update logic
- `app/insights/new/components/ThinkingStream.tsx` - Display updated messages

---

## Supporting Changes

### 7. Update ThinkingStep Interface

**Goal:** Support sub-steps structure in the data model.

#### Tasks:
- [ ] **7.1** Add optional subSteps field
  - Update ThinkingStep interface in `lib/hooks/useInsights.ts`
  - Type: `subSteps?: ThinkingStep[]`
  - Keep it optional for backward compatibility

- [ ] **7.2** Update orchestrator to populate subSteps
  - When creating context_discovery step, add subSteps array
  - Populate subSteps as sub-operations complete
  - Ensure subSteps have proper IDs and status

- [ ] **7.3** Update finalizeThinking merge logic
  - Handle subSteps when merging server thinking
  - Merge subSteps arrays correctly
  - Preserve subSteps structure

**Files to modify:**
- `lib/hooks/useInsights.ts` - Update ThinkingStep interface
- `lib/services/semantic/three-mode-orchestrator.service.ts` - Populate subSteps
- `app/insights/new/components/ThinkingStream.tsx` - Use subSteps

---

## Testing & Verification

### 8. Test All Improvements

**Goal:** Ensure all improvements work correctly together and don't break existing functionality.

#### Tasks:
- [ ] **8.1** Test inline metrics display
  - Verify all metric types display correctly
  - Check formatting (numbers, percentages)
  - Test with missing/null details

- [ ] **8.2** Test complexity step
  - Verify it appears in correct position
  - Check transitions work smoothly
  - Test with different complexity levels

- [ ] **8.3** Test sub-steps display
  - Verify sub-steps appear when expanded
  - Test expand/collapse functionality
  - Check visual hierarchy is clear

- [ ] **8.4** Test confidence badges
  - Verify colors match thresholds
  - Test with different confidence values
  - Check tooltips work

- [ ] **8.5** Test progressive messages
  - Verify messages update smoothly
  - Check no flickering or conflicts
  - Test with fast and slow responses

- [ ] **8.6** Test server step merging
  - Verify server steps merge correctly
  - Check sub-steps are preserved
  - Test with different response scenarios

**Test scenarios:**
- Template match path (fast)
- Direct semantic path (medium)
- Funnel path (complex)
- Clarification request path
- Error scenarios

---

## Implementation Order

### Phase 1: Foundation (High Priority)
1. Update ThinkingStep interface (#7)
2. Add inline metrics display (#1)
3. Add complexity step (#2)
4. Break down context discovery (#3)

### Phase 2: Enhancement (Medium Priority)
5. Add expandable sub-steps (#4)
6. Add confidence badges (#5)
7. Add progressive messages (#6)

### Phase 3: Polish
8. Testing and refinement (#8)

---

## Design Considerations

### Visual Hierarchy
- Main steps: Bold, prominent
- Sub-steps: Indented, lighter weight
- Metrics: Small, subtle gray text
- Badges: Small, color-coded

### Performance
- Don't re-render entire list on every update
- Use React.memo for step items if needed
- Debounce rapid message updates

### Accessibility
- Ensure expand/collapse buttons are keyboard accessible
- Add ARIA labels for screen readers
- Maintain focus management

### User Experience
- Default to collapsed sub-steps (clean UI)
- Auto-expand currently running step (show progress)
- Smooth transitions between states
- Don't show empty or null metrics

---

## Success Criteria

- [ ] Users can see what's happening at a glance (inline metrics)
- [ ] Complex operations show sub-step progress
- [ ] Confidence levels are visually clear
- [ ] UI remains clean and not overwhelming
- [ ] All improvements work together harmoniously
- [ ] No performance degradation
- [ ] Backward compatible with existing code

---

## Notes

- Consider making some features configurable (e.g., always show sub-steps vs. expandable)
- May want to add user preference for detail level
- Consider analytics to see which details users find most useful
- Keep terminal logs for debugging, but UI should be user-friendly

