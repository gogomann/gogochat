import { Router } from 'express';
import { getConfig, setConfig, deleteConfig, getAllConfig } from '../db';
import { testOllama, testLiteLLM, testAnthropic } from '../services/llm';
import { testPostgres } from '../services/database';

const router = Router();

// ============================================================================
// Get all settings
// ============================================================================
router.get('/', (req, res) => {
  try {
    const config = getAllConfig();

    // Transform flat config into structured settings
    const settings = {
      llm: {
        ollama: {
          url: config['llm.ollama.url'] || '',
          model: config['llm.ollama.model'] || '',
        },
        litellm: {
          url: config['llm.litellm.url'] || '',
          apiKey: config['llm.litellm.apiKey'] || '', // Plain text - no masking
          model: config['llm.litellm.model'] || '',
        },
        anthropic: {
          apiKey: config['llm.anthropic.apiKey'] || '', // Plain text - no masking
          model: config['llm.anthropic.model'] || '',
        },
      },
      database: {
        sqlite: {
          path: config['db.sqlite.path'] || '',
        },
        pgMain: {
          url: config['db.pg_main.url'] || '',
        },
        pgVector: {
          url: config['db.pg_vector.url'] || '',
        },
      },
      mcp: {
        filesystem: {
          enabled: config['mcp.filesystem.enabled'] === 'true',
          root: config['mcp.filesystem.root'] || '',
        },
        terminal: {
          enabled: config['mcp.terminal.enabled'] === 'true',
        },
        browser: {
          url: config['mcp.browser.url'] || '',
        },
      },
      agents: {
        n8n: {
          webhookUrl: config['n8n.webhook.url'] || '',
        },
      },
    };

    res.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// ============================================================================
// Test LLM Connections
// ============================================================================

// Test Ollama
router.post('/test/ollama', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const result = await testOllama(url);

  if (result.success) {
    // Save on success
    setConfig('llm.ollama.url', url);
  }

  res.json(result);
});

// Test LiteLLM
router.post('/test/litellm', async (req, res) => {
  const { url, apiKey } = req.body;

  if (!url || !apiKey) {
    return res.status(400).json({ error: 'URL and API key are required' });
  }

  const result = await testLiteLLM(url, apiKey);

  if (result.success) {
    setConfig('llm.litellm.url', url);
    setConfig('llm.litellm.apiKey', apiKey); // Fixed: apiKey not key
  }

  res.json(result);
});

// Test Anthropic
router.post('/test/anthropic', async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  const result = await testAnthropic(apiKey);

  if (result.success) {
    setConfig('llm.anthropic.apiKey', apiKey); // Fixed: apiKey not key
  }

  res.json(result);
});

// ============================================================================
// Test Database Connections
// ============================================================================

// Test PostgreSQL Main
router.post('/test/pg-main', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const result = await testPostgres(url);

  if (result.success) {
    setConfig('db.pg_main.url', url);
  }

  res.json(result);
});

// Test PostgreSQL Vector
router.post('/test/pg-vector', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const result = await testPostgres(url);

  if (result.success) {
    setConfig('db.pg_vector.url', url);
  }

  res.json(result);
});

// ============================================================================
// Update Settings
// ============================================================================

// Update any setting
router.post('/update', (req, res) => {
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }

  try {
    if (value === null || value === undefined || value === '') {
      deleteConfig(key);
    } else {
      setConfig(key, String(value));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
