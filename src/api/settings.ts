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

    // Parse dynamic providers from JSON
    let providers = [];
    try {
      if (config['providers']) {
        providers = JSON.parse(config['providers']);
      }
    } catch (e) {
      console.error('Failed to parse providers:', e);
    }

    // Transform flat config into structured settings
    const settings = {
      llm: {
        ollama: {
          url: config['llm.ollama.url'] || '',
          model: config['llm.ollama.model'] || '',
        },
        litellm: {
          url: config['llm.litellm.url'] || '',
          apiKey: config['llm.litellm.apiKey'] || '',
          model: config['llm.litellm.model'] || '',
        },
        anthropic: {
          apiKey: config['llm.anthropic.apiKey'] || '',
          model: config['llm.anthropic.model'] || '',
        },
      },
      providers,
      media: {
        tts: {
          providerId: config['media.tts.providerId'] || '',
          provider: config['media.tts.provider'] || '',
          apiKey: config['media.tts.apiKey'] || '',
          voice: config['media.tts.voice'] || 'alloy',
        },
        stt: {
          providerId: config['media.stt.providerId'] || '',
          provider: config['media.stt.provider'] || '',
          apiKey: config['media.stt.apiKey'] || '',
        },
        imageGen: {
          providerId: config['media.image_gen.providerId'] || '',
          provider: config['media.image_gen.provider'] || '',
          apiKey: config['media.image_gen.apiKey'] || '',
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
    setConfig('llm.litellm.apiKey', apiKey);
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
    setConfig('llm.anthropic.apiKey', apiKey);
  }

  res.json(result);
});

// ============================================================================
// Generic Provider Test & Model Loading
// ============================================================================

// Test any provider connection
router.post('/test/provider', async (req, res) => {
  const { type, url, apiKey, customHeaders } = req.body;

  try {
    let result;

    switch (type) {
      case 'ollama':
        if (!url) return res.json({ success: false, error: 'URL is required' });
        result = await testOllama(url);
        break;

      case 'litellm':
        if (!url) return res.json({ success: false, error: 'URL is required' });
        result = await testLiteLLM(url, apiKey || '');
        break;

      case 'anthropic':
        if (!apiKey) return res.json({ success: false, error: 'API key is required' });
        result = await testAnthropic(apiKey);
        break;

      case 'openai-compatible':
      case 'custom': {
        // Generic OpenAI-compatible test
        if (!url) return res.json({ success: false, error: 'URL is required' });
        result = await testOpenAICompatible(url, apiKey, customHeaders);
        break;
      }

      default:
        return res.json({ success: false, error: `Unknown provider type: ${type}` });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Provider test error:', error);
    res.json({ success: false, error: error.message || 'Unknown error' });
  }
});

// Load models for any provider
router.post('/provider/models', async (req, res) => {
  const { type, url, apiKey, customHeaders } = req.body;

  try {
    let result;

    switch (type) {
      case 'ollama':
        if (!url) return res.status(400).json({ error: 'URL is required' });
        result = await testOllama(url);
        break;

      case 'litellm':
        if (!url) return res.status(400).json({ error: 'URL is required' });
        result = await testLiteLLM(url, apiKey || '');
        break;

      case 'anthropic':
        // Anthropic models are well-known
        result = {
          success: true,
          models: [
            'claude-sonnet-4-20250514',
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
          ],
        };
        break;

      case 'openai-compatible':
      case 'custom': {
        if (!url) return res.status(400).json({ error: 'URL is required' });
        result = await loadOpenAICompatibleModels(url, apiKey, customHeaders);
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown provider type: ${type}` });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Model loading error:', error);
    res.json({ success: false, error: error.message || 'Unknown error' });
  }
});

// ============================================================================
// Test Database Connections
// ============================================================================

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

// ============================================================================
// Helper: OpenAI-Compatible Provider Testing
// ============================================================================

async function testOpenAICompatible(
  url: string,
  apiKey?: string,
  customHeaders?: Record<string, string>
): Promise<{ success: boolean; models?: string[]; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(customHeaders || {}),
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Try /v1/models or /models endpoint
    const baseUrl = url.replace(/\/+$/, '');
    let modelsUrl = `${baseUrl}/v1/models`;

    let response = await fetch(modelsUrl, {
      signal: controller.signal,
      headers,
    }).catch(() => null);

    // Fallback to /models
    if (!response || !response.ok) {
      modelsUrl = `${baseUrl}/models`;
      response = await fetch(modelsUrl, {
        signal: controller.signal,
        headers,
      }).catch(() => null);
    }

    clearTimeout(timeout);

    if (!response || !response.ok) {
      return {
        success: false,
        error: `Connection failed: ${response?.status || 'No response'}`,
      };
    }

    const data = (await response.json()) as any;
    const models = (data.data || data.models || []).map(
      (m: any) => m.id || m.name || m
    );

    return { success: true, models };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Connection timeout (10s)' };
    }
    return { success: false, error: error.message };
  }
}

async function loadOpenAICompatibleModels(
  url: string,
  apiKey?: string,
  customHeaders?: Record<string, string>
): Promise<{ success: boolean; models?: string[]; error?: string }> {
  return testOpenAICompatible(url, apiKey, customHeaders);
}

export default router;
