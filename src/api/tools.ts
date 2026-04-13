/**
 * Tools API - Test und Management
 *
 * Endpoints zum Testen und Verwalten von Tools
 */

import { Router, Request, Response } from 'express';
import { toolRegistry } from '../services/tool-registry';

const router = Router();

// GET /api/tools - Liste aller Tools
router.get('/', (req, res: Response) => {
  try {
    const allTools = toolRegistry.getAllTools();
    const available = toolRegistry.getAvailableTools();

    res.json({
      total: allTools.length,
      available: available.length,
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        category: tool.category,
        requiredCapability: tool.requiredCapability || 'none',
        isAvailable: available.some(t => t.name === tool.name),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tools/available - Nur verfügbare Tools
router.get('/available', (req, res: Response) => {
  try {
    const available = toolRegistry.getAvailableTools();

    res.json({
      count: available.length,
      tools: available,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tools/test - Tool testen
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { toolName, input } = req.body;

    if (!toolName) {
      return res.status(400).json({ error: 'Tool name required' });
    }

    console.log(`🔧 Testing tool: ${toolName}`, input);

    const result = await toolRegistry.executeTool(toolName, input || {});

    res.json({
      tool: toolName,
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tools/:provider - Tools für einen bestimmten Provider
router.get('/format/:provider', (req, res: Response) => {
  try {
    const { provider } = req.params;

    let formatted: any[];

    switch (provider.toLowerCase()) {
      case 'anthropic':
        formatted = toolRegistry.getToolsForAnthropic();
        break;
      case 'openai':
      case 'litellm':
        formatted = toolRegistry.getToolsForOpenAI();
        break;
      case 'ollama':
        formatted = toolRegistry.getToolsForOllama();
        break;
      default:
        return res.status(400).json({ error: 'Unknown provider. Use: anthropic, openai, litellm, ollama' });
    }

    res.json({
      provider,
      count: formatted.length,
      tools: formatted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
