# Conversation UI Implementation Tracker

**Last Updated:** 2026-01-14  
**Status:** Not Started  
**Estimated Completion:** 4 weeks from start date

---

## 📋 Phase Completion Status

- [ ] **Phase 1:** Database & Migrations (Week 1)
- [ ] **Phase 2:** API Endpoints (Week 1)
- [ ] **Phase 3:** Conversation Hook (Week 1)
- [ ] **Phase 4:** UI Components (Week 2)
- [ ] **Phase 5:** Smart Suggestions (Week 3)
- [ ] **Phase 6:** Integration & Testing (Week 3)
- [ ] **Phase 7:** Migration & Rollout (Week 4)

---

## Week 1: Foundation

### Phase 1: Database & Migrations

#### Day 1-2: Database Setup
- [ ] **Task 1.1:** Create migration file `030_create_conversation_tables.sql`
  - [ ] ConversationThreads table
  - [ ] ConversationMessages table
  - [ ] Indexes created
  - [ ] Trigger for auto-update timestamp
  - [ ] Comments added

- [ ] **Task 1.2:** Run migration
  ```bash
  npm run migrate
  ```
  - [ ] Migration executes successfully
  - [ ] No errors in console

- [ ] **Task 1.3:** Verify tables exist
  ```sql
  SELECT * FROM "ConversationThreads" LIMIT 1;
  SELECT * FROM "ConversationMessages" LIMIT 1;
  ```
  - [ ] Both tables exist
  - [ ] Indexes are active
  - [ ] Trigger is registered

**Completion Criteria:**
- ✅ Tables created in database
- ✅ Can insert test records
- ✅ Trigger updates thread timestamp on message insert

---

### Phase 2: API Endpoints

#### Day 1-2: Core API Routes

- [ ] **Task 2.1:** Create types file `lib/types/conversation.ts`
  - [ ] ConversationThread interface
  - [ ] ConversationMessage interface
  - [ ] MessageMetadata interface
  - [ ] ConversationContext interface
  - [ ] SmartSuggestion interface

- [ ] **Task 2.2:** Create POST `/api/insights/conversation/send`
  - [ ] File created: `app/api/insights/conversation/send/route.ts`
  - [ ] Handles new thread creation
  - [ ] Handles existing thread continuation
  - [ ] Saves user message to database
  - [ ] Calls ThreeModeOrchestrator with context
  - [ ] Saves assistant message
  - [ ] Returns response with threadId

- [ ] **Task 2.3:** Create GET `/api/insights/conversation/:threadId`
  - [ ] File created: `app/api/insights/conversation/[threadId]/route.ts`
  - [ ] Loads thread from database
  - [ ] Verifies user ownership
  - [ ] Loads all messages for thread
  - [ ] Returns thread + messages

- [ ] **Task 2.4:** Create POST `/api/insights/conversation/new`
  - [ ] File created: `app/api/insights/conversation/new/route.ts`
  - [ ] Creates new empty thread
  - [ ] Returns threadId

- [ ] **Task 2.5:** Create GET `/api/insights/conversation/history`
  - [ ] File created: `app/api/insights/conversation/history/route.ts`
  - [ ] Lists user's threads
  - [ ] Filters by customerId (optional)
  - [ ] Pagination support (limit/offset)
  - [ ] Returns thread summaries

**Testing:**
- [ ] Test with Postman/Insomnia
- [ ] POST send → creates thread
- [ ] POST send → adds to existing thread
- [ ] GET threadId → loads messages
- [ ] GET history → lists threads

**Completion Criteria:**
- ✅ All 4 endpoints created
- ✅ Manual API tests pass
- ✅ Database records created correctly

---

### Phase 3: Conversation Hook

#### Day 3-4: State Management

- [ ] **Task 3.1:** Create `lib/hooks/useConversation.ts`
  - [ ] useState for threadId, messages, isLoading, error
  - [ ] sendMessage function (with optimistic updates)
  - [ ] editMessage function
  - [ ] startNewConversation function
  - [ ] loadConversation function
  - [ ] AbortController for cancellation

- [ ] **Task 3.2:** Write unit tests
  - [ ] File: `lib/hooks/__tests__/useConversation.test.ts`
  - [ ] Test: sendMessage updates state
  - [ ] Test: editMessage re-runs query
  - [ ] Test: startNewConversation clears state
  - [ ] Test: loadConversation loads from history

**Testing:**
- [ ] Run tests: `npm test useConversation.test.ts`
- [ ] All tests pass

**Completion Criteria:**
- ✅ Hook manages conversation state correctly
- ✅ Optimistic updates work
- ✅ Error handling works
- ✅ Tests pass

---

## Week 2: UI Components

### Phase 4: UI Components

#### Day 1-2: Message Components

- [ ] **Task 4.1:** Create `ConversationInput.tsx`
  - [ ] File: `app/insights/new/components/ConversationInput.tsx`
  - [ ] Auto-resize textarea
  - [ ] Ctrl+Enter to send
  - [ ] Disabled state when loading
  - [ ] Placeholder text
  - [ ] Auto-focus when enabled

- [ ] **Task 4.2:** Create `UserMessage.tsx`
  - [ ] File: `app/insights/new/components/UserMessage.tsx`
  - [ ] Display user question
  - [ ] Edit button
  - [ ] Edit mode (textarea)
  - [ ] Save & Cancel buttons
  - [ ] Warning message (discards subsequent)
  - [ ] Timestamp display

- [ ] **Task 4.3:** Create `AssistantMessage.tsx`
  - [ ] File: `app/insights/new/components/AssistantMessage.tsx`
  - [ ] Display AI response text
  - [ ] Display results table
  - [ ] Display loading state (ThinkingStream)
  - [ ] Display message actions
  - [ ] Timestamp display

- [ ] **Task 4.4:** Create `ResultsTable.tsx`
  - [ ] File: `app/insights/new/components/ResultsTable.tsx`
  - [ ] Display columns and rows
  - [ ] Limit to maxRows (default 10)
  - [ ] Show "X of Y rows" message
  - [ ] Handle null/undefined values

- [ ] **Task 4.5:** Create `MessageActions.tsx`
  - [ ] File: `app/insights/new/components/MessageActions.tsx`
  - [ ] Save button (opens SaveInsightDialog)
  - [ ] Chart button (opens ChartConfigurationDialog)
  - [ ] Export CSV button
  - [ ] More dropdown (Copy SQL, Share, Template)

**Testing:**
- [ ] Components render correctly
- [ ] Edit flow works
- [ ] Actions trigger correctly
- [ ] Export CSV downloads file

**Completion Criteria:**
- ✅ All 5 components created
- ✅ Components are visually correct
- ✅ Interactions work as expected

---

#### Day 3-4: Page Layout

- [ ] **Task 4.6:** Create main page `app/insights/conversation/page.tsx`
  - [ ] Fixed header (Customer + Model + New Chat)
  - [ ] Scrollable message area
  - [ ] Empty state for no messages
  - [ ] Message list (UserMessage + AssistantMessage)
  - [ ] Smart suggestions after last message
  - [ ] Sticky input at bottom
  - [ ] Auto-scroll to bottom on new message

- [ ] **Task 4.7:** Style and polish
  - [ ] Mobile responsive
  - [ ] Proper spacing
  - [ ] Loading states
  - [ ] Error states
  - [ ] Transitions/animations

**Testing:**
- [ ] Open in browser
- [ ] Send message → appears in thread
- [ ] Auto-scroll works
- [ ] New Chat clears conversation
- [ ] Edit message works

**Completion Criteria:**
- ✅ Page renders correctly
- ✅ Full conversation flow works
- ✅ Mobile responsive
- ✅ No console errors

---

## Week 3: Smart Suggestions & Testing

### Phase 5: Smart Suggestions

#### Day 1-2: Suggestion Services

- [ ] **Task 5.1:** Create `lib/services/suggestion-generator.service.ts`
  - [ ] Generate smart follow-ups based on SQL analysis
  - [ ] Detect aggregation → drill-down suggestion
  - [ ] Detect time columns → comparison suggestions
  - [ ] Detect patient data → analysis suggestions
  - [ ] Detect wound data → metric suggestions
  - [ ] Confidence scoring
  - [ ] Return top 4 suggestions

- [ ] **Task 5.2:** Create `lib/services/refinement-generator.service.ts`
  - [ ] Generate refinement suggestions
  - [ ] "Explain what you found"
  - [ ] "Show only top 10"
  - [ ] Time filter changes
  - [ ] Include inactive
  - [ ] Add more columns
  - [ ] Return top 5 refinements

- [ ] **Task 5.3:** Write tests
  - [ ] Test suggestion generation for various SQL patterns
  - [ ] Test refinement generation
  - [ ] Test confidence scoring

**Testing:**
- [ ] Run tests: `npm test suggestion-generator.test.ts`
- [ ] Run tests: `npm test refinement-generator.test.ts`
- [ ] All tests pass

**Completion Criteria:**
- ✅ Services generate relevant suggestions
- ✅ SQL parsing works correctly
- ✅ Tests pass

---

#### Day 3: Suggestion UI

- [ ] **Task 5.4:** Create `SmartSuggestions.tsx`
  - [ ] File: `app/insights/new/components/SmartSuggestions.tsx`
  - [ ] Display follow-up suggestions
  - [ ] Display refinement suggestions
  - [ ] Click suggestion → fill input (don't submit)
  - [ ] Show only if suggestions exist
  - [ ] Icons and labels

**Testing:**
- [ ] Suggestions appear after response
- [ ] Click suggestion → input fills
- [ ] Can edit filled suggestion before sending

**Completion Criteria:**
- ✅ Suggestions display correctly
- ✅ Click behavior works
- ✅ UI is polished

---

### Phase 6: Integration & Testing

#### Day 4-5: Full Integration

- [ ] **Task 6.1:** Integration testing
  - [ ] End-to-end conversation flow
  - [ ] Context carryover between messages
  - [ ] Edit message → discards subsequent
  - [ ] New chat → clears state
  - [ ] Load from history → restores thread

- [ ] **Task 6.2:** Manual testing scenarios
  - [ ] Basic Flow: Ask → Response → Follow-up
  - [ ] Progressive drill-down (3-4 questions)
  - [ ] Edit Flow: Edit Q1 → Q2 discarded
  - [ ] New Chat: Clear → Start fresh
  - [ ] Suggestions: Click → Fill → Edit → Send
  - [ ] Error Handling: Network failure, invalid input

- [ ] **Task 6.3:** Fix bugs
  - [ ] Track bugs in tracker
  - [ ] Fix all P0 bugs
  - [ ] Document known issues

**Completion Criteria:**
- ✅ All manual tests pass
- ✅ No critical bugs
- ✅ User flow is smooth

---

## Week 4: Rollout

### Phase 7: Migration & Rollout

#### Day 1-2: Feature Flag Setup

- [ ] **Task 7.1:** Create feature flag system
  - [ ] File: `lib/config/feature-flags.ts`
  - [ ] Environment variable: `NEXT_PUBLIC_ENABLE_CONVERSATION_UI`
  - [ ] Function: `isConversationUIEnabled(userId)`

- [ ] **Task 7.2:** Add routing logic
  - [ ] Route to new page if flag enabled
  - [ ] Keep old page accessible at `/insights/legacy`

- [ ] **Task 7.3:** Internal testing
  - [ ] Enable for development environment
  - [ ] Test with multiple users
  - [ ] Collect feedback

**Completion Criteria:**
- ✅ Feature flag works
- ✅ Can toggle on/off
- ✅ No breaking changes to production

---

#### Day 3-4: Beta Rollout

- [ ] **Task 7.4:** Beta user testing
  - [ ] Enable for 3-5 beta users
  - [ ] Collect usage data
  - [ ] Fix reported issues
  - [ ] Iterate on feedback

- [ ] **Task 7.5:** Documentation
  - [ ] Write user guide
  - [ ] Create video tutorial (optional)
  - [ ] Update internal docs

**Completion Criteria:**
- ✅ Beta users provide positive feedback
- ✅ No major issues reported
- ✅ Documentation complete

---

#### Day 5: Full Rollout

- [ ] **Task 7.6:** Gradual rollout
  - [ ] 25% of users (1 day)
  - [ ] 50% of users (2 days)
  - [ ] 100% of users (3 days)

- [ ] **Task 7.7:** Monitor metrics
  - [ ] Questions per session
  - [ ] Follow-up question rate
  - [ ] Suggestion click rate
  - [ ] Error rate
  - [ ] User satisfaction

- [ ] **Task 7.8:** Final cleanup
  - [ ] Remove old page after 2 weeks
  - [ ] Remove feature flag code
  - [ ] Archive old components

**Completion Criteria:**
- ✅ Feature rolled out to all users
- ✅ Metrics show positive impact
- ✅ Old code removed

---

## 🐛 Known Issues

Track bugs and issues here:

| ID | Severity | Description | Status | Assignee |
|----|----------|-------------|--------|----------|
| - | - | - | - | - |

**Severity Levels:**
- **P0:** Blocking, must fix before rollout
- **P1:** High, fix within 1 week
- **P2:** Medium, fix within 2 weeks
- **P3:** Low, fix when time permits

---

## 📊 Metrics Dashboard

Track success metrics here:

### Week 1 (Post-Rollout)
- Questions per session: ___ (Target: 3.5+)
- Follow-up question rate: ___% (Target: 60%+)
- Suggestion click rate: ___% (Target: 40%+)
- Error rate: ___% (Target: <5%)

### Week 2
- Questions per session: ___
- Follow-up question rate: ___%
- Suggestion click rate: ___%
- User satisfaction: ___/5 (Target: 4.0+)

### Week 4
- Questions per session: ___
- Follow-up question rate: ___%
- Suggestion click rate: ___%
- Edit usage rate: ___% (Target: 15%+)

---

## ✅ Final Checklist

Before marking as complete:

- [ ] All phases completed
- [ ] All tests passing
- [ ] No P0 or P1 bugs
- [ ] Metrics show positive impact
- [ ] Documentation complete
- [ ] Old code removed
- [ ] Feature flag removed
- [ ] Team trained on new feature

---

## 📝 Notes

**Implementation Notes:**
- Add notes here as you implement
- Document any deviations from original design
- Track architectural decisions

**Lessons Learned:**
- Document what worked well
- Document what could be improved
- Share with team for future projects

---

**Status:** Not Started  
**Start Date:** ___________  
**Estimated Completion Date:** ___________ (4 weeks from start)  
**Actual Completion Date:** ___________
