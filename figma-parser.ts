/**
 * figma-parser.ts — Layer 1: Structural Compression
 * 
 * Generic compression that works on ANY Figma file.
 * No name-based pattern matching. Just structural rules:
 * 
 *   1. Skip decorative/system nodes (blur, mask, shadow, status bar, etc.)
 *   2. Flatten single-child wrapper chains
 *   3. Bubble up text/icon content from deep nesting
 *   4. Strip useless metadata (nodeId, componentName)
 *   5. Only keep dimensions on images and root
 *   6. Skip empty leaf nodes
 */

// ─── Output Types ────────────────────────────────────────────

export interface SlimNode {
  name: string;
  type: string;
  content?: string;
  icon?: string;
  fill?: string;
  opacity?: number;
  cornerRadius?: number;
  width?: number;
  height?: number;
  spacing?: number;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  children?: SlimNode[];
  [key: string]: unknown;
}

export interface SlimTree {
  screen: string;
  width: number;
  height: number;
  components: SlimNode[];
  tokens: Record<string, string>;
}

// ─── Figma Node Type ─────────────────────────────────────────

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  characters?: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: Array<{ type: string; color?: { r: number; g: number; b: number; a: number }; opacity?: number }>;
  cornerRadius?: number;
  layoutMode?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  opacity?: number;
  visible?: boolean;
  [key: string]: unknown;
}

// ─── SF Symbol Map ───────────────────────────────────────────

const SF_SYMBOLS: Record<string, string> = {
  "􀆉": "chevron.left", "􀅍": "questionmark", "􀈑": "trash",
  "􀆄": "xmark", "􀆅": "checkmark", "􀆊": "chevron.right",
  "􀜇": "location", "􀛿": "eye", "􀏭": "photo.on.rectangle",
  "􀏰": "photo.on.rectangle", "􀉣": "tag", "􂞷": "trophy",
  "􁃐": "photo.badge.plus", "􀆪": "globe", "􀎠": "lock",
  "􀅴": "info.circle", "􀊫": "heart", "􀊬": "heart.fill",
  "􀈂": "square.and.arrow.up", "􀙧": "person.2", "􀉩": "bookmark",
  "􀍟": "ellipsis", "􀎞": "gear", "􀣘": "camera", "􀏟": "photo",
  "􀅼": "plus", "􀅽": "minus", "􀊃": "magnifyingglass",
  "􀋂": "bell", "􀋃": "bell.fill", "􀌜": "house", "􀌝": "house.fill",
};

// ─── Rule 1: Skip Decorative / System Nodes ──────────────────
// These nodes are either system chrome or purely decorative.
// They never produce meaningful SwiftUI code.

function isDecorative(node: FigmaNode): boolean {
  if (node.visible === false) return true;

  const n = node.name.toLowerCase().trim();

  // System UI — SwiftUI provides these automatically
  if (n === "status bar" || n === "time" || n === "levels") return true;
  if (n === "cellular connection" || n === "wifi") return true;

  // Decorative layers — visual effects handled by modifiers
  if (n === "blur" || n === "mask" || n === "shadow" || n === "tint") return true;
  if (n === "glass effect" || n.startsWith("liquid glass")) return true;
  if (n === "bg" || n === "background") return true;

  // Scroll chrome — SwiftUI handles scroll indicators
  if (n.startsWith("scroll edge effect")) return true;
  if (n.startsWith("scrollbar")) return true;
  if (n === "thumb" || n === "grabber") return true;

  // Structural noise — empty chrome
  if (n === "cap" || n === "capacity" || n === "border") return true;

  // Overlay dimming layers — .sheet() handles this
  if (n === "overlay" && !node.children?.length) return true;

  return false;
}

// ─── Rule 2: Detect if a node is an empty leaf ──────────────
// No text, no icon, no meaningful children → skip it.

function isEmptyLeaf(node: FigmaNode): boolean {
  if (node.type === "TEXT" && node.characters?.trim()) return false;
  if (node.children && node.children.length > 0) return false;
  // Vectors/shapes with fills might be icons, keep them
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return false;
  // Frame/rectangle with no children and no text
  if (node.type === "FRAME" || node.type === "GROUP" || node.type === "RECTANGLE" ||
      node.type === "INSTANCE" || node.type === "COMPONENT") {
    return true;
  }
  return false;
}

// ─── Rule 3: Classify node type for SwiftUI ──────────────────
// Based on Figma node type + layout, not name.

function classifyType(node: FigmaNode): string {
  if (node.type === "TEXT") return "Text";
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return "Shape";

  // Image frames — instances/frames with image fills but no text children
  if (hasImageFill(node) && !hasTextDescendant(node)) return "Image";

  if (node.layoutMode === "HORIZONTAL") return "HStack";
  if (node.layoutMode === "VERTICAL") return "VStack";

  if (node.type === "INSTANCE" || node.type === "COMPONENT") return "Component";
  if (node.type === "FRAME" || node.type === "GROUP") return "Frame";

  return "View";
}

function hasImageFill(node: FigmaNode): boolean {
  if (!node.fills || !Array.isArray(node.fills)) return false;
  return node.fills.some((f) => f.type === "IMAGE");
}

function hasTextDescendant(node: FigmaNode): boolean {
  if (node.type === "TEXT") return true;
  if (node.children) {
    return node.children.some((c) => hasTextDescendant(c));
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────

function rgbaToHex(c: { r: number; g: number; b: number; a: number }): string {
  const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
  let hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  if (c.a < 1) hex += Math.round(c.a * 255).toString(16).padStart(2, "0");
  return hex;
}

function getSolidFill(node: FigmaNode): string | undefined {
  if (!node.fills || !Array.isArray(node.fills)) return undefined;
  const f = node.fills.find((f) => f.type === "SOLID" && f.color);
  return f?.color ? rgbaToHex(f.color) : undefined;
}

function hasMeaningfulPadding(node: FigmaNode): boolean {
  return !!(node.paddingTop || node.paddingRight || node.paddingBottom || node.paddingLeft);
}

function getPadding(node: FigmaNode): SlimNode["padding"] | undefined {
  if (!hasMeaningfulPadding(node)) return undefined;
  const p: NonNullable<SlimNode["padding"]> = {};
  if (node.paddingTop) p.top = node.paddingTop;
  if (node.paddingRight) p.right = node.paddingRight;
  if (node.paddingBottom) p.bottom = node.paddingBottom;
  if (node.paddingLeft) p.left = node.paddingLeft;
  return p;
}

// ─── Core: Recursive Parse with Structural Compression ───────

function parse(node: FigmaNode, depth: number = 0, isRoot: boolean = false): SlimNode | null {
  if (depth > 20) return null;
  if (isDecorative(node)) return null;
  if (isEmptyLeaf(node)) return null;

  // ── Handle text nodes (leaf) ──
  if (node.type === "TEXT" && node.characters) {
    const trimmed = node.characters.trim();
    if (!trimmed) return null;

    // SF Symbol?
    if (SF_SYMBOLS[trimmed]) {
      return { name: node.name, type: "Icon", icon: SF_SYMBOLS[trimmed] };
    }

    const textNode: SlimNode = { name: node.name, type: "Text", content: trimmed };
    const fill = getSolidFill(node);
    if (fill && fill !== "#000000" && fill !== "#000000ff") textNode.fill = fill;
    return textNode;
  }

  // ── Parse children first ──
  let children: SlimNode[] = [];
  if (node.children) {
    for (const child of node.children) {
      const parsed = parse(child, depth + 1);
      if (parsed) children.push(parsed);
    }
  }

  // ── Rule: If all children got filtered, and this node has no content → skip ──
  if (children.length === 0 && node.type !== "TEXT") {
    // Keep image nodes even without children
    if (hasImageFill(node)) {
      const bbox = node.absoluteBoundingBox;
      return {
        name: node.name,
        type: "Image",
        ...(bbox && { width: Math.round(bbox.width), height: Math.round(bbox.height) }),
        ...(node.cornerRadius && { cornerRadius: node.cornerRadius }),
      };
    }
    return null;
  }

  // ── Rule: Single-child flattening ──
  // If this wraps a single child and adds no *visually meaningful* style, unwrap.
  //
  // NOT meaningful on single-child wrappers:
  //   - spacing (only matters between multiple children)
  //   - cornerRadius >= 100 (pill/circle clip, not a visible container)
  //   - black/white fills (defaults, not intentional style)
  //   - padding alone (layout detail, not visible structure)
  if (children.length === 1 && !isRoot) {
    const fill = getSolidFill(node);
    const isDefaultFill = !fill || fill === "#000000" || fill === "#ffffff" ||
      fill === "#000000ff" || fill === "#ffffffff";
    const hasVisibleCorner = node.cornerRadius && node.cornerRadius > 0 && node.cornerRadius < 100;
    const hasOpacity = node.opacity !== undefined && node.opacity < 1;

    if (!(!isDefaultFill || hasVisibleCorner || hasOpacity)) {
      const child = children[0];
      const currentName = node.name.toLowerCase();
      const isGenericName = currentName.startsWith("frame") || currentName === "container" ||
        currentName === "contents" || currentName === "content" ||
        currentName.startsWith("accessories") || currentName.startsWith("_") ||
        currentName === "text" || currentName === "image";

      if (isGenericName) return child;
      // Descriptive name — adopt it onto the child
      return { ...child, name: node.name };
    }
  }

  // ── Build the slim node ──
  const type = classifyType(node);
  const slim: SlimNode = { name: node.name, type };

  // Fill (skip black/white defaults that aren't meaningful)
  const fill = getSolidFill(node);
  if (fill && fill !== "#000000" && fill !== "#ffffff" && fill !== "#000000ff" && fill !== "#ffffffff") {
    slim.fill = fill;
  }

  // Corner radius (only on visible containers)
  if (node.cornerRadius && node.cornerRadius > 0 && node.cornerRadius < 999) {
    slim.cornerRadius = node.cornerRadius;
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    slim.opacity = Math.round(node.opacity * 100) / 100;
  }

  // Layout properties (only on stacks, not on every wrapper)
  if (type === "HStack" || type === "VStack") {
    if (node.itemSpacing) slim.spacing = node.itemSpacing;
    const padding = getPadding(node);
    if (padding) slim.padding = padding;
  }

  // Dimensions — only on images and root
  if (type === "Image" || isRoot) {
    const bbox = node.absoluteBoundingBox;
    if (bbox) {
      slim.width = Math.round(bbox.width);
      slim.height = Math.round(bbox.height);
    }
  }

  // Children
  if (children.length > 0) slim.children = children;

  return slim;
}

// ─── Design Token Extraction ─────────────────────────────────

function extractTokens(styles: Record<string, unknown>): Record<string, string> {
  const tokens: Record<string, string> = {};
  if (styles && typeof styles === "object") {
    for (const [key, value] of Object.entries(styles)) {
      if (typeof value === "string") tokens[key] = value;
    }
  }
  return tokens;
}

// ─── Figma API Client ────────────────────────────────────────

export async function fetchFigmaNode(
  fileKey: string, nodeId: string, token: string
): Promise<{ node: FigmaNode; styles: Record<string, unknown> }> {
  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
  const response = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Figma API error ${response.status}: ${body}`);
  }
  const data = await response.json() as {
    nodes: Record<string, { document: FigmaNode; styles?: Record<string, unknown> }>;
  };
  const nodeData = data.nodes[nodeId];
  if (!nodeData) throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
  return { node: nodeData.document, styles: nodeData.styles || {} };
}

export async function fetchFigmaVariables(
  fileKey: string, token: string
): Promise<Record<string, unknown>> {
  const url = `https://api.figma.com/v1/files/${fileKey}/variables/local`;
  const response = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!response.ok) {
    console.error(`Variables API error ${response.status}`);
    return {};
  }
  return await response.json() as Record<string, unknown>;
}

// ─── Main Export ─────────────────────────────────────────────

export async function getSwiftTree(
  fileKey: string, nodeId: string, token: string
): Promise<SlimTree> {
  const { node, styles } = await fetchFigmaNode(fileKey, nodeId, token);
  const tokens = extractTokens(styles);
  const bbox = node.absoluteBoundingBox;

  const parsed = parse(node, 0, true);

  return {
    screen: node.name,
    width: bbox ? Math.round(bbox.width) : 0,
    height: bbox ? Math.round(bbox.height) : 0,
    components: parsed?.children || (parsed ? [parsed] : []),
    tokens,
  };
}