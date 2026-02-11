# figma-swift-mcp

An MCP server that fetches Figma designs and returns a **slim, SwiftUI-optimized component tree** — stripping out all the raw JSON noise so your AI assistant only sees what it needs to generate idiomatic SwiftUI code.

## Why?

The standard Figma MCP returns massive React/Tailwind code (~45K+ chars) that pollutes the AI's context window and produces worse SwiftUI output. This server:

1. Calls the Figma REST API directly
2. Parses the raw node tree server-side
3. Returns a compressed component tree (~3K chars) with:
   - Component hierarchy & types
   - Layout properties (spacing, padding, radii)
   - SF Symbol mappings
   - Design tokens (colors, typography, spacing)
   - SwiftUI type hints (GlassButton, Toggle, Sheet, etc.)

**~93% context reduction.** The AI never sees the raw data.

## Tools

| Tool | Description |
|------|-------------|
| `get_swift_tree` | Fetch a node → returns slim SwiftUI component tree |
| `get_design_tokens` | Fetch design tokens (colors, spacing, type) |
| `get_screenshot_url` | Get a rendered PNG URL for visual reference |

## Setup

### 1. Generate a Figma Token

Go to **Figma → Settings → Account → Personal Access Tokens** and create a token.

### 2. Install

```bash
git clone <this-repo>
cd figma-swift-mcp
npm install
npm run build
```

### 3. Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "figma-swift": {
      "command": "node",
      "args": ["/absolute/path/to/figma-swift-mcp/build/index.js"],
      "env": {
        "FIGMA_TOKEN": "your-figma-personal-access-token"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The `figma-swift` tools should now appear in your MCP tools list.

## Usage

In Claude, you can say:

> "Fetch the Figma design at figma.com/design/Wi3zPekZ6ecpQTqLgcq4Xi/HornScore?node-id=2217:48104 and generate SwiftUI"

Claude will:
1. Call `get_swift_tree` with the file key and node ID
2. Receive the slim component tree (not the raw Figma data)
3. Generate clean SwiftUI code using native APIs

## Example Output

```json
{
  "screen": "Create Post - Visibility",
  "nodeId": "2217:48104",
  "width": 440,
  "height": 956,
  "components": [
    {
      "name": "Top Toolbar",
      "type": "Toolbar",
      "children": [
        { "name": "Back", "type": "GlassButton", "icon": "chevron.left" },
        { "name": "Title", "type": "Text", "content": "Create Post" },
        { "name": "Help", "type": "GlassButton", "icon": "questionmark" }
      ]
    },
    {
      "name": "Photo Container",
      "type": "Container",
      "cornerRadius": 22,
      "aspectRatio": "408:368"
    }
  ],
  "tokens": {
    "Brand/Primary": "#be845d",
    "Backgrounds (Grouped)/Primary": "#f2f2f7"
  }
}
```

## Claude Code Skill

The `figma-to-swiftui/` folder contains a Claude Code skill. To install it, zip the folder and add it to Claude Code:

```bash
zip -r figma-to-swiftui.zip figma-to-swiftui/
```

Then add the `.zip` file as a skill in Claude Code.

## Testing

Use the MCP Inspector to test locally:

```bash
npm run inspector
```

## Extending

The parser in `src/figma-parser.ts` handles:
- **Component type detection** — maps Figma layer names to SwiftUI types
- **SF Symbol mapping** — converts Unicode SF Symbol chars to named symbols
- **Noise filtering** — skips blur, mask, shadow, and decorative layers
- **Tree flattening** — collapses single-child wrapper nodes

To add new component types or improve mappings, edit the `detectComponentType()` and `SF_SYMBOL_MAP` in `figma-parser.ts`.
