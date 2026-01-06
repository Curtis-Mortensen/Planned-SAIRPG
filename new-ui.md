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
| MessageSquare | Play | `/play` | Main chat interface |
| Settings2 | World Editor | `/editor` | Behind-the-scenes module config |
| ScrollText | Event Log | `/log` | Full message history |
| Sliders | Prompts | `/prompts` | LLM prompt configuration |

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
    await page.goto("/play");
    await page.getByTestId("nav-editor").click();
    await expect(page).toHaveURL("/editor");
  });
});
```

---

## Section 2: Play View (Chat Interface)

### 2.1 Requirements

- Maintain existing chat UI from Vercel template
- Add collapsible right context pane (320px)
- Context pane shows: current scene summary, active modules, quick stats
- Mobile: context pane as bottom sheet

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ [Nav] │        Chat Area        │ Context Pane │
│  48px │         flex-1          │    320px     │
└─────────────────────────────────────────────────┘
```

### 2.2 Component Structure

```
app/
├── play/
│   ├── page.tsx
│   └── layout.tsx
components/
├── play/
│   ├── context-pane.tsx
│   ├── context-pane-mobile.tsx
│   └── scene-summary.tsx
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

  test("context pane toggles on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/play");
    await page.getByTestId("toggle-context-pane").click();
    await expect(page.getByTestId("context-pane")).not.toBeVisible();
  });

  test("context pane opens as sheet on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/play");
    await page.getByTestId("mobile-context-trigger").click();
    await expect(page.getByTestId("context-sheet")).toBeVisible();
  });
});
```

---

## Section 3: World Editor View

### 3.1 Requirements

**Layout:**
- Two-panel layout: Module Graph (left/center) + Settings Panel (right)
- Module Graph: Visual hub-and-spoke diagram
- Settings Panel: Configuration for selected module
- Mobile: Full-screen graph, settings as bottom sheet on module tap

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
│   ├── module-settings-panel.tsx  # Right panel container
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

**Styling Requirements:**
- Narrator: `bg-primary`, larger size (80x80px)
- Constraint modules: `bg-amber-500/20 border-amber-500`
- Meta modules: `bg-purple-500/20 border-purple-500`
- Interaction modules: `bg-green-500/20 border-green-500`
- Connection lines: SVG paths with category-matching colors
- Selected state: Ring highlight + scale animation

### 3.4 Playwright Tests

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

  test("clicking module opens settings panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/editor");
    await page.getByTestId("module-time").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible();
    await expect(page.getByTestId("settings-panel")).toContainText("Time");
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

## Section 4: Event Log View

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

**Layout:**
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
app/
├── log/
│   ├── page.tsx
│   └── layout.tsx
components/
├── log/
│   ├── log-filters.tsx
│   ├── log-search.tsx
│   ├── log-timeline.tsx
│   ├── log-entry.tsx
│   ├── log-entry-detail.tsx
│   └── log-list.tsx
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

### 4.4 Playwright Tests

```ts
// tests/event-log.spec.ts
test.describe("Event Log", () => {
  test("log entries render chronologically", async ({ page }) => {
    await page.goto("/log");
    const entries = page.getByTestId("log-entry");
    await expect(entries.first()).toBeVisible();
  });

  test("filter by module works", async ({ page }) => {
    await page.goto("/log");
    await page.getByTestId("filter-module").click();
    await page.getByRole("option", { name: "Time" }).click();
    const entries = page.getByTestId("log-entry");
    for (const entry of await entries.all()) {
      await expect(entry).toContainText("Time");
    }
  });

  test("search filters entries", async ({ page }) => {
    await page.goto("/log");
    await page.getByTestId("log-search").fill("inventory");
    await expect(page.getByTestId("log-entry")).toContainText("inventory");
  });

  test("entry expands to show full payload", async ({ page }) => {
    await page.goto("/log");
    await page.getByTestId("log-entry").first().click();
    await expect(page.getByTestId("log-entry-detail")).toBeVisible();
  });

  test("timeline scrubber navigates to time", async ({ page }) => {
    await page.goto("/log");
    const scrubber = page.getByTestId("timeline-scrubber");
    await scrubber.click({ position: { x: 100, y: 10 } });
    // Verify scroll position changed
  });
});
```

---

## Section 5: Prompt Configuration View

### 5.1 Requirements

**Core Principle:** No code editing—all prompt modifications via UI controls

**Control Types:**
- **Sliders:** Numeric values (creativity, verbosity, detail level)
- **Dropdowns:** Preset selections (tone, style, genre)
- **Toggles:** Boolean flags (include/exclude features)
- **Tag inputs:** Lists (themes, forbidden topics)
- **Text areas:** For specific phrases/instructions (limited, guided)

**Per-Module Prompt Settings:**

| Module | Controls |
|--------|----------|
| Narrator | Tone (dropdown), Verbosity (slider 1-5), POV (dropdown), Include sensory details (toggle), Themes (tags) |
| Time | Time passage rate (slider), Date format (dropdown), Announce time changes (toggle) |
| Inventory | Detail level (slider), Track quantities (toggle), Item categories (tags) |
| Economics | Currency name (text), Price volatility (slider), Show exact prices (toggle) |
| NPCs | Personality depth (slider), Memory length (slider), Dialect options (dropdown) |
| Meta Events | Event frequency (slider), Severity range (slider), Event types (tags) |

### 5.2 Component Structure

```
app/
├── prompts/
│   ├── page.tsx
│   └── layout.tsx
components/
├── prompts/
│   ├── prompt-module-list.tsx
│   ├── prompt-editor.tsx
│   ├── controls/
│   │   ├── prompt-slider.tsx
│   │   ├── prompt-dropdown.tsx
│   │   ├── prompt-toggle.tsx
│   │   ├── prompt-tags.tsx
│   │   └── prompt-textarea.tsx
│   ├── prompt-preview.tsx         # Shows generated prompt
│   └── prompt-reset-button.tsx
```

### 5.3 Prompt Preview

Each settings page should include a read-only preview showing the actual prompt text that will be sent to the LLM, updated live as controls change.

```tsx
// components/prompts/prompt-preview.tsx
interface PromptPreviewProps {
  moduleId: ModuleId;
  settings: ModuleSettings;
}
// Renders the interpolated prompt template
```

### 5.4 Playwright Tests

```ts
// tests/prompts.spec.ts
test.describe("Prompt Configuration", () => {
  test("module list shows all configurable modules", async ({ page }) => {
    await page.goto("/prompts");
    await expect(page.getByTestId("prompt-module-narrator")).toBeVisible();
    await expect(page.getByTestId("prompt-module-time")).toBeVisible();
  });

  test("slider changes update preview", async ({ page }) => {
    await page.goto("/prompts");
    await page.getByTestId("prompt-module-narrator").click();
    const slider = page.getByTestId("slider-verbosity");
    const preview = page.getByTestId("prompt-preview");

    const initialText = await preview.textContent();
    await slider.fill("5");
    const updatedText = await preview.textContent();

    expect(initialText).not.toEqual(updatedText);
  });

  test("dropdown selection persists", async ({ page }) => {
    await page.goto("/prompts");
    await page.getByTestId("prompt-module-narrator").click();
    await page.getByTestId("dropdown-tone").click();
    await page.getByRole("option", { name: "Humorous" }).click();

    await page.reload();
    await page.getByTestId("prompt-module-narrator").click();
    await expect(page.getByTestId("dropdown-tone")).toContainText("Humorous");
  });

  test("tag input adds and removes tags", async ({ page }) => {
    await page.goto("/prompts");
    await page.getByTestId("prompt-module-narrator").click();
    const tagInput = page.getByTestId("tags-themes");

    await tagInput.getByRole("textbox").fill("mystery");
    await tagInput.getByRole("textbox").press("Enter");
    await expect(tagInput.getByText("mystery")).toBeVisible();

    await tagInput.getByText("mystery").getByRole("button").click();
    await expect(tagInput.getByText("mystery")).not.toBeVisible();
  });

  test("reset button restores defaults", async ({ page }) => {
    await page.goto("/prompts");
    await page.getByTestId("prompt-module-narrator").click();
    await page.getByTestId("slider-verbosity").fill("5");
    await page.getByTestId("reset-button").click();

    await expect(page.getByTestId("slider-verbosity")).toHaveValue("3");
  });
});
```

---

## Section 6: State Management

### 6.1 Requirements

**Global State (Zustand recommended):**
```ts
// lib/stores/game-store.ts
interface GameStore {
  // Navigation
  currentView: "play" | "editor" | "log" | "prompts";
  sidebarExpanded: boolean;
  contextPaneOpen: boolean;

  // Editor
  selectedModule: ModuleId | null;

  // Module Settings
  moduleSettings: Record<ModuleId, ModuleSettings>;

  // Log
  logFilters: LogFilters;

  // Actions
  setView: (view: GameStore["currentView"]) => void;
  selectModule: (id: ModuleId | null) => void;
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
  test("play view has no critical violations", async ({ page }) => {
    await page.goto("/play");
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
    await expect(page.getByTestId("settings-panel")).toBeVisible();
  });
});
```

---

## Implementation Order

1. **Section 1:** Global Navigation Shell
2. **Section 2:** Play View modifications
3. **Section 3:** World Editor View
4. **Section 4:** Event Log View
5. **Section 5:** Prompt Configuration View
6. **Section 6:** State Management integration

Each section can be implemented independently and tested before moving to the next.

---

## Dependencies to Add

```bash
pnpm add zustand @radix-ui/react-collapsible @radix-ui/react-slider
pnpm add -D @axe-core/playwright
```

---