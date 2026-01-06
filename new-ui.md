Based on the Vercel AI Chatbot template structure, here's a comprehensive UI spec document for SAIRPG:

---

# SAIRPG UI Specification Document

## Overview

This document specifies the UI changes needed to transform the Vercel AI Chatbot template into SAIRPG's simulation game interface. The base template uses Next.js App Router, shadcn/ui, Tailwind CSS, and Radix UI primitives.

---

## Section 1: Global Navigation Shell

### 1.1 Requirements

**Desktop Layout:**
- Persistent left sidebar (48px collapsed, 240px expanded) similar to Opera/VS Code
- Icon-based quick navigation when collapsed
- Labeled navigation when expanded
- Hover-to-expand behavior (optional setting)

**Mobile Layout:**
- Top-left hamburger menu button
- Slide-out drawer navigation (full height)
- Secondary button for context pane toggle

**Navigation Items:**
| Icon | Label | Route | Description |
|------|-------|-------|-------------|
| Gamepad2 | Play | `/play` | Chat interface for game interaction |
| Settings2 | World Editor | `/editor` | Module config, prompt editor, and event log |

### 1.2 Component Structure

```
components/
├── layout/
│   ├── app-shell.tsx          # Main layout wrapper
│   ├── nav-sidebar.tsx        # Desktop sidebar
│   ├── nav-mobile-drawer.tsx  # Mobile drawer
│   └── nav-item.tsx           # Individual nav button
```

### 1.3 New Files

```ts
// app/layout.tsx modification
// Wrap children with AppShell component

// components/layout/app-shell.tsx
interface AppShellProps {
  children: React.ReactNode;
}
```

### 1.4 Playwright Tests

```ts
// tests/navigation.spec.ts
test.describe("Global Navigation", () => {
  test("sidebar renders on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/play");
    await expect(page.getByTestId("nav-sidebar")).toBeVisible();
  });

  test("hamburger menu opens drawer on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/play");
    await page.getByTestId("mobile-menu-trigger").click();
    await expect(page.getByTestId("mobile-drawer")).toBeVisible();
  });

  test("navigation routes work correctly", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-editor").click();
    await expect(page).toHaveURL("/editor");
  });
});
```

---

## Section 2: Play View (Chat Interface)

### 2.1 Requirements

- Maintain existing chat UI from Vercel template
- Add collapsible right context sidebar (320px)
- Context sidebar shows: chat cost statistics (total cost, message count, estimated tokens)
- Toggle button in chat header to open/close context sidebar
- Mobile: context sidebar as offcanvas (slides in from right)
- Context sidebar state persisted in game store

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ [Nav] │        Chat Area        │ Context Sidebar │
│  48px │         flex-1          │     320px      │
└─────────────────────────────────────────────────┘
```

### 2.2 Component Structure

```
app/
├── play/
│   ├── page.tsx
│   ├── [id]/page.tsx
│   └── layout.tsx
components/
├── play/
│   ├── context-sidebar.tsx          # Right sidebar wrapper
│   ├── context-sidebar-toggle.tsx   # Toggle button component
│   ├── cost-stats.tsx               # Cost statistics display
│   └── play-chat.tsx                # Chat wrapper with context sidebar
```

### 2.3 Playwright Tests

```ts
// tests/play-view.spec.ts
test.describe("Play View", () => {
  test("chat input is functional", async ({ page }) => {
    await page.goto("/play");
    const input = page.getByTestId("chat-input");
    await input.fill("I walk into the tavern");
    await input.press("Enter");
    await expect(page.getByTestId("message-list")).toContainText("tavern");
  });

  test("context sidebar toggles on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/play");
    await page.getByTestId("context-sidebar-toggle-button").click();
    await expect(page.getByTestId("context-sidebar")).not.toBeVisible();
  });

  test("context sidebar shows cost stats", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/play");
    await expect(page.getByTestId("context-sidebar")).toBeVisible();
    await expect(page.getByText("Chat Cost")).toBeVisible();
  });
});
```

---

## Section 3: World Editor View

### 3.1 Requirements

**Layout:**
- Two-panel layout: Module Graph (left/center) + Right Panel (right)
- Module Graph: Visual hub-and-spoke diagram
- Right Panel: Tabbed interface with "Prompt Editor" and "Event Log" tabs
- "Narrator" button: Opens prompt editor for narrator module (switches to Prompt Editor tab)
- Mobile: Full-screen graph, right panel as bottom sheet

**Module Graph Visualization:**
- Center: Narrator module (larger, distinct styling)
- Surrounding: Category-grouped modules with connection lines to Narrator
- Categories: Constraint, Meta, Interaction
- Clickable modules to select and show settings

**Module Categories & Default Modules:**
```
Narrator (Hub)
├── Constraint Modules
│   ├── Time
│   ├── Inventory  
│   └── Economics
├── Meta Modules
│   ├── Meta Events
│   └── Nesting
└── Interaction Modules
    └── NPCs
```

**Right Panel Tabs:**
- **Prompt Editor Tab:** Module prompt configuration interface
- **Event Log Tab:** Chronological list of all module communications

**Narrator Button:**
- Located above or within the module graph area
- Clicking it selects the Narrator module and switches to the Prompt Editor tab
- Visually distinct to indicate it's a special action button

### 3.2 Component Structure

```
app/
├── editor/
│   ├── page.tsx
│   └── layout.tsx
components/
├── editor/
│   ├── module-graph.tsx           # Hub-and-spoke visualization
│   ├── module-node.tsx            # Individual module button
│   ├── module-connection.tsx      # SVG connection lines
│   ├── narrator-button.tsx        # Button to open narrator prompt editor
│   ├── right-panel.tsx            # Right panel container with tabs
│   ├── right-panel-tabs.tsx       # Tab switcher (Prompt Editor / Event Log)
│   ├── prompt-editor-tab.tsx      # Prompt editor content (placeholder for now)
│   ├── event-log-tab.tsx          # Event log content
│   ├── settings/
│   │   ├── narrator-settings.tsx
│   │   ├── time-settings.tsx
│   │   ├── inventory-settings.tsx
│   │   ├── economics-settings.tsx
│   │   ├── meta-events-settings.tsx
│   │   ├── nesting-settings.tsx
│   │   └── npc-settings.tsx
│   └── module-settings-sheet.tsx  # Mobile bottom sheet
```

### 3.3 Module Graph Design

```tsx
// components/editor/module-graph.tsx
interface ModuleGraphProps {
  selectedModule: string | null;
  onSelectModule: (moduleId: string) => void;
}

// Visual layout (CSS Grid or absolute positioning)
// Center: Narrator
// Ring around center: Other modules positioned by category
```

### 3.4 Right Panel Design

```tsx
// components/editor/right-panel.tsx
interface RightPanelProps {
  activeTab: "prompt-editor" | "event-log";
  selectedModule: ModuleId | null;
  onTabChange: (tab: "prompt-editor" | "event-log") => void;
}

// Layout:
// ┌─────────────────────────────┐
// │ [Prompt Editor] [Event Log] │  <- Tabs
// ├─────────────────────────────┤
// │                             │
// │   Tab Content Area          │
// │   (Prompt Editor or Log)    │
// │                             │
// └─────────────────────────────┘
```

**Prompt Editor Tab (Placeholder):**
- Shows placeholder content: "Prompt Editor for [Module Name]"
- Will be replaced with full prompt configuration UI in future implementation
- Displays selected module name

**Event Log Tab:**
- Full event log interface (see Section 4 for details)
- Filterable, searchable, expandable entries
- Timeline scrubber

### 3.5 Narrator Button

```tsx
// components/editor/narrator-button.tsx
interface NarratorButtonProps {
  onOpenPromptEditor: () => void;
}

// Button that:
// 1. Selects "narrator" module
// 2. Switches right panel to "prompt-editor" tab
// 3. Can be positioned above module graph or as part of graph UI
```

**Styling Requirements:**
- Narrator: `bg-primary`, larger size (80x80px)
- Constraint modules: `bg-amber-500/20 border-amber-500`
- Meta modules: `bg-purple-500/20 border-purple-500`
- Interaction modules: `bg-green-500/20 border-green-500`
- Connection lines: SVG paths with category-matching colors
- Selected state: Ring highlight + scale animation

### 3.6 Playwright Tests

```ts
// tests/editor.spec.ts
test.describe("World Editor", () => {
  test("module graph renders all modules", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.getByTestId("module-narrator")).toBeVisible();
    await expect(page.getByTestId("module-time")).toBeVisible();
    await expect(page.getByTestId("module-inventory")).toBeVisible();
    await expect(page.getByTestId("module-economics")).toBeVisible();
    await expect(page.getByTestId("module-meta-events")).toBeVisible();
    await expect(page.getByTestId("module-nesting")).toBeVisible();
    await expect(page.getByTestId("module-npcs")).toBeVisible();
  });

  test("clicking module opens right panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/editor");
    await page.getByTestId("module-time").click();
    await expect(page.getByTestId("right-panel")).toBeVisible();
    await expect(page.getByTestId("prompt-editor-tab")).toBeVisible();
    await expect(page.getByTestId("prompt-editor-tab")).toContainText("Time");
  });

  test("mobile: module tap opens bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/editor");
    await page.getByTestId("module-inventory").click();
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
  });

  test("connection lines visible between modules", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.locator("svg.module-connections")).toBeVisible();
  });
});
```

---

## Section 4: Event Log Tab (Integrated in World Editor)

### 4.1 Requirements

**Features:**
- Chronological list of all module communications
- Filterable by module, message type, time range
- Expandable entries showing full payload
- Search functionality
- Timeline scrubber for quick navigation

**Entry Types:**
- Player Input
- Module → Narrator
- Narrator → LLM
- LLM Response
- Module State Changes

**Layout (within right panel tab):**
```
┌──────────────────────────────────────────────────┐
│ [Filters Bar]                      [Search]      │
├──────────────────────────────────────────────────┤
│ Timeline Scrubber                                │
├──────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ │
│ │ Event Entry (collapsible)                    │ │
│ │ [12:34:05] [Time Module → Narrator]          │ │
│ │ "Advanced time by 2 hours..."                │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ Event Entry                                  │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 4.2 Component Structure

```
components/
├── editor/
│   ├── event-log-tab.tsx          # Event log tab content
│   └── log/                       # Event log components (moved from separate route)
│       ├── log-filters.tsx
│       ├── log-search.tsx
│       ├── log-timeline.tsx
│       ├── log-entry.tsx
│       ├── log-entry-detail.tsx
│       └── log-list.tsx
```

### 4.3 Data Types

```ts
// lib/types/log.ts
interface LogEntry {
  id: string;
  timestamp: Date;
  source: ModuleId | "player" | "narrator" | "llm";
  target: ModuleId | "narrator" | "llm";
  type: "input" | "constraint" | "event" | "response" | "state-change";
  summary: string;
  payload: Record<string, unknown>;
  gameTime?: string; // In-game timestamp
}

type ModuleId =
  | "narrator"
  | "time"
  | "inventory"
  | "economics"
  | "meta-events"
  | "nesting"
  | "npcs";
```

---

## Section 5: Prompt Editor Tab (Integrated in World Editor)

### 5.1 Requirements

**Current Implementation (Placeholder):**
- Shows placeholder content indicating which module's prompt editor is open
- Displays: "Prompt Editor for [Module Name]"
- Will be replaced with full prompt configuration UI in future implementation

**Future Implementation (Not Yet):**
- Core Principle: No code editing—all prompt modifications via UI controls
- Control Types: Sliders, Dropdowns, Toggles, Tag inputs, Text areas
- Per-module prompt settings (see original Section 5.1 for details)

### 5.2 Component Structure

```
components/
├── editor/
│   ├── prompt-editor-tab.tsx      # Prompt editor tab content (placeholder)
│   └── prompts/                   # Future prompt components (not yet implemented)
│       ├── prompt-editor.tsx
│       ├── controls/
│       │   ├── prompt-slider.tsx
│       │   ├── prompt-dropdown.tsx
│       │   ├── prompt-toggle.tsx
│       │   ├── prompt-tags.tsx
│       │   └── prompt-textarea.tsx
│       ├── prompt-preview.tsx
│       └── prompt-reset-button.tsx
```

---

## Section 6: State Management

### 6.1 Requirements

**Global State (Zustand recommended):**
```ts
// lib/stores/game-store.ts
interface GameStore {
  // Navigation
  sidebarExpanded: boolean;
  contextPaneOpen: boolean;

  // Editor
  selectedModule: ModuleId | null;
  rightPanelTab: "prompt-editor" | "event-log";

  // Module Settings
  moduleSettings: Record<ModuleId, ModuleSettings>;

  // Log
  logFilters: LogFilters;

  // Actions
  selectModule: (id: ModuleId | null) => void;
  setRightPanelTab: (tab: "prompt-editor" | "event-log") => void;
  openNarratorPromptEditor: () => void; // Sets module to narrator and switches to prompt editor tab
  updateModuleSettings: (id: ModuleId, settings: Partial<ModuleSettings>) => void;
}
```

### 6.2 Persistence

- Module settings: localStorage + optional server sync
- Log entries: Server-side PostgreSQL (per existing template)
- UI state (sidebar, filters): localStorage only

---

## Section 7: Responsive Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 768px | Drawer nav, sheet panels, stacked layouts |
| Tablet | 768-1024px | Collapsible sidebar, overlay panels |
| Desktop | > 1024px | Full sidebar, side-by-side panels |

---

## Section 8: Accessibility Requirements

- All interactive elements keyboard accessible
- ARIA labels on icon-only buttons
- Focus trapping in modals/sheets
- Color contrast WCAG AA minimum
- Screen reader announcements for view changes

### Playwright A11y Tests

```ts
// tests/accessibility.spec.ts
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("editor view has no critical violations", async ({ page }) => {
    await page.goto("/editor");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toEqual(
      []
    );
  });

  test("editor is keyboard navigable", async ({ page }) => {
    await page.goto("/editor");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("module-narrator")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("right-panel")).toBeVisible();
    await expect(page.getByTestId("prompt-editor-tab")).toBeVisible();
  });
});
```

---

## Implementation Order

1. **Section 1:** Global Navigation Shell (World Editor only)
2. **Section 3:** World Editor View
   - Module graph
   - Right panel with tabs
   - Narrator button
   - Prompt editor tab (placeholder)
   - Event log tab
3. **Section 4:** Event Log Tab (integrated in editor)
4. **Section 5:** Prompt Editor Tab (placeholder first, full implementation later)
5. **Section 6:** State Management integration

Note: Section 2 (Play View) can be implemented separately if needed for the main chat interface.

---

## Dependencies to Add

```bash
pnpm add zustand @radix-ui/react-collapsible @radix-ui/react-slider
pnpm add -D @axe-core/playwright
```

---