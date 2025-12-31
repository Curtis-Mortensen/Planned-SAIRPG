# Stage 2: Persistence, Editing & Observability — Stories & Implementation Plan

*Stage 2 adds saves, artifact editing, branching, and the inspector UI.*

**Stage 2 Goal**: Player can save their game, edit any agent output (creating a branch), and see what's happening under the hood.

**Prerequisites**: Stage 1 complete (core loop works)

---

## Stage 2 Stories

### Story 2.0: Save System
**Goal**: Implement save/load with "load as branch" default.

**Why Important**: Saves are required for testing ("can I restore this state?"), for editability ("fork from this save"), and for user trust ("I won't lose progress").

**Deliverables**:
- `lib/saves/index.ts`
- Auto-save after each `TICK_COMMITTED`
- Load creates new branch (never mutates original)

**Schema**:

```sql
CREATE TABLE saves (
  save_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL,
  branch_id     UUID NOT NULL,
  tick_id       UUID NOT NULL,
  save_type     TEXT NOT NULL,  -- 'manual' | 'auto'
  name          TEXT,
  preview       TEXT,           -- Short narrative preview for UI
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saves_session ON saves(session_id, created_at DESC);
```

**Implementation**:

```typescript
// lib/saves/index.ts

export async function createSave(
  sessionId: string,
  branchId: string,
  tickId: string,
  type: 'manual' | 'auto',
  name?: string
): Promise<string> {
  // Get narrative preview from latest narration
  const latestNarrative = await getLatestNarrative(sessionId, branchId, tickId);
  const preview = latestNarrative?.substring(0, 200) + '...';
  
  const { rows } = await db.query(`
    INSERT INTO saves (session_id, branch_id, tick_id, save_type, name, preview)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING save_id
  `, [sessionId, branchId, tickId, type, name ?? `Auto-save ${new Date().toISOString()}`, preview]);
  
  return rows[0].save_id;
}

export async function loadSave(saveId: string): Promise<{
  sessionId: string;
  newBranchId: string;
  tickId: string;
}> {
  // 1. Get save data
  const save = await getSave(saveId);
  
  // 2. Create new branch from this point
  const newBranchId = crypto.randomUUID();
  await db.query(`
    INSERT INTO branches (branch_id, session_id, parent_branch_id, fork_tick_id, is_active)
    VALUES ($1, $2, $3, $4, true)
  `, [newBranchId, save.sessionId, save.branchId, save.tickId]);
  
  // 3. Deactivate previous active branch
  await db.query(`
    UPDATE branches SET is_active = false 
    WHERE session_id = $1 AND branch_id != $2
  `, [save.sessionId, newBranchId]);
  
  return {
    sessionId: save.sessionId,
    newBranchId,
    tickId: save.tickId,
  };
}
```

**Auto-save Integration**:

```typescript
// Update lib/tick/commit.ts from Stage 1

export async function commitTick(tickId: string): Promise<void> {
  const tick = await db.query(`
    UPDATE ticks 
    SET status = 'committed', committed_at = now()
    WHERE tick_id = $1 AND status = 'pending'
    RETURNING session_id, branch_id
  `, [tickId]);
  
  // Auto-save after commit
  await createSave(tick.session_id, tick.branch_id, tickId, 'auto');
  
  // Rotate old auto-saves (keep last 5)
  await rotateAutoSaves(tick.session_id, 5);
}

async function rotateAutoSaves(sessionId: string, keep: number) {
  await db.query(`
    DELETE FROM saves 
    WHERE save_id IN (
      SELECT save_id FROM saves 
      WHERE session_id = $1 AND save_type = 'auto'
      ORDER BY created_at DESC
      OFFSET $2
    )
  `, [sessionId, keep]);
}
```

**⚠️ Watch Out For**:
- **Auto-save rotation**: Keep last N auto-saves (5), delete older ones. Otherwise DB bloats.
- **Load = branch**: Loading a save NEVER overwrites the current timeline. It creates a new branch.
- **Preview text**: Store this at save time, don't recompute on list. Makes save list UI instant.

**Tests**:
- [ ] Auto-save created after each tick commit
- [ ] Load save → new branch_id created
- [ ] Original branch preserved after load
- [ ] Auto-save rotation keeps only N recent

---

### Story 2.1: Artifact Editing & Branch Replay
**Goal**: Player can edit any agent output, which creates a branch and replays downstream.

**This is the hardest story in Stage 2.** It ties together event sourcing, branching, and replay.

**Deliverables**:
- `lib/edit/index.ts`
- API endpoint: `POST /api/edit-artifact`
- Downstream replay logic

**Flow**:

```
1. Player views artifact in inspector
2. Player clicks "Edit" on the Narrator output
3. Player modifies the narrative text
4. System:
   a. Creates new branch from that tick
   b. Creates ARTIFACT_EDITED event
   c. Stores new artifact with edited output
   d. If there are downstream agents, queue them for replay
   e. Commits tick on new branch
```

**Implementation**:

```typescript
// lib/edit/index.ts

export async function editArtifact(
  artifactId: string,
  newOutput: unknown,
  editedBy: string = 'player'
): Promise<{ newBranchId: string; newArtifactId: string }> {
  // 1. Load original artifact
  const original = await getArtifact(artifactId);
  
  // 2. Validate new output against schema
  const schema = getSchemaForAgent(original.agentId);
  schema.parse(newOutput);
  
  // 3. Create new branch
  const newBranchId = crypto.randomUUID();
  await db.query(`
    INSERT INTO branches (branch_id, session_id, parent_branch_id, fork_tick_id, is_active)
    VALUES ($1, $2, $3, $4, true)
  `, [newBranchId, original.sessionId, original.branchId, original.tickId]);
  
  // 4. Deactivate other branches
  await db.query(`
    UPDATE branches SET is_active = false 
    WHERE session_id = $1 AND branch_id != $2
  `, [original.sessionId, newBranchId]);
  
  // 5. Create ARTIFACT_EDITED event on new branch
  const editEventId = await createEvent({
    sessionId: original.sessionId,
    branchId: newBranchId,
    tickId: original.tickId,
    eventType: 'ARTIFACT_EDITED',
    producerKind: 'user',
    producerId: editedBy,
    payload: {
      originalArtifactId: artifactId,
      agentId: original.agentId,
      changes: { old: original.outputPayload, new: newOutput },
    },
    correlationId: original.correlationId,
  });
  
  // 6. Create new artifact with edited output
  const newArtifactId = await createArtifact({
    sessionId: original.sessionId,
    branchId: newBranchId,
    tickId: original.tickId,
    agentId: original.agentId,
    inputEventId: original.inputEventId,
    outputPayload: newOutput,
    status: 'success',
    idempotencyKey: `edited:${artifactId}:${newBranchId}`,
    settingsSnapshot: original.settingsSnapshot,
    metadata: { editedFrom: artifactId, editEventId },
  });
  
  // 7. Queue downstream replay (if any agents depend on this output)
  await queueDownstreamReplay(original, newBranchId, newOutput);
  
  return { newBranchId, newArtifactId };
}

async function queueDownstreamReplay(
  editedArtifact: Artifact,
  newBranchId: string,
  newOutput: unknown
) {
  // Map of which agents consume which event types
  const DOWNSTREAM_AGENTS: Record<string, string[]> = {
    'ACTION_EVALUATED': ['probability-roller'],
    'ROLL_RESOLVED': ['narrator'],
    // Narrator is terminal in Stage 1/2
  };
  
  const downstreamAgents = DOWNSTREAM_AGENTS[editedArtifact.outputEventType] ?? [];
  
  for (const agentId of downstreamAgents) {
    // Create new event for replay
    const replayEventId = await createEvent({
      sessionId: editedArtifact.sessionId,
      branchId: newBranchId,
      tickId: editedArtifact.tickId,
      eventType: editedArtifact.outputEventType,
      producerKind: 'system',
      producerId: 'replay',
      payload: newOutput,
      correlationId: editedArtifact.correlationId,
      causationEventId: editedArtifact.inputEventId,
      metadata: { replay: true, replayDepth: 1 },
    });
    
    // Publish to trigger agent
    await eventBus.publish({
      eventId: replayEventId,
      eventType: editedArtifact.outputEventType,
      sessionId: editedArtifact.sessionId,
      branchId: newBranchId,
      tickId: editedArtifact.tickId,
      correlationId: editedArtifact.correlationId,
    });
  }
}
```

**⚠️ Watch Out For**:
- **Downstream detection**: Hardcode the agent dependency graph for now. Make it dynamic in Stage 3+.
- **Replay loops**: Add a `replayDepth` counter with hard cap (10). Increment on each replay hop.
- **Edited artifact idempotency**: Use different key formula: `edited:${originalId}:${branchId}`.
- **Partial edits**: For now, require the full output object. Don't try to merge partial edits.

**Tests**:
- [ ] Edit narrator output → new branch created
- [ ] Original branch unchanged after edit
- [ ] Edit evaluator output → roller and narrator replay with new input
- [ ] Replay depth capped at 10
- [ ] Idempotent: editing same artifact twice on same branch is safe

---

### Story 2.2: Event Inspector Panel
**Goal**: Player can see what each agent did (transparency).

**Deliverables**:
- `components/EventInspector.tsx`
- Artifact viewer modal
- Edit button (triggers Story 2.1)

**UI Structure**:

```typescript
// components/EventInspector.tsx

export function EventInspector({ sessionId, branchId, tickId }: Props) {
  const { data: events } = useEvents(sessionId, branchId, tickId);
  const { data: artifacts } = useArtifacts(sessionId, branchId, tickId);
  
  return (
    <aside className="w-80 border-l overflow-y-auto">
      <h2>Event Inspector</h2>
      
      {events.map(event => (
        <EventCard key={event.id} event={event}>
          {/* If this event has an artifact, show it */}
          {artifacts[event.id] && (
            <ArtifactViewer 
              artifact={artifacts[event.id]} 
              onEdit={handleEdit}
            />
          )}
        </EventCard>
      ))}
    </aside>
  );
}

function ArtifactViewer({ artifact, onEdit }: ArtifactProps) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className={artifact.status === 'fallback' ? 'bg-yellow-50' : ''}>
      <div className="flex justify-between">
        <span>{artifact.agentId}</span>
        <span>{artifact.status}</span>
      </div>
      
      {/* Summary view */}
      <pre className="text-sm">{JSON.stringify(artifact.outputPayload, null, 2)}</pre>
      
      {/* Expandable: full prompt */}
      <details>
        <summary>View Prompt</summary>
        <pre className="text-xs">{artifact.compiledPrompt}</pre>
      </details>
      
      {/* Edit button */}
      <button onClick={() => onEdit(artifact)}>Edit Output</button>
    </div>
  );
}
```

**⚠️ Watch Out For**:
- **Don't show raw prompts by default**: They're long and confusing. Show in expandable section.
- **Highlight fallbacks**: If an agent used fallback, make it visually obvious (yellow background, warning icon).
- **Edit affordance**: Only show edit button on agent outputs, not system events.
- **Performance**: Don't re-fetch on every render. Use React Query or SWR with proper cache keys.

**Tests**:
- [ ] Inspector shows all events for current tick
- [ ] Clicking artifact shows details
- [ ] Fallback artifacts highlighted
- [ ] Edit button opens edit modal
- [ ] Prompt expandable section works

---

### Story 2.3: Save/Load UI
**Goal**: Player can save, load, and see save list.

**Deliverables**:
- Save button in header
- Save browser modal
- Load confirmation (warns about branching)

**Components**:

```typescript
// components/SaveButton.tsx
export function SaveButton({ sessionId, branchId, tickId }: Props) {
  const [saving, setSaving] = useState(false);
  
  async function handleSave() {
    setSaving(true);
    const name = prompt('Save name (optional):');
    await createManualSave(sessionId, branchId, tickId, name);
    setSaving(false);
    toast.success('Game saved!');
  }
  
  return (
    <button onClick={handleSave} disabled={saving}>
      {saving ? 'Saving...' : 'Save Game'}
    </button>
  );
}

// components/SaveBrowser.tsx
export function SaveBrowser({ sessionId, onLoad }: Props) {
  const { data: saves } = useSaves(sessionId);
  
  return (
    <div className="modal">
      <h2>Load Game</h2>
      <p className="text-sm text-gray-600">
        Loading a save creates a new timeline branch. Your current progress is preserved.
      </p>
      
      <ul>
        {saves.map(save => (
          <li key={save.id} className="flex justify-between">
            <div>
              <strong>{save.name}</strong>
              <span className="text-sm">{formatDate(save.createdAt)}</span>
              <p className="text-xs">{save.preview}</p>
            </div>
            <button onClick={() => onLoad(save.id)}>Load</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**⚠️ Watch Out For**:
- **Branching explanation**: Users need to understand that loading creates a branch. Show this clearly.
- **Preview truncation**: Keep preview short (200 chars). Truncate with ellipsis.
- **Auto-save distinction**: Maybe show auto-saves in a separate section or with different styling.

**Tests**:
- [ ] Save button creates manual save
- [ ] Save browser shows all saves
- [ ] Load creates new branch
- [ ] Auto-saves appear in list
- [ ] Preview text displays correctly

---

### Story 2.4: Settings UI
**Goal**: Player can adjust narrator verbosity and tone.

**Deliverables**:
- Settings modal/panel
- Narrator tone selector
- Narrator verbosity selector  
- Settings persist to DB per session

**Schema**:

```sql
CREATE TABLE session_settings (
  session_id    UUID NOT NULL,
  branch_id     UUID NOT NULL,
  settings      JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (session_id, branch_id)
);
```

**Implementation**:

```typescript
// lib/settings/index.ts

const DEFAULT_SETTINGS = {
  narrator: {
    tone: 'neutral',      // 'gritty' | 'neutral' | 'heroic'
    verbosity: 'normal',  // 'brief' | 'normal' | 'elaborate'
  },
};

export async function getSettings(sessionId: string, branchId: string) {
  const result = await db.query(`
    SELECT settings FROM session_settings 
    WHERE session_id = $1 AND branch_id = $2
  `, [sessionId, branchId]);
  
  return { ...DEFAULT_SETTINGS, ...result?.settings };
}

export async function updateSettings(
  sessionId: string, 
  branchId: string, 
  updates: Partial<Settings>
) {
  await db.query(`
    INSERT INTO session_settings (session_id, branch_id, settings, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (session_id, branch_id) 
    DO UPDATE SET settings = session_settings.settings || $3, updated_at = now()
  `, [sessionId, branchId, updates]);
}
```

**UI**:

```typescript
// components/SettingsPanel.tsx

export function SettingsPanel({ sessionId, branchId }: Props) {
  const { data: settings, mutate } = useSettings(sessionId, branchId);
  
  async function handleChange(key: string, value: string) {
    await updateSettings(sessionId, branchId, { [key]: value });
    mutate();
  }
  
  return (
    <div className="p-4">
      <h2>Settings</h2>
      
      <div>
        <label>Narrator Tone</label>
        <select 
          value={settings.narrator.tone}
          onChange={e => handleChange('narrator.tone', e.target.value)}
        >
          <option value="gritty">Gritty</option>
          <option value="neutral">Neutral</option>
          <option value="heroic">Heroic</option>
        </select>
      </div>
      
      <div>
        <label>Narrator Verbosity</label>
        <select
          value={settings.narrator.verbosity}
          onChange={e => handleChange('narrator.verbosity', e.target.value)}
        >
          <option value="brief">Brief</option>
          <option value="normal">Normal</option>
          <option value="elaborate">Elaborate</option>
        </select>
      </div>
    </div>
  );
}
```

**⚠️ Watch Out For**:
- **Settings scope**: Settings are per-branch. When you create a branch, copy settings from parent.
- **Apply on next tick**: Changed settings apply on the NEXT tick, not retroactively.
- **Default handling**: Always merge with defaults. Don't crash if a setting is missing.

**Tests**:
- [ ] Settings UI shows current values
- [ ] Changing setting persists to DB
- [ ] Settings affect next narrator output
- [ ] New branch inherits parent settings
- [ ] Missing settings use defaults

---

### Story 2.5: Prompt Editing UI
**Goal**: Player can view and edit prompt templates, triggering re-loop.

**Deliverables**:
- Prompt editor accessible from inspector
- Version history viewer
- "Save & Re-run" button

**UI Flow**:

```
1. Player opens inspector
2. Clicks on an artifact's "View Prompt" 
3. Sees the compiled prompt that was used
4. Clicks "Edit Template" to modify the base template
5. Saves new version (becomes active)
6. Clicks "Re-run with new prompt"
7. System creates branch and replays from that artifact
```

**Implementation**:

```typescript
// components/PromptEditor.tsx

export function PromptEditor({ agentId, promptKey, artifact }: Props) {
  const { data: template } = usePromptTemplate(agentId, promptKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(template?.body ?? '');
  
  async function handleSave() {
    // Create new version
    await createPromptVersion(agentId, promptKey, draft);
    setEditing(false);
  }
  
  async function handleRerun() {
    // This triggers artifact edit → branch → replay
    await rerunWithCurrentPrompt(artifact.id);
  }
  
  return (
    <div>
      <h3>Prompt Template: {agentId}/{promptKey}</h3>
      
      {/* Show compiled prompt from artifact */}
      <details>
        <summary>Compiled Prompt (as sent)</summary>
        <pre>{artifact.compiledPrompt}</pre>
      </details>
      
      {/* Template editor */}
      {editing ? (
        <>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} />
          <div>
            <button onClick={handleSave}>Save New Version</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <pre>{template?.body}</pre>
          <button onClick={() => setEditing(true)}>Edit Template</button>
        </>
      )}
      
      {/* Re-run button */}
      <button onClick={handleRerun}>
        Re-run Agent with Current Template
      </button>
      
      {/* Version history */}
      <VersionHistory agentId={agentId} promptKey={promptKey} />
    </div>
  );
}
```

**⚠️ Watch Out For**:
- **Version activation**: Creating a new version should auto-activate it (deactivate old).
- **Re-run vs Edit**: "Re-run" uses the current template version. "Edit artifact" uses the stored compiled prompt.
- **Variable validation**: Validate that the template still has all required variables before saving.
- **Dangerous edits**: Consider warning if removing variables that are required.

**Tests**:
- [ ] Can view current template
- [ ] Can edit and save new version
- [ ] New version auto-activates
- [ ] Re-run creates branch and replays
- [ ] Version history shows all versions
- [ ] Can rollback to previous version

---

## Implementation Order Summary

| Order | Story | Risk | Dependencies |
|-------|-------|------|--------------|
| 1 | 2.0 Save System | Medium | Stage 1 complete |
| 2 | 2.1 Artifact Editing | **HIGH** | 2.0 |
| 3 | 2.2 Event Inspector | Medium | 2.1 |
| 4 | 2.3 Save/Load UI | Low | 2.0, 2.2 |
| 5 | 2.4 Settings UI | Low | 2.2 |
| 6 | 2.5 Prompt Editing | Medium | 2.1, 2.2 |

---

## Red Flags / Things That Will Bite You

### 1. "Editing creates infinite branches"
- **Cause**: Each edit creates a branch, user edits again on new branch, etc.
- **Fix**: This is fine! But show branch count in UI. Consider branch management/deletion in Stage 3+.

### 2. "Auto-save fills up the database"
- **Cause**: No rotation, keeping every auto-save forever.
- **Fix**: Rotation is in Story 2.0. Keep last 5 auto-saves per session.

### 3. "Settings don't seem to apply"
- **Cause**: Settings apply on next tick, not current. Or settings for wrong branch.
- **Fix**: Clear messaging: "Changes apply to next action". Load settings for active branch.

### 4. "Prompt edit broke everything"
- **Cause**: Removed a required variable, or syntax error.
- **Fix**: Validate before save. Show clear error if compilation fails.

### 5. "Branch switching is confusing"
- **Cause**: User doesn't know which branch they're on after load/edit.
- **Fix**: Show current branch indicator in header. Consider branch switcher UI in Stage 3+.

---

## Definition of Done for Stage 2

- [ ] Auto-save happens after each tick
- [ ] Player can save manually with custom name
- [ ] Player can load any save (creates branch)
- [ ] Player can edit any agent output
- [ ] Editing creates a branch and replays downstream
- [ ] Event inspector shows all events and artifacts
- [ ] Fallback artifacts are highlighted
- [ ] Settings UI works for narrator tone/verbosity
- [ ] Settings affect subsequent outputs
- [ ] Player can edit prompt templates
- [ ] Prompt edits trigger re-run with branching
- [ ] Version history for prompts visible

---

*Document Version: 1.0*
*Created: December 31, 2024*

