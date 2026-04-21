## Context

**Current State**:
- Chat interface uses `/v1/chat/completions` API (OpenAI-compatible format)
- All enabled skills are loaded automatically when agent starts
- No UI for skill selection or context control
- Message types only support user/assistant/system roles
- Tool/skill invocations are invisible to users

**Architecture**:
- Frontend: React with Zustand state management
- Backend: Python Gateway with aiohttp
- Chat flow: Frontend → Gateway API → Agent Core → LLM with tools
- Message storage: SQLite (hermes_state.py)

**Constraints**:
- Must maintain OpenAI API compatibility for external clients
- Skill loading happens at agent initialization (expensive operation)
- Current message schema doesn't support intermediate steps
- Need real-time updates during streaming responses

## Goals / Non-Goals

**Goals:**
- Allow users to select specific skills before sending messages
- Display tool and skill invocations in the message stream
- Persist skill selection per session
- Maintain backward compatibility with existing chat API

**Non-Goals:**
- Dynamic skill loading/unloading (too slow for chat UX)
- Skill parameter customization (separate feature)
- Real-time skill enable/disable (requires agent restart)
- Non-Electron platform support (focus on desktop app first)

## Decisions

### 1. Skill Selection Storage

**Decision**: Store selected skills in session metadata (SQLite), not message content.

**Rationale**:
- Skills apply to entire conversation context, not individual messages
- Avoids data duplication in every message
- Allows UI to restore selection on session resume
- Simpler API: send once on session creation, persist server-side

**Alternatives considered**:
- Send with every message: Wasteful, increases payload size
- Browser localStorage: Lost on device switch, no sync

### 2. Message Type Extension

**Decision**: Add `tool_use` and `skill_use` as new message types alongside `user`/`assistant`/`system`.

**Schema**:
```typescript
type Message = {
  role: 'user' | 'assistant' | 'system' | 'tool_use' | 'skill_use';
  content: string;
  tool_calls?: ToolCall[];  // for tool_use
  skill_name?: string;      // for skill_use
  metadata?: Record<string, any>;
}
```

**Rationale**:
- Separates concerns: conversation vs execution
- Allows filtering in UI (show/hide tool calls)
- Compatible with OpenAI's tool calling format
- Easy to extend for future execution types

**Alternatives considered**:
- Embed in assistant messages: Hard to parse, loses structure
- Separate "debug" stream: Complex WebSocket setup

### 3. Skill Filtering Approach

**Decision**: Filter skills at agent initialization, not at tool execution time.

**Rationale**:
- Agent tool list is built once at startup
- Runtime filtering would require complex interception
- Clear failure mode: skill not available vs skill failed
- Performance: no overhead per tool call

**Implementation**:
- Add `selected_skills` to session creation request
- Agent reads from session metadata on init
- Only load skills matching selection

**Trade-off**: Changing skills mid-session requires new session (acceptable UX)

### 4. UI Component Architecture

**Decision**: Use shadcn/ui multi-select with skill grouping by category.

**Structure**:
```tsx
<SkillSelector>
  <Popover>
    <SkillGroup category="apple">
      <SkillCheckbox name="imessage" />
      <SkillCheckbox name="notes" />
    </SkillGroup>
  </Popover>
</SkillSelector>
```

**Rationale**:
- Reuses existing UI patterns (consistent with SkillsPage)
- Category grouping aids discovery (20+ skills)
- Popover avoids cluttering input area
- Checkbox state managed by Zustand store

### 5. Backend API Extension

**Decision**: Extend `POST /v1/chat/completions` with `selected_skills` in request body, maintain OpenAI compatibility in response.

**Request**:
```json
{
  "model": "claude-sonnet-4-6",
  "messages": [...],
  "selected_skills": ["imessage", "notes"]  // NEW
}
```

**Rationale**:
- Non-breaking: ignored by OpenAI clients
- Session-scoped: stored in DB, not repeated
- Validation: reject unknown skill names early

**Alternatives considered**:
- Separate `/api/chat/set-skills`: Extra round-trip
- Header-based: Less discoverable, not JSON-compatible

## Risks / Trade-offs

**Risk**: Skill selection reset on browser refresh  
**Mitigation**: Store in session metadata, restore on page load from `/api/sessions/{id}`

**Risk**: Tool invocation messages clutter chat UI  
**Mitigation**: Add collapse/expand toggle, default to collapsed for tool_use messages

**Risk**: Users select incompatible skills  
**Mitigation**: Show skill description on hover, validate on backend (no crash, just unavailable)

**Trade-off**: Cannot change skills mid-session  
**Rationale**: Agent tool list is immutable after init. Acceptable for v1, document in UI.

**Performance**: Loading all skills to populate selector  
**Solution**: Already cached by SkillsPage API, ~50ms for 26 skills

## Migration Plan

**Phase 1: Backend**
1. Add `selected_skills` column to sessions table (nullable, JSON array)
2. Update chat API handler to accept and store selected_skills
3. Modify agent init to filter skills based on session metadata
4. Add tool_use/skill_use message types to schema

**Phase 2: Frontend**
1. Create SkillSelector component
2. Add message renderers for tool_use/skill_use
3. Update chat API client to send selected_skills
4. Add Zustand store for skill selection state

**Phase 3: Polish**
1. Add skill badges to input area (show active skills)
2. Implement collapse/expand for tool invocations
3. Add keyboard shortcuts (Ctrl+K to open selector)

**Rollback**: Feature flagged behind `ENABLE_SKILL_SELECTOR=true` env var. Can disable without data loss.

## Open Questions

1. **Should skill selection UI be per-session or global preference?**
   - Current: Per-session (more flexible, matches screenshot)
   - Alternative: Global default with per-session override

2. **How to handle streaming tool calls?**
   - Option A: Buffer until complete, insert as single message
   - Option B: Show partial with loading indicator
   - Recommendation: A (simpler, matches Claude.ai UX)

3. **Skill availability feedback?**
   - If selected skill is disabled/uninstalled, show warning before send?
   - Or silently skip and log error?
   - Recommendation: Warning badge in UI, allow send anyway
