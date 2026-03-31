## Stage 1: Canonical Clarification Contract

**Goal**: Introduce a shared clarification model and route direct-query clarifications through one context-grounded builder.
**Success Criteria**: Direct semantic queries emit clarification requests from one service with consistent reason codes and structured options.
**Tests**: Unit tests for clarification decision mapping and orchestrator clarification flow.
**Status**: Complete

## Stage 2: Ambiguous Filter Resolution

**Goal**: Keep low-confidence and ambiguous filters unresolved until clarified, and present relevant field/value options from customer context.
**Success Criteria**: Ambiguous filters no longer silently execute; clarification options are customer-specific and distinguishable.
**Tests**: Regressions for unresolved filters, invalid values, and ambiguous field/value matches.
**Status**: Complete

## Stage 3: Structural Clarification Options

**Goal**: Replace generic measure/grain menus with options grounded in discovered fields, assessment types, and query shape.
**Success Criteria**: Structural clarifications present context-relevant measure, grain, assessment-type, and temporal options.
**Tests**: V2 frame-clarification tests and option-quality tests.
**Status**: In Progress

## Stage 4: SQL Compiler Tightening and Telemetry

**Goal**: Reduce duplicate clarification logic in SQL generation and add clarification-source telemetry.
**Success Criteria**: Upstream clarification owns user-facing questions; SQL generation consumes clarified context and logs source metrics.
**Tests**: End-to-end clarified execution tests.
**Status**: In Progress
