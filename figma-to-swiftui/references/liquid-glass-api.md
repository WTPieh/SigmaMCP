# Liquid Glass API Reference — iOS 26 / SwiftUI

## Core Modifier

```swift
func glassEffect<S: Shape>(
    _ glass: Glass = .regular,
    in shape: S = DefaultGlassEffectShape,
    isEnabled: Bool = true
) -> some View
```

Default shape is `.capsule`. Always add padding before applying.

## Glass Variants

```swift
Glass.regular    // Standard frosted glass — most common
Glass.clear      // Transparent glass with subtle edge
Glass.identity   // No visual effect (for accessibility fallback)
```

## Modifiers on Glass

```swift
.regular.tint(.blue)          // Semantic tint — use ONLY for meaning
.regular.interactive()        // Bounce + shimmer on tap — for ALL tappable elements
.clear.interactive()          // Transparent + interactive
.regular.tint(.orange).interactive()  // Order doesn't matter
```

## Shapes

```swift
.glassEffect(.regular, in: .capsule)                    // Default pill shape
.glassEffect(.regular, in: .circle)                     // Circle (icon buttons)
.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 16))
.glassEffect(.regular, in: .rect(cornerRadius: .containerConcentric))  // Matches parent
.glassEffect(.regular, in: .ellipse)
```

## GlassEffectContainer

Groups glass elements so they merge visually. Glass cannot sample other glass — 
always wrap adjacent glass elements in a container.

```swift
GlassEffectContainer {
    HStack(spacing: 20) {
        Image(systemName: "pencil")
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive())
        Image(systemName: "eraser")
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive())
    }
}

// With custom merge distance
GlassEffectContainer(spacing: 40.0) {
    // Elements within 40pt will morph together
}
```

## Glass Morphing / Transitions

Use `glassEffectID` + `@Namespace` for fluid transitions between glass states:

```swift
@Namespace var ns

// Associate elements for morphing
.glassEffect(.regular.interactive())
.glassEffectID("toolbar-action", in: ns)
```

## Glass Union (Joined Elements)

For elements that should share a single glass surface (like zoom +/- buttons):

```swift
@Namespace var ns

VStack(spacing: 0) {
    Button(action: { }) {
        Image(systemName: "plus")
    }
    .glassEffect(.regular.tint(.white.opacity(0.8)))
    .glassEffectUnion(id: "zoom", namespace: ns)
    
    Divider()
    
    Button(action: { }) {
        Image(systemName: "minus")
    }
    .glassEffect(.regular.tint(.white.opacity(0.8)))
    .glassEffectUnion(id: "zoom", namespace: ns)
}
```

## Button Styles

```swift
// Secondary action
Button("Edit") { }
    .buttonStyle(.glass)

// Primary action
Button("Save") { }
    .buttonStyle(.glassProminent)
```

## Common Patterns

### Navigation Toolbar Button
```swift
Button(action: { dismiss() }) {
    Image(systemName: "chevron.left")
        .font(.system(size: 17, weight: .semibold))
}
.frame(width: 44, height: 44)
.glassEffect(.regular.interactive(), in: .circle)
```

### Primary Action Button (Tinted Glass)
```swift
Button(action: { }) {
    Text("Done")
        .font(.system(size: 17, weight: .medium))
        .padding(.horizontal, 20)
}
.glassEffect(.regular.interactive().tint(.accentColor), in: .capsule)
```

### Icon Badge / Glass Icon
```swift
Image(systemName: "globe")
    .font(.system(size: 20))
    .frame(width: 44, height: 44)
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 12))
```

### Grouped Toolbar Buttons
```swift
GlassEffectContainer {
    HStack(spacing: 12) {
        ForEach(actions) { action in
            Button(action: action.handler) {
                Image(systemName: action.icon)
            }
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive(), in: .circle)
        }
    }
}
```

## Text on Glass

Text within a glass effect automatically gets vibrant treatment — color, brightness, 
and saturation adapt to the background. Use `.foregroundStyle(.white)` for high contrast 
on tinted glass elements.

## Corner Concentricity

For nested rounded rectangles that align corners with their container:
```swift
RoundedRectangle(cornerRadius: .containerConcentric, style: .continuous)
```

## Accessibility

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency

// System handles it automatically — only override if necessary
.glassEffect(reduceTransparency ? .identity : .regular)
```

iOS 26.1+ includes Tinted Mode: users can control glass opacity in 
Settings → Display & Brightness → Liquid Glass. Respect this automatically.

## UIKit Equivalent

```swift
if #available(iOS 26.0, *) {
    let effect = UIGlassEffect()
    let effectView = UIVisualEffectView(effect: effect)
    // Container equivalent:
    let containerEffect = UIGlassContainerEffect()
    containerEffect.spacing = 12
}
```

## Key Rules

1. **`.interactive()` on all tappable glass elements** — enables bounce and shimmer
2. **`GlassEffectContainer` for adjacent glass** — glass can't sample other glass
3. **`.tint()` only for semantic meaning** — not decoration
4. **Don't put custom backgrounds behind toolbars** — breaks scroll edge effect
5. **Let system handle accessibility** — don't override reduce transparency unless needed
6. **Remove `.ultraThinMaterial` / `.thinMaterial` usage** — use `.glassEffect()` instead
7. **Add padding before `.glassEffect()`** — the modifier reads better with padding
8. **`.capsule` is default shape** — only specify shape when you want something different
