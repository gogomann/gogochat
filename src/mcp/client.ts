import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getConfig } from '../db';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPServer {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: MCPTool[];
}

class MCPClientManager {
  private servers: Map<string, MCPServer> = new Map();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    console.log('🔧 Initializing MCP Client Manager...');

    // Check which MCP servers are enabled
    const terminalEnabled = getConfig('mcp.terminal.enabled') === 'true';
    const filesystemEnabled = getConfig('mcp.filesystem.enabled') === 'true';

    // Initialize Terminal MCP if enabled
    if (terminalEnabled) {
      try {
        await this.connectTerminalMCP();
      } catch (error) {
        console.error('Failed to connect Terminal MCP:', error);
      }
    }

    // Initialize Filesystem MCP if enabled
    if (filesystemEnabled) {
      try {
        await this.connectFilesystemMCP();
      } catch (error) {
        console.error('Failed to connect Filesystem MCP:', error);
      }
    }

    this.initialized = true;
    console.log(`✅ MCP Manager initialized with ${this.servers.size} servers`);
  }

  private async connectTerminalMCP() {
    console.log('🔌 Connecting to Terminal MCP...');

    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-terminal'],
    });

    const client = new Client({
      name: 'gogochat-terminal',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);

    // Discover available tools
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    this.servers.set('terminal', {
      name: 'Terminal MCP',
      client,
      transport,
      tools,
    });

    console.log(`✅ Terminal MCP connected with ${tools.length} tools:`, tools.map(t => t.name).join(', '));
  }

  private async connectFilesystemMCP() {
    console.log('🔌 Connecting to Filesystem MCP...');

    const rootPath = getConfig('mcp.filesystem.root') || process.env.HOME || '/';

    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', rootPath],
    });

    const client = new Client({
      name: 'gogochat-filesystem',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);

    // Discover available tools
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    this.servers.set('filesystem', {
      name: 'Filesystem MCP',
      client,
      transport,
      tools,
    });

    console.log(`✅ Filesystem MCP connected with ${tools.length} tools:`, tools.map(t => t.name).join(', '));
  }

  async executeTool(serverKey: string, toolName: string, args: any): Promise<any> {
    const server = this.servers.get(serverKey);
    if (!server) {
      throw new Error(`MCP server '${serverKey}' not connected`);
    }

    console.log(`🔧 Executing tool: ${serverKey}/${toolName}`, args);

    const result = await server.client.callTool({
      name: toolName,
      arguments: args,
    });

    console.log(`✅ Tool executed:`, result);
    return result;
  }

  getAllTools(): Array<MCPTool & { server: string }> {
    const allTools: Array<MCPTool & { server: string }> = [];

    for (const [serverKey, server] of this.servers.entries()) {
      for (const tool of server.tools) {
        allTools.push({
          ...tool,
          server: serverKey,
        });
      }
    }

    return allTools;
  }

  getToolsForProvider(provider: 'Anthropic' | 'LiteLLM' | 'Ollama'): any[] {
    const tools = this.getAllTools();

    // Format tools based on provider
    if (provider === 'Anthropic') {
      // Anthropic format
      return tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        input_schema: tool.inputSchema,
      }));
    } else if (provider === 'LiteLLM') {
      // OpenAI-compatible format (used by LiteLLM)
      return tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputSchema,
        },
      }));
    }

    // Ollama doesn't support tools in the same way
    return [];
  }

  async shutdown() {
    console.log('🛑 Shutting down MCP servers...');

    for (const [key, server] of this.servers.entries()) {
      try {
        await server.client.close();
        console.log(`✅ Closed ${key}`);
      } catch (error) {
        console.error(`Failed to close ${key}:`, error);
      }
    }

    this.servers.clear();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }
}

// Singleton instance
export const mcpManager = new MCPClientManager();

// Initialize on module load
mcpManager.initialize().catch(error => {
  console.error('Failed to initialize MCP Manager:', error);
});

// Cleanup on process exit
process.on('SIGTERM', () => {
  mcpManager.shutdown().catch(console.error);
});

process.on('SIGINT', () => {
  mcpManager.shutdown().catch(console.error);
});
