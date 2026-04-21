# Skill Selector Feature

## Overview

The Skill Selector allows users to choose which skills the AI agent can use during a chat session. This provides fine-grained control over agent capabilities and helps manage context for specific tasks.

## Features

- **Multi-select UI**: Select multiple skills at once with category grouping
- **Search & Filter**: Quickly find skills by name or description
- **Visual Feedback**: Color-coded badges show selected skills with category indicators
- **Session Persistence**: Selected skills are stored per session
- **Real-time Display**: See tool invocations and skill loading status in the message stream
- **Toggle Visibility**: Hide/show tool calls to reduce visual clutter

## User Interface

### Opening the Skill Selector

**Method 1: Click the icon**
- Click the ✨ sparkles icon in the chat input area

**Method 2: Keyboard shortcut**
- Press `Ctrl+K` (Windows/Linux) or `Cmd+K` (macOS) while not focused on an input field

### Selecting Skills

1. Open the skill selector
2. Browse skills organized by category (coding, search, browser, data, etc.)
3. Click checkboxes to select/deselect individual skills
4. Click category headers to select/deselect all skills in that category
5. Use the search box to filter by name or description
6. Click "Apply" to confirm selection

### Selected Skills Display

After selecting skills:
- Color-coded badges appear above the input area
- Each badge shows the skill name with its category color
- Click the ✕ on any badge to remove that skill
- Unavailable skills show a ⚠️ warning indicator

### Tool Invocation Display

When the agent uses tools:
- Tool invocation cards appear in the message stream
- Each card shows:
  - Tool name and status (executing/completed/failed)
  - Execution duration
  - Parameters (click to expand)
  - Result (click to expand)
- Click the eye icon in the chat header to hide/show all tool calls

## API Usage

### Streaming Endpoint

```
GET /api/sessions/{session_id}/stream?message=...&selected_skills=[...]
```

**Query Parameters:**
- `message` (string, required): The user's message
- `selected_skills` (JSON array, optional): List of skill names to enable
- `attachments` (JSON array, optional): Attachment metadata

**Example:**
```bash
curl "http://localhost:8642/api/sessions/chat_abc123/stream?\
message=Search%20for%20latest%20AI%20news&\
selected_skills=%5B%22web-access%22%2C%22browser-use%22%5D"
```

### SSE Events

The streaming endpoint emits the following Server-Sent Events:

#### content Event
```json
event: content
data: {"delta": "Hello "}
```

#### tool_use Event
```json
event: tool_use
data: {
  "invocations": [{
    "id": "tool_abc123",
    "tool": "web_search",
    "args": {"query": "AI news"},
    "status": "success",
    "result": "Found 10 results...",
    "duration": 1234
  }]
}
```

#### skill_loaded Event
```json
event: skill_loaded
data: {
  "skills": [{
    "name": "web-access",
    "status": "loaded",
    "category": "search"
  }]
}
```

#### done Event
```json
event: done
data: {"finish_reason": "stop"}
```

#### error Event
```json
event: error
data: {"error": "Error message"}
```

## Database Schema

### sessions Table

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    source TEXT,
    user_id TEXT,
    started_at REAL,
    ended_at REAL,
    selected_skills TEXT,  -- JSON array of skill names
    ...
);
```

### messages Table

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,  -- user | assistant | system | tool | tool_use | skill_use
    content TEXT,
    metadata TEXT,  -- JSON object with tool_invocations or skills
    timestamp REAL,
    ...
);
```

## Message Types

### tool_use Message

Represents tool invocations during agent execution:

```json
{
  "role": "tool_use",
  "content": null,
  "metadata": {
    "tool_invocations": [{
      "id": "tool_001",
      "tool": "web_search",
      "args": {"query": "test"},
      "status": "success",
      "result": "...",
      "duration": 1234
    }]
  },
  "timestamp": 1234567890.0
}
```

### skill_use Message

Represents skill loading status:

```json
{
  "role": "skill_use",
  "content": null,
  "metadata": {
    "skills": [{
      "name": "web-access",
      "status": "loaded",
      "category": "search",
      "toolCount": 5
    }]
  },
  "timestamp": 1234567890.0
}
```

## Validation Rules

1. **Type Validation**: `selected_skills` must be an array of strings
2. **Skill Existence**: All skill names must exist in `~/.hermes/skills/`
3. **Session Lock**: Skills cannot be changed after the first message in a session
4. **Empty Array**: An empty `[]` means no skills selected (default behavior)
5. **Null/Undefined**: Omitting the parameter loads all enabled skills

## Error Responses

### Invalid Skills
```json
HTTP 400 Bad Request
{
  "error": {
    "message": "Unknown skills: invalid-skill",
    "type": "invalid_request_error"
  }
}
```

### Mid-Session Change
```json
HTTP 400 Bad Request
{
  "error": {
    "message": "Cannot change selected skills after the first message",
    "type": "invalid_request_error"
  }
}
```

## Frontend Integration

### Using the Skill Selection Store

```typescript
import { useSkillSelectionStore } from '@/stores/useSkillSelectionStore';

function MyComponent() {
  const {
    skills,           // All available skills
    selectedSkills,   // Currently selected skill names
    toggleSkill,      // Toggle a skill on/off
    clearSelection,   // Clear all selected skills
  } = useSkillSelectionStore();

  return (
    <div>
      {skills.map(skill => (
        <button
          key={skill.name}
          onClick={() => toggleSkill(skill.name)}
        >
          {skill.name}
          {selectedSkills.includes(skill.name) && ' ✓'}
        </button>
      ))}
    </div>
  );
}
```

### Rendering Tool Invocations

```typescript
import { ToolInvocationMessage } from '@/components/chat/ToolInvocationMessage';

function MessageRenderer({ message }) {
  if (message.role === 'tool_use' && message.metadata?.tool_invocations) {
    return (
      <ToolInvocationGroup
        invocations={message.metadata.tool_invocations}
      />
    );
  }

  // ... other message types
}
```

## Configuration

### Enabling/Disabling Skills

Skills are managed in `~/.hermes/skills/` directory. To disable a skill:

```bash
# Via CLI
hermes skills disable web-access

# Via Dashboard
Navigate to Skills page → Toggle the skill off
```

### Category Customization

Edit the skill's `skill.yaml` file:

```yaml
name: my-skill
description: My custom skill
category: custom  # coding | search | browser | data | other | custom
enabled: true
```

## Best Practices

1. **Start Specific**: Select only the skills you need for a task
2. **Combine Wisely**: Some skills work better together (e.g., web-access + browser-use)
3. **Monitor Performance**: More skills = more overhead; use judiciously
4. **Review Tool Calls**: Use the visibility toggle to understand what the agent is doing
5. **Update Sessions**: Start a new chat when changing skill requirements significantly

## Troubleshooting

### Skills Not Appearing

1. Check `~/.hermes/skills/` directory exists
2. Verify `skill.yaml` is present in each skill directory
3. Check skill is enabled: `hermes skills list`
4. Restart the gateway: `hermes gateway restart`

### Selected Skills Not Working

1. Verify skills are actually loaded in skill_loaded event
2. Check browser console for SSE event logs
3. Verify session metadata in database:
   ```sql
   SELECT selected_skills FROM sessions WHERE id = 'your_session_id';
   ```

### Tool Invocations Not Showing

1. Check chat settings visibility toggle (eye icon)
2. Verify tool_use events in browser Network tab (EventStream)
3. Check agent has tool_start_callback configured
4. Review server logs for tool execution errors

## Future Enhancements

- [ ] Skill recommendations based on message content
- [ ] Per-skill configuration options
- [ ] Skill usage statistics and analytics
- [ ] Skill dependencies and conflicts detection
- [ ] Custom skill categories and grouping
- [ ] Skill filtering at agent initialization (currently deferred)

## See Also

- [Skills Hub Documentation](../skills/README.md)
- [API Reference](../api/README.md)
- [Database Schema](../database/schema.md)
