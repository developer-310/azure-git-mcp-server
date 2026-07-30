import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper function to safely execute CLI commands
async function runCommand(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { success: true, output: stdout || stderr };
  } catch (error: any) {
    return { success: false, output: error.message };
  }
}

// Initialize MCP Server
const server = new Server(
  {
    name: "azure-git-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. Register Available MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // --- Azure Tools ---
      {
        name: "azure_list_resources",
        description: "List running Azure resources across resource groups",
        inputSchema: {
          type: "object",
          properties: {
            resourceGroup: { type: "string", description: "Filter by resource group (optional)" },
          },
        },
      },
      {
        name: "azure_create_resource_group",
        description: "Create a new Azure Resource Group",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Resource Group Name" },
            location: { type: "string", description: "Azure Region (e.g., eastus, westeurope)" },
          },
          required: ["name", "location"],
        },
      },
      
      // --- Git Tools ---
      {
        name: "git_status",
        description: "Get repository status and modified files",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path (default: current directory)" },
          },
        },
      },
      {
        name: "git_commit_and_push",
        description: "Stage all changes, commit with message, and push to remote",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Commit message" },
            branch: { type: "string", description: "Branch name (default: main)" },
          },
          required: ["message"],
        },
      },
    ],
  };
});

// 2. Tool Execution Logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "azure_list_resources": {
      const rg = args?.resourceGroup ? `-g ${args.resourceGroup}` : "";
      const res = await runCommand(`az resource list ${rg} --output table`);
      return { content: [{ type: "text", text: res.output }] };
    }

    case "azure_create_resource_group": {
      const { name, location } = args as { name: string; location: string };
      const res = await runCommand(`az group create --name ${name} --location ${location}`);
      return { content: [{ type: "text", text: res.output }] };
    }

    case "git_status": {
      const path = (args?.path as string) || ".";
      const res = await runCommand(`git -C "${path}" status`);
      return { content: [{ type: "text", text: res.output }] };
    }

    case "git_commit_and_push": {
      const msg = args?.message as string;
      const branch = (args?.branch as string) || "main";
      const res = await runCommand(`git add . && git commit -m "${msg}" && git push origin ${branch}`);
      return { content: [{ type: "text", text: res.output }] };
    }

    default:
      throw new Error(`Tool not found: ${name}`);
  }
});

// 3. Start Server with Stdio Transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Azure & Git MCP Server running on stdio...");
}

main();
