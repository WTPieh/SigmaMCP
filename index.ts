#!/usr/bin/env node

/**
 * figma-swift-mcp
 * 
 * An MCP server that wraps the Figma REST API and returns
 * a slim, SwiftUI-optimized component tree.
 * 
 * Claude never sees the raw Figma node JSON. It only receives
 * the compressed slim tree.
 * 
 * Tools:
 *   - get_swift_tree: Fetch a Figma node and return the slim tree
 * 
 * Screenshots and design tokens come from the existing Figma MCP server
 * (Figma:get_screenshot, Figma:get_variable_defs).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getSwiftTree } from "./figma-parser.js";

// ─── Config ──────────────────────────────────────────────────

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;

if (!FIGMA_TOKEN) {
  console.error("ERROR: FIGMA_TOKEN environment variable is required.");
  console.error("Generate one at: Figma → Settings → Account → Personal Access Tokens");
  process.exit(1);
}

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer({
  name: "figma-swift-mcp",
  version: "0.1.0",
});

// ─── Tool: get_swift_tree ────────────────────────────────────

server.registerTool(
  "get_swift_tree",
  {
    description:
      "Fetch a Figma design node and return a slim, SwiftUI-optimized component tree. " +
      "The tree contains component hierarchy, layout properties, design tokens, SF Symbol mappings, " +
      "and type hints — everything needed to generate idiomatic SwiftUI code. " +
      "Raw Figma data is parsed and compressed server-side so only essential structure is returned.",
    inputSchema: z.object({
      fileKey: z
        .string()
        .describe(
          "The Figma file key. Extract from the URL: figma.com/design/<fileKey>/..."
        ),
      nodeId: z
        .string()
        .describe(
          "The node ID to fetch. Extract from the URL: ?node-id=<nodeId>. " +
            "Use colon format like '2217:48104', not dash format."
        ),
      depth: z
        .number()
        .optional()
        .describe(
          "Max depth to traverse the node tree. Default is 15. " +
            "Use lower values for overview, higher for full detail."
        ),
    }),
  },
  async ({ fileKey, nodeId }) => {
    try {
      const tree = await getSwiftTree(fileKey, nodeId, FIGMA_TOKEN);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching Figma node: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Start ───────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("figma-swift-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});