---
name: figma-to-swiftui
description: Convert Figma designs to production-quality iOS 26 SwiftUI code using the figma-swift MCP server. Use when the user provides a Figma URL, node ID, or asks to convert a design to SwiftUI. Produces idiomatic Swift code with native Liquid Glass APIs, SF Symbols, and proper iOS 26 patterns. Requires the figma-swift MCP tools (get_swift_tree, get_design_tokens, get_screenshot_url).
---

# Figma to SwiftUI Conversion Skill

Convert Figma designs into production-quality, idiomatic iOS 26 SwiftUI code.

## When to Use

- User shares a Figma URL or node ID and wants SwiftUI code
- User says "convert this design", "build this screen", "implement this Figma"
- User references a specific Figma frame/component for Swift implementation

## Tools

This skill uses TWO MCP servers together:

| Tool | Server | Purpose |
|------|--------|---------|
| `figma-swift:get_swift_tree` | Custom MCP | Compressed component tree — structural input. Raw Figma JSON is parsed server-side and never enters context. |
| `Figma:get_screenshot` | Figma MCP | Visual screenshot of the node — use for cross-referencing layout, colors, visual hierarchy |
| `Figma:get_variable_defs` | Figma MCP | Design tokens (colors, spacing, typography, radii) as variable definitions |

## Workflow

### Step 1: Gather Inputs

Call ALL THREE tools before writing any code:

```
figma-swift:get_swift_tree(fileKey, nodeId)   → compressed tree (JSON)
Figma:get_screenshot(nodeId)                   → visual reference (image)
Figma:get_variable_defs(nodeId)                → design tokens (variables)
```

If tokens come back empty, fall back to `fill` hex values from the tree.

Extract `fileKey` and `nodeId` from Figma URLs:
- `figma.com/design/<fileKey>/<name>?node-id=<nodeId>`
- Node IDs use colon format: `2217:48104` (not dash format)

### Step 2: Read the Tree

The slim tree has already been stripped of decorative noise (blur, mask, shadow,
glass effect layers, status bars, scroll indicators). What remains is meaningful structure.

**Node types:**

| Tree Type | SwiftUI Mapping |
|-----------|----------------|
| `HStack` | `HStack(spacing:)` |
| `VStack` | `VStack(spacing:)` |
| `Text` | `Text()` with font/color |
| `Icon` | `Image(systemName:)` -- the `icon` field is already an SF Symbol name |
| `Image` | `AsyncImage` or placeholder with dimensions |
| `Component` | Named Figma component -- infer SwiftUI type from name + children |
| `Frame` | Generic container -- map to appropriate SwiftUI container |
| `Shape` | Vector/boolean -- use `Path` or system shape |

**Fields:**

| Field | Meaning |
|-------|---------|
| `name` | Figma layer name -- use for semantic understanding |
| `content` | Text string content |
| `icon` | SF Symbol name (already resolved from Unicode) |
| `fill` | Hex color (only present when non-default) |
| `cornerRadius` | Only present when 1-99 (real visible radius) |
| `spacing` | Stack spacing in points |
| `padding` | Edge insets `{ top, right, bottom, left }` |
| `opacity` | Only present when < 1 |
| `children` | Nested child nodes |

### Step 3: Interpret Component Patterns

The tree preserves Figma layer names. Use names to infer component semantics:

**"Button - Liquid Glass - Symbol"** -- Glass button with SF Symbol icon
```swift
// In toolbars: no glass modifiers, system handles it
// Outside toolbars: use .buttonStyle(.glass)
Button(action: { }) {
    Image(systemName: node.icon)
}
.buttonStyle(.glass)
```

**"Button - Liquid Glass - Text"** -- Glass button with text label
```swift
// Secondary action:
Button(action: { }) {
    Text(node.content)
}
.buttonStyle(.glass)

// Primary action (e.g. Share, Submit):
Button(action: { }) {
    Text(node.content)
}
.buttonStyle(.glassProminent)
.tint(.brandPrimary)
```

**Glass button style rules:**
- If it's a `Button`, ALWAYS use `.buttonStyle(.glass)` or `.buttonStyle(.glassProminent)`
- `.glass` = secondary / default glass buttons
- `.glassProminent` = primary action buttons (share, submit, done)
- Manual `.glassEffect()` is ONLY for non-button elements (decorative glass icons, containers)
- ALWAYS default to `.interactive()` on manual `.glassEffect()` — better to opt in than out

**"Row"** with icon + title + trailing -- List row
```swift
HStack {
    Image(systemName: icon).foregroundStyle(.secondary)
    Text(title)
    Spacer()
    // trailing: detail text, chevron, toggle, or badge
}
```

**"Checkbox"** with Glass Icon + labels + indicator -- Selection option
```swift
Button(action: { selection = option }) {
    HStack(spacing: 10) {
        Image(systemName: option.icon)
            .foregroundStyle(selection == option ? .brandPrimary : .secondary)
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 2) {
            Text(option.title).font(.body.weight(.semibold))
            Text(option.subtitle).font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
        }
        Spacer()
        // Selection indicator — wrap in Group with consistent frame
        Group {
            if selection == option {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.brandPrimary)
            } else {
                Circle()
                    .stroke(.tertiary, lineWidth: 1.5)
                    .frame(width: 22, height: 22)
            }
        }
        .frame(width: 22, height: 22)
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
}
.buttonStyle(.plain)
```

**Checkbox pattern rules:**
- `.buttonStyle(.plain)` — prevents system press highlight over custom visual states
- `.contentShape(Rectangle())` — ensures full row is tappable
- `Group { }.frame()` on conditional indicators — prevents layout shift on state change
- `.multilineTextAlignment(.leading)` + `.lineLimit(nil)` + `.fixedSize(horizontal: false, vertical: true)` on subtitle text in sheets

**"Toolbar" / "Top Toolbar"** -- Navigation bar area

CRITICAL: Distinguish between system-provided and custom elements.

**On a NavigationStack screen:**
- A back chevron (chevron.left) is the SYSTEM back button — do NOT create a custom glass button. The view should be inside a `NavigationStack` and the back button comes free.
- The screen title goes in `.navigationTitle()` or `.toolbar { ToolbarItem(placement: .principal) }`.
- Only trailing buttons (help, settings, etc.) are custom toolbar items in `.topBarTrailing`.

```swift
// The view is pushed onto a NavigationStack — back button is automatic
.navigationTitle("Create Post")
.navigationBarTitleDisplayMode(.inline)
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        Button(action: { }) {
            Image(systemName: "questionmark")
                .font(.system(size: 17, weight: .semibold))
        }
    }
}
```

**On a sheet/modal:**
- There is no system back button — use `.toolbar` with custom leading/trailing items.
- The title goes in `.principal` placement.
- Use `.confirmationAction` placement for the primary action button.

```swift
.toolbar {
    ToolbarItem(placement: .topBarLeading) {
        Button(action: { dismiss() }) {
            Image(systemName: "xmark")
                .font(.system(size: 17, weight: .semibold))
        }
    }
    ToolbarItem(placement: .principal) {
        Text("Visibility")
            .font(.title3)
            .fontWeight(.semibold)
    }
    ToolbarItem(placement: .confirmationAction) {
        Button(role: .confirm, action: { dismiss() }) {
            Text("Done")
        }
        .buttonStyle(.borderedProminent)
        .tint(.brandPrimary)
    }
}
```

**CRITICAL — Toolbar button rules:**
- **NEVER apply `.glassEffect()` to toolbar buttons.** The system toolbar automatically
  applies glass treatment. Adding `.glassEffect()` creates a double-wrapper artifact.
- **NEVER apply `.frame(width: 44, height: 44)` to toolbar buttons.** The toolbar handles sizing.
- **NEVER apply `.padding()` or `.font()` to toolbar button content.** The system owns
  padding and font treatment for toolbar items. Just provide the label content.
- For icon buttons: just use `Button { Image(systemName:) }` — no extra modifiers.
- For primary action buttons: use `.buttonStyle(.borderedProminent)` + `.tint()` for the
  filled pill look. NOT manual `.glassEffect().tint()`.
- For confirmation actions: use `placement: .confirmationAction` with `role: .confirm`.
- `.glassEffect()` is ONLY for custom glass buttons OUTSIDE of toolbars (floating buttons,
  in-content controls, custom navigation that isn't using the toolbar API).

**How to tell the difference from the tree:**
- If the toolbar contains `chevron.left` or `chevron.backward` → it's a pushed NavigationStack view. The back button is system-provided.
- If the toolbar contains `xmark` or `xmark.circle` → it's a modal/sheet with a dismiss button.

**"Sheet"** -- Presented modal. Sheet owns its own NavigationStack internally.
```swift
.sheet(isPresented: $showSheet) {
    SheetContent(/* bindings */)
        .presentationDetents([.height(390)])
        .presentationBackground(Color(uiColor: .systemBackground))
}
// Inside SheetContent:
// NavigationStack { content.toolbar { ... } }
```

**Sheet rules:**
- The sheet view struct contains its own `NavigationStack` — don't wrap externally.
- Use `.presentationBackground(Color(uiColor: .systemBackground))` for explicit background.
- Do NOT use `.presentationCornerRadius()` — system handles corner radius.
- Use specific `.height()` detents when the content has a known size.
- **Sheet bottom padding:** Figma mockups don't model the iOS home indicator safe area.
  Sheet bottom padding from Figma may not translate directly — you may need to add extra
  bottom padding (roughly double the designed value) to account for the safe area.
  This is a known Figma→iOS gap that requires manual adjustment.

**"Metadata"** with cornerRadius -- Grouped list section
```swift
VStack(spacing: 0) {
    // rows with Divider() between them
}
.padding(.horizontal, 16)
.background(.background.secondary)
.clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
```

### Step 4: Generate SwiftUI Code

#### Liquid Glass (iOS 26) -- CRITICAL

**NEVER use `.ultraThinMaterial` as a substitute for glass.**

**For Buttons — use button styles:**
```swift
// Secondary glass button (default)
Button(action: { }) {
    Image(systemName: "plus")
}
.buttonStyle(.glass)

// Primary action glass button (share, submit, save)
Button(action: { }) {
    Text("Share")
}
.buttonStyle(.glassProminent)
.tint(.brandPrimary)

// Bottom bar action
.toolbar {
    ToolbarItem(placement: .bottomBar) {
        Button(action: { }) {
            Text("Share")
        }
        .buttonStyle(.glassProminent)
        .tint(.brandPrimary)
        .frame(maxWidth: .infinity)
    }
}
```

**For non-button elements — use `.glassEffect()` modifier:**
```swift
// Decorative glass icon (not a button, e.g. selection row icon)
Image(systemName: "globe")
    .frame(width: 44, height: 44)
    .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 12))

// Grouped glass elements that morph together
GlassEffectContainer {
    HStack(spacing: 12) { /* glass elements */ }
}
```

**Glass rules:**
- If it's a `Button` → `.buttonStyle(.glass)` or `.buttonStyle(.glassProminent)`
- If it's NOT a button → `.glassEffect()` modifier directly
- ALWAYS default to `.interactive()` on `.glassEffect()` — better to opt in than out
- `.tint()` ONLY for semantic meaning (primary action, state), never decoration
- `GlassEffectContainer` when multiple glass elements sit adjacent
- Glass cannot sample other glass — use `GlassEffectContainer` to group
- In toolbars: NO glass modifiers at all, system handles it automatically

#### SF Symbols

The `icon` field is already resolved. Use directly:
```swift
Image(systemName: node.icon)
```

#### Colors -- USE SWIFTUI SEMANTICS

**ALWAYS prefer SwiftUI semantic colors over hardcoded hex values.** iOS automatically
handles dark mode, vibrancy on glass surfaces, and accessibility adjustments.

The design tokens from Figma give you *resolved* hex values, but those are just what
the system semantic colors compute to on a light background. Map them back:

| Figma Token / Fill | SwiftUI Semantic |
|-------------------|-----------------|
| `#000000`, `Labels/Primary` | `.primary` |
| `#3c3c43` (60% opacity), `Labels/Secondary` | `.secondary` |
| `#3c3c43` (30% opacity), `Labels/Tertiary` | `.tertiary` |
| `#999999`, `Labels - Vibrant/Secondary` | `.secondary` (on glass, system handles vibrancy) |
| `#f2f2f7`, `Backgrounds (Grouped)/Primary` | `Color(.systemGroupedBackground)` |
| `#ffffff`, `Backgrounds (Grouped)/Secondary` | `.background.secondary` or `Color(.secondarySystemGroupedBackground)` |
| `#8e8e93`, `Grays/Gray` | `.gray` |
| `#c6c6c8`, `Separators/Opaque` | `Color(.opaqueSeparator)` |
| `#e6e6e6`, `Separators/Vibrant` | `Color(.separator)` |
| `#34c759`, `Accents/Green` | `.green` |
| `fill: "#ffffff"` on tinted glass button | `.white` (text on tinted glass) |

**Only define custom `Color` extensions for true brand colors** that don't exist in the
system palette. For example: `#BE845D` (Brand/Primary) has no system equivalent.

```swift
// DO THIS — brand color that doesn't exist in system
extension Color {
    static let brandPrimary = Color(red: 190/255, green: 132/255, blue: 93/255)
}

// DON'T DO THIS — these are just system colors with extra indirection
extension Color {
    static let labelSecondary = Color(.sRGB, red: 60/255, ...) // Just use .secondary
    static let groupedBg = Color(hex: 0xF2F2F7)               // Just use Color(.systemGroupedBackground)
}
```

**Why this matters:** On glass surfaces, iOS 26 automatically adjusts vibrancy.
Hardcoded hex colors won't adapt. `.secondary` will.

#### Layout

- `padding` object maps to `.padding(.horizontal, 16)` etc.
- `spacing` maps to stack spacing: `VStack(spacing: 16)`
- `cornerRadius` maps to `.clipShape(RoundedRectangle(cornerRadius: N, style: .continuous))`
- Don't hardcode widths/heights except on images and the root
- Use `Spacer()` for flexible spacing in HStacks

#### Architecture

- One file per screen, split into computed properties for sections
- `@State` for local UI state (sheet presentation, selection, text input)
- `enum` + `CaseIterable` for option sets (visibility, categories)
- Extract repeated patterns into reusable sub-views
- `// MARK: -` sections for organization
- Include `#Preview` block

### Step 5: Cross-Reference Screenshot

After generating code from the tree, compare against the screenshot:

- Is the visual hierarchy correct?
- Are there elements the tree missed?
- Does spacing/density feel right?
- Are glass effects on the right elements?

If the screenshot reveals details the tree doesn't capture (gradients, overlays,
image treatments), add those manually.

## Output Format

Single `.swift` file with:
1. Color extensions for brand/custom colors
2. Main view struct with `@State` properties
3. Body with high-level structure
4. Computed properties for each section
5. Supporting types (enums, sub-views)
6. `#Preview` block

**Naming**: `{ScreenName}View.swift`

## Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| `.ultraThinMaterial` for glass | `.glassEffect()` or `.buttonStyle(.glass)` — native iOS 26 |
| `.glassEffect()` on a Button | Use `.buttonStyle(.glass)` or `.buttonStyle(.glassProminent)` instead |
| Manual `.glassEffect().tint()` for primary action | `.buttonStyle(.glassProminent)` + `.tint()` |
| Hardcoded pixel sizes everywhere | Let SwiftUI layout handle sizing |
| Tree translated 1:1 to nested views | Interpret semantically — a Row is a pattern, not 6 stacks |
| Ignoring the screenshot | Tree = structure, screenshot = visual truth. Use both. |
| `import UIKit` | Pure SwiftUI only |
| Missing `.interactive()` on `.glassEffect()` | Always default to `.interactive()` — opt in, not out |
| Glass on glass without container | `GlassEffectContainer` to group |
| Custom HStack for navigation toolbar | Use `.toolbar { }` with `ToolbarItem` placements |
| Custom glass back button (chevron.left) | System-provided — view should be in a `NavigationStack` |
| Sheet toolbar as HStack | Sheet owns its `NavigationStack` internally, use `.toolbar { }` |
| `.glassEffect()` on toolbar buttons | NEVER — toolbar applies glass automatically. Creates double-wrapper. |
| `.frame()` / `.padding()` / `.font()` on toolbar buttons | NEVER — system owns sizing, padding, and font for toolbar items |
| Manual tint on toolbar action button | `.buttonStyle(.borderedProminent)` + `.tint()` + `placement: .confirmationAction` |
| `NavigationStack` wrapping sheet externally | Sheet view struct contains its own `NavigationStack` |
| `.presentationCornerRadius()` on sheets | Don't — system handles corner radius |
| Bottom-pinned action as `safeAreaInset` | `.toolbar { ToolbarItem(placement: .bottomBar) }` |
| Bare `Button` on custom selection rows | `.buttonStyle(.plain)` + `.contentShape(Rectangle())` |
| Conditional views without consistent frame | Wrap in `Group { }.frame()` to prevent layout shift |
| Missing multiline support in sheets | `.lineLimit(nil)` + `.fixedSize(horizontal: false, vertical: true)` |
| Hardcoded hex for system colors | Use `.primary`, `.secondary`, `.tertiary`, `Color(.systemGroupedBackground)` etc. |
| Custom Color extensions for system colors | Only extend `Color` for true brand colors with no system equivalent |

## Reference

For detailed Liquid Glass API docs, see `references/liquid-glass-api.md`.
