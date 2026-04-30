# Workflow Organization Page Design

**Date:** 2025-01-15
**Status:** Approved

## Overview

Add a `/workflows` page that visualizes inter-department collaboration flows as a directed graph, with AI-generated initial drafts and full editability. One company = one workflow.

## User Requirements

- Workflow = task pipeline that auto-routes work between agents/positions across departments
- Steps are bound to departments, not individual agents
- Company managers define collaboration flows via visual drag-and-drop
- AI generates initial workflow based on company structure
- Auto-trigger: task creation routes into workflow based on creator's department
- Visual: directed graph (department nodes + labeled edges with action + trigger condition)
- Master Agent sees all companies' workflows; department agents see only their company's (read-only)

## Architecture

### Frontend

```
web/src/
├── pages/WorkflowsPage.tsx
├── pages/WorkflowsPage/
│   ├── components/
│   │   ├── WorkflowCanvas.tsx          # ReactFlow main canvas
│   │   ├── WorkflowNode.tsx            # Custom department node
│   │   ├── WorkflowEdge.tsx            # Custom labeled edge
│   │   ├── WorkflowEdgeDialog.tsx      # Edge edit dialog (action + trigger)
│   │   ├── WorkflowToolbar.tsx         # Top toolbar (generate/edit/save)
│   │   └── WorkflowEmptyState.tsx      # Empty state with "AI Generate" button
│   ├── hooks/
│   │   └── useWorkflowController.ts    # State management + API calls
│   └── types.ts                        # TypeScript types
├── lib/api.ts                          # New workflow API functions
├── i18n/en.ts                          # New workflow namespace
├── i18n/types.ts                       # New workflow type
└── App.tsx                             # New route + nav item
```

### Backend

```
gateway/
├── org/
│   ├── store.py                        # New tables: workflows, workflow_edges, workflow_instances
│   ├── models.py                       # New models
│   └── workflow_engine.py              # New: task matching + routing logic
└── platforms/
    └── api_server_org.py               # New /api/org/workflows routes
```

## Data Models

### `workflows` table

| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | Auto-increment |
| company_id | INTEGER UNIQUE NOT NULL | FK to companies.id |
| name | TEXT NOT NULL | Workflow name |
| description | TEXT | Workflow description |
| status | TEXT DEFAULT 'draft' | draft / active / archived |
| created_at | INTEGER | Unix timestamp |
| updated_at | INTEGER | Unix timestamp |

### `workflow_edges` table

| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | Auto-increment |
| workflow_id | INTEGER NOT NULL | FK to workflows.id |
| source_department_id | INTEGER NOT NULL | FK to departments.id |
| target_department_id | INTEGER NOT NULL | FK to departments.id |
| action_description | TEXT NOT NULL | Collaboration action text |
| trigger_condition | TEXT | Trigger condition text |
| sort_order | INTEGER DEFAULT 0 | Edge ordering |
| created_at | INTEGER | Unix timestamp |

### `workflow_instances` table

| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | Auto-increment |
| workflow_id | INTEGER NOT NULL | FK to workflows.id |
| company_id | INTEGER NOT NULL | FK to companies.id (denormalized for fast queries) |
| task_id | INTEGER NOT NULL | FK to tasks.id |
| current_edge_id | INTEGER | FK to workflow_edges.id |
| status | TEXT DEFAULT 'running' | running / completed / failed |
| started_at | INTEGER | Unix timestamp |
| completed_at | INTEGER | Unix timestamp |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/org/workflows` | Get current company's workflow with edges |
| POST | `/api/org/workflows/generate` | AI-generate workflow from company structure |
| POST | `/api/org/workflows` | Create workflow |
| PUT | `/api/org/workflows/{id}` | Update workflow (node positions, edges) |
| DELETE | `/api/org/workflows/{id}` | Delete workflow |

## Frontend Interaction Flow

### Empty State
- Company has no workflow → show empty card with "AI Generate Workflow" button
- Click → `POST /generate` → loading spinner → render generated draft

### Edit Mode
- Nodes: department cards (name, icon, accent_color), draggable
- Edges: curved arrows with labels; hover shows action_description + trigger_condition
- Toolbar: Edit / Save / Regenerate buttons
- Drag to connect: source node → target node → edge dialog pops up
- Delete edge: select edge + Delete key or right-click menu
- Delete node: select node + Delete key (removes from workflow, not from DB)

### Runtime Display
- Department nodes show badge with active task count
- Active edges highlight with animation
- Bottom status bar: running instance count

## Navigation Visibility

| Agent Type | Nav Item | Content |
|-----------|----------|---------|
| Master Agent | Always visible | All companies via CompanySwitcher, full edit |
| Department Agent | Visible only when company selected | Current company only, read-only |

## Task Auto-Routing

`workflow_engine.match_workflow(task_id)`:
1. Look up task creator's department via creator_agent_id → agents → department_id
2. Find workflow where trigger_department = creator's department
3. If multiple candidates, use AI to analyze task.title + task.description
4. Create workflow_instance record, link task to first step

## UI Library Choices

- **ReactFlow** (`@xyflow/react`) for the workflow canvas — drag, zoom, pan, custom nodes/edges
- Existing **shadcn/ui** components for dialogs, buttons, badges, toolbar
- Existing **CompanySwitcher** for company context
- Existing **i18n** system for translations

## Breaking Changes

- Remove Agent switching from WorkSelector (keep only Company switching)
- Add `/workflows` route to navigation

## Dependencies

- `@xyflow/react` — new dependency for workflow visualization
- No new Python dependencies for backend (use existing OpenAI-compatible client for AI generation)
