# Refactoring Guides

This folder contains comprehensive guides for preparing InsightGen for beta release and post-beta refactoring.

## Documents

### 1. **BETA_RELEASE_DEPLOYMENT_PREP.md** (706 lines)

**Purpose:** Prepare the application for controlled beta testing on office network

**Covers:**

- ✅ Deployment architecture (clone + pnpm dev + Docker PostgreSQL)
- ✅ Environment setup (`env.local.example` configuration)
- ✅ Database setup (PostgreSQL, migrations, seeding)
- ✅ Application startup and first-time setup
- ✅ Network deployment for local office access
- ✅ Known issues and troubleshooting
- ✅ Quick reference for developers
- ✅ Post-beta checklist

**Key Sections:**

- Part 1-4: Setup & deployment walkthrough
- Part 5-6: User guide & pre-flight checks
- Part 7-8: Network deployment & known issues
- Part 9-11: Quick reference & post-beta tasks

**Audience:** Office developers deploying beta, QA testers, DevOps

**Status:** Ready to use immediately before beta release

---

### 2. **FEATURE_FLAGS_REMOVAL_PLAN.md** (679 lines)

**Purpose:** Comprehensive plan to remove all 7 feature flags from codebase

**Covers:**

- ✅ Complete inventory of 44 files using feature flags
- ✅ Categorized breakdown (config, API routes, pages, services, tests, docs)
- ✅ Detailed removal instructions for each phase
- ✅ Before/after code examples
- ✅ Implementation checklist (67 items)
- ✅ Rollback strategy
- ✅ Testing strategy

**Flags to Remove:**

1. `CHART_INSIGHTS_API_ENABLED` + `CHART_INSIGHTS_ENABLED` + `NEXT_PUBLIC_CHART_INSIGHTS_ENABLED`
2. `ENABLE_AUDIT_DASHBOARD` + `NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD`
3. `AI_TEMPLATES_ENABLED`
4. `USE_CONCEPT_ID_SEARCH`

**8-Phase Plan:**

- Phase 1: Map all usages (done)
- Phase 2: Remove configuration
- Phase 3: Remove service-layer checks
- Phase 4: Remove UI conditional rendering
- Phase 5: Remove component-level checks
- Phase 6: Update tests
- Phase 7: Update documentation
- Phase 8: Remove unused imports

**Audience:** Developers performing refactoring, Tech leads

**Status:** Ready to implement after beta feedback period

**Effort Estimate:** 4-6 hours

---

## Quick Navigation

### For Beta Deployment NOW:

→ **Start with:** `BETA_RELEASE_DEPLOYMENT_PREP.md`

- Part 1: Understand deployment model
- Part 2: Set up `.env.local`
- Part 3: Initialize database
- Part 4: Start application
- Part 5: Verify first-time access

### For Post-Beta Refactoring LATER:

→ **Start with:** `FEATURE_FLAGS_REMOVAL_PLAN.md`

- Phases 1-8 provide step-by-step removal instructions
- Phase 2-4: Bulk of the work (remove conditions)
- Phase 6: Update tests
- Phase 7-8: Clean up docs

---

## Implementation Timeline

### Week 1-2: Beta Release

1. Follow `BETA_RELEASE_DEPLOYMENT_PREP.md`
2. Distribute to office developers
3. Collect feedback

### Week 3-4: Post-Beta Improvements

1. Analyze feedback
2. Execute feature flag removal (`FEATURE_FLAGS_REMOVAL_PLAN.md`)
3. Run tests & smoke tests
4. Document lessons learned

### Week 5+: Production Readiness

1. Create production deployment guide
2. Build Docker image
3. Load testing
4. Security audit
5. Schedule production rollout

---

## Key Statistics

| Metric                           | Value     |
| -------------------------------- | --------- |
| **Total lines in guides**        | 1,385     |
| **Files affected by flags**      | 44        |
| **Feature flags to remove**      | 7         |
| **Removal checklist items**      | 67        |
| **Estimated refactoring effort** | 4-6 hours |
| **Test files to update**         | 4         |
| **Documentation files affected** | 9         |

---

## Files Modified/Created

### New Files

- `docs/refactoring/BETA_RELEASE_DEPLOYMENT_PREP.md` ✨
- `docs/refactoring/FEATURE_FLAGS_REMOVAL_PLAN.md` ✨

### Existing Files (for reference)

- `env.local.example` — Configuration template
- `env.production.example` — Production configuration
- `docker-compose.yml` — Development setup
- `package.json` — NPM scripts

---

## Related Documentation

- **Project Philosophy:** `.cursor/rules/00-core-philosophy.mdc`
- **Simplicity Rules:** `.cursor/rules/01-simplicity.mdc`
- **Compatibility Policy:** `.cursor/rules/20-compatibility.mdc`
- **Main README:** `readme.md`

---

## Decision Log

### Why Remove Feature Flags?

✅ **All flagged features are production-ready**

- Chart Insights: Core to product offering
- Audit Dashboard: Complete and useful
- Templates: DB-backed system is solid
- Semantic Search: Optimization is battle-tested

✅ **Improves code quality**

- Removes ~100 conditional checks
- Eliminates "toggle hell" complexity
- Aligns with "ruthless simplicity" philosophy

✅ **Reduces operational complexity**

- Developers don't need to manage flags
- Deployment is cleaner
- Configuration surface area shrinks

❌ **No downside for beta**

- All features are already enabled by default in `.env.local`
- Removal doesn't change behavior, only removes guards
- Fully reversible if needed (git history)

---

## Rollback Plan

If issues arise:

**Before Starting:** Create feature branch

```bash
git checkout -b post-beta/remove-flags
```

**If Blocker Found:** Revert changes

```bash
git checkout main
git reset --hard HEAD~N
```

**No Risk:** Changes only remove guards; features remain functional

---

## Approval Checklist

- ✅ Comprehensive feature flag inventory created
- ✅ Removal plan written with all 8 phases
- ✅ File-by-file instructions provided
- ✅ Implementation checklist created (67 items)
- ✅ Testing strategy documented
- ✅ Beta deployment guide written
- ✅ Quick reference provided for developers
- ✅ Troubleshooting section included
- ✅ Post-beta tasks listed

---

## Next Steps

1. **For Beta Release (This Week):**
   - [ ] Review `BETA_RELEASE_DEPLOYMENT_PREP.md`
   - [ ] Share with office developers
   - [ ] Conduct walkthrough/training
   - [ ] Deploy to office network

2. **For Post-Beta (After Feedback Collection):**
   - [ ] Review feature flag removal plan
   - [ ] Create feature branch: `post-beta/remove-flags`
   - [ ] Execute phases 1-8 from `FEATURE_FLAGS_REMOVAL_PLAN.md`
   - [ ] Run full test suite
   - [ ] Merge to main

3. **For Production (Future):**
   - [ ] Create production deployment guide
   - [ ] Build and test Docker image
   - [ ] Update `.env.production.example`
   - [ ] Schedule production rollout

---

## Questions?

Refer to the specific guide:

- **"How do I deploy beta?"** → `BETA_RELEASE_DEPLOYMENT_PREP.md`
- **"What files will change?"** → `FEATURE_FLAGS_REMOVAL_PLAN.md` Phase 1
- **"How do I remove a flag?"** → `FEATURE_FLAGS_REMOVAL_PLAN.md` specific phase
- **"What if something breaks?"** → See "Rollback Strategy" sections

---

**Created:** February 3, 2026  
**Version:** 1.0  
**Status:** Ready for Use
