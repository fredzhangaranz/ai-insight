## Stage 5: Runtime Semantic Guardrails

**Goal**: Detect likely semantic mismatches before and after SQL execution without changing the public query contract.  
**Success Criteria**: Direct-mode results include semantic execution diagnostics; zero-row results surface structured likely causes instead of silent empties.  
**Tests**: Semantic diagnostics service unit tests; orchestrator regression for zero-row diagnosis attachment.  
**Status**: Complete

## Stage 6: Clarified-Path Caching

**Goal**: Reduce repeated discovery latency for repeated questions and clarification follow-ups.  
**Success Criteria**: Context discovery reuses cached bundles for identical customer/question/model requests; API cache stores reusable clarification responses.  
**Tests**: Context discovery cache regression; API/session cache behavior remains backward compatible.  
**Status**: Complete

## Stage 7: Indexing And Rollout Follow-Ons

**Goal**: Preserve room for later semantic-index metadata/versioning work without breaking the live query path.  
**Success Criteria**: Current runtime changes remain additive and do not require schema migrations; remaining index-versioning work is isolated for a later pass.  
**Tests**: Existing discovery and semantic-query tests continue to pass.  
**Status**: Not Started
