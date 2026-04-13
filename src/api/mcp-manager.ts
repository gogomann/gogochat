import { Router, Request, Response } from 'express';
import { mcpManager } from '../mcp/client';

const router = Router();

// GET /api/mcp/status - Health check for MCP servers
router.get('/status', async (req: Request, res: Response) => {
  try {
    const initialized = mcpManager.isInitialized();
    const servers = mcpManager.getConnectedServers();
    const tools = mcpManager.getAllTools();

    res.json({
      initialized,
      servers,
      toolCount: tools.length,
      tools: tools.map(t => ({
        name: t.name,
        server: t.server,
        description: t.description,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/tools - List all available tools
router.get('/tools', async (req: Request, res: Response) => {
  try {
    const tools = mcpManager.getAllTools();

    res.json({
      tools: tools.map(t => ({
        name: t.name,
        server: t.server,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/servers - List connected servers
router.get('/servers', async (req: Request, res: Response) => {
  try {
    const servers = mcpManager.getConnectedServers();

    res.json({
      servers,
      count: servers.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/reinitialize - Reconnect to MCP servers
router.post('/reinitialize', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Reinitializing MCP servers...');

    // Shutdown existing connections
    await mcpManager.shutdown();

    // Reinitialize
    await mcpManager.initialize();

    const servers = mcpManager.getConnectedServers();
    const tools = mcpManager.getAllTools();

    res.json({
      success: true,
      servers,
      toolCount: tools.length,
    });
  } catch (error: any) {
    console.error('Failed to reinitialize MCP:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/test-tool - Test execute a tool
router.post('/test-tool', async (req: Request, res: Response) => {
  try {
    const { toolName, args } = req.body;

    if (!toolName) {
      return res.status(400).json({ error: 'Tool name required' });
    }

    const allTools = mcpManager.getAllTools();
    const tool = allTools.find(t => t.name === toolName);

    if (!tool) {
      return res.status(404).json({ error: `Tool '${toolName}' not found` });
    }

    const result = await mcpManager.executeTool(
      tool.server,
      toolName,
      args || {}
    );

    res.json({
      success: true,
      tool: toolName,
      server: tool.server,
      result,
    });
  } catch (error: any) {
    console.error('Tool execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
