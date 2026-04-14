import { Router, Request, Response } from 'express';
import { getConfig } from '../db';
import { toolRegistry, formatToolResultForProvider } from '../services/tool-registry';

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[]; // string für normale Nachrichten, array für Anthropic Tool-Blocks
}

interface ChatRequest {
  provider: string; // 'Ollama' | 'LiteLLM' | 'Anthropic' | dynamic provider name
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
}

// Dynamic provider config from DB
interface DynamicProviderConfig {
  id: string;
  name: string;
  type: string;
  url?: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
}

function getDynamicProvider(providerName: string): DynamicProviderConfig | null {
  try {
    const providersJson = getConfig('providers');
    if (!providersJson) return null;
    const providers = JSON.parse(providersJson) as DynamicProviderConfig[];
    return providers.find(p => p.name === providerName) || null;
  } catch {
    return null;
  }
}

// ============================================================================
// SSE Helpers
// ============================================================================

function sendSSE(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function setupSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

// ============================================================================
// ANTHROPIC - Non-Streaming (für Tool-Loop)
// ============================================================================

interface AnthropicResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  textContent: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: any;
  }>;
  rawContent: any[];
}

async function callAnthropicNonStream(
  apiKey: string,
  model: string,
  messages: any[],
  tools?: any[]
): Promise<AnthropicResponse> {
  const body: any = {
    model,
    max_tokens: 4096,
    messages: messages.filter((m) => m.role !== 'system'),
    system: messages.find((m) => m.role === 'system')?.content,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic error: ${error}`);
  }

  const data = await response.json() as any;

  const textContent = data.content
    ?.filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('') || '';

  const toolCalls = data.content
    ?.filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({
      id: b.id,
      name: b.name,
      input: b.input,
    })) || [];

  return {
    stopReason: data.stop_reason,
    textContent,
    toolCalls,
    rawContent: data.content || [],
  };
}

// ============================================================================
// OLLAMA - Non-Streaming (für Tool-Loop)
// ============================================================================

interface OpenAIStyleResponse {
  stopReason: 'stop' | 'tool_calls' | 'length';
  textContent: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: any;
  }>;
}

async function callOllamaNonStream(
  url: string,
  model: string,
  messages: any[],
  tools?: any[]
): Promise<OpenAIStyleResponse> {
  const body: any = {
    model,
    messages,
    stream: false,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error: ${error}`);
  }

  const data = await response.json() as any;
  const message = data.message || {};
  const toolCalls = (message.tool_calls || []).map((tc: any) => ({
    id: tc.function?.name + '_' + Date.now(),
    name: tc.function?.name,
    input: tc.function?.arguments || {},
  }));

  return {
    stopReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    textContent: message.content || '',
    toolCalls,
  };
}

// ============================================================================
// LITELLM - Non-Streaming (für Tool-Loop)
// ============================================================================

async function callLiteLLMNonStream(
  url: string,
  apiKey: string,
  model: string,
  messages: any[],
  tools?: any[]
): Promise<OpenAIStyleResponse> {
  const body: any = {
    model,
    messages,
    stream: false,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LiteLLM error: ${error}`);
  }

  const data = await response.json() as any;
  const choice = data.choices?.[0] || {};
  const message = choice.message || {};
  const toolCalls = (message.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name,
    input: typeof tc.function?.arguments === 'string'
      ? JSON.parse(tc.function.arguments)
      : tc.function?.arguments || {},
  }));

  return {
    stopReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
    textContent: message.content || '',
    toolCalls,
  };
}

// ============================================================================
// Streaming: Nur finale Antwort streamen
// ============================================================================

async function streamOllama(url: string, model: string, messages: any[], res: Response) {
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama stream error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            sendSSE(res, { content: data.message.content, done: false });
          }
          if (data.done) {
            return;
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }
  }
}

async function streamLiteLLM(url: string, apiKey: string, model: string, messages: any[], res: Response) {
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LiteLLM stream error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            sendSSE(res, { content, done: false });
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

async function streamAnthropic(apiKey: string, model: string, messages: any[], res: Response) {
  const body: any = {
    model,
    max_tokens: 4096,
    messages: messages.filter((m) => m.role !== 'system'),
    system: messages.find((m) => m.role === 'system')?.content,
    stream: true,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic stream error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta') {
            const content = parsed.delta?.text;
            if (content) {
              sendSSE(res, { content, done: false });
            }
          } else if (parsed.type === 'message_stop') {
            return;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

// ============================================================================
// OPENAI-COMPATIBLE (Custom/Dynamic) - Non-Streaming & Streaming
// ============================================================================

async function callOpenAICompatibleNonStream(
  url: string,
  apiKey: string,
  model: string,
  messages: any[],
  customHeaders?: Record<string, string>,
  tools?: any[]
): Promise<OpenAIStyleResponse> {
  const body: any = { model, messages, stream: false };
  if (tools && tools.length > 0) body.tools = tools;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const baseUrl = url.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible error (${response.status}): ${error}`);
  }

  const data = await response.json() as any;
  const choice = data.choices?.[0] || {};
  const message = choice.message || {};
  const toolCalls = (message.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name,
    input: typeof tc.function?.arguments === 'string'
      ? JSON.parse(tc.function.arguments)
      : tc.function?.arguments || {},
  }));

  return {
    stopReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
    textContent: message.content || '',
    toolCalls,
  };
}

async function streamOpenAICompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: any[],
  res: Response,
  customHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const baseUrl = url.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible stream error (${response.status}): ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            sendSSE(res, { content, done: false });
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

// ============================================================================
// TOOL-LOOP: Kern-Logik
// ============================================================================

async function runToolLoop(
  provider: string,
  model: string,
  messages: ChatMessage[],
  res: Response
) {
  const MAX_ITERATIONS = 10;
  let currentMessages: any[] = [...messages];

  // Verfügbare Tools basierend auf Capabilities
  const availableTools = toolRegistry.getAvailableTools();
  const hasTools = availableTools.length > 0;

  console.log(`🔧 Tool-Loop start: ${provider}:${model}, ${availableTools.length} tools available`);

  // Config laden
  const ollamaUrl = getConfig('llm.ollama.url') || 'http://localhost:11434';
  const litellmUrl = getConfig('llm.litellm.url') || '';
  const litellmKey = getConfig('llm.litellm.key') || '';
  const anthropicKey = getConfig('llm.anthropic.key') || '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(`🔄 Tool-Loop Iteration ${iteration + 1}`);

    // ── Non-Streaming Call (Tool-Erkennung) ─────────────────────────────────
    let stopReason: string;
    let textContent: string;
    let toolCalls: Array<{ id: string; name: string; input: any }>;
    let rawAnthropicContent: any[] | undefined;

    if (provider === 'Anthropic') {
      const tools = hasTools ? toolRegistry.getToolsForAnthropic() : undefined;
      const resp = await callAnthropicNonStream(anthropicKey, model, currentMessages, tools);
      stopReason = resp.stopReason;
      textContent = resp.textContent;
      toolCalls = resp.toolCalls;
      rawAnthropicContent = resp.rawContent;
    } else if (provider === 'Ollama') {
      const tools = hasTools ? toolRegistry.getToolsForOllama() : undefined;
      const resp = await callOllamaNonStream(ollamaUrl, model, currentMessages, tools);
      stopReason = resp.stopReason;
      textContent = resp.textContent;
      toolCalls = resp.toolCalls;
    } else if (provider === 'LiteLLM') {
      const tools = hasTools ? toolRegistry.getToolsForOpenAI() : undefined;
      const resp = await callLiteLLMNonStream(litellmUrl, litellmKey, model, currentMessages, tools);
      stopReason = resp.stopReason;
      textContent = resp.textContent;
      toolCalls = resp.toolCalls;
    } else {
      // Dynamic provider lookup
      const dynProvider = getDynamicProvider(provider);
      if (!dynProvider || !dynProvider.url) throw new Error(`Unknown provider: ${provider}`);
      const tools = hasTools ? toolRegistry.getToolsForOpenAI() : undefined;
      const resp = await callOpenAICompatibleNonStream(dynProvider.url, dynProvider.apiKey || '', model, currentMessages, dynProvider.customHeaders, tools);
      stopReason = resp.stopReason;
      textContent = resp.textContent;
      toolCalls = resp.toolCalls;
    }

    // ── Finale Antwort (kein Tool-Call) ─────────────────────────────────────
    const isToolCall = stopReason === 'tool_use' || stopReason === 'tool_calls';

    if (!isToolCall || toolCalls!.length === 0) {
      console.log(`✅ Finale Antwort nach ${iteration + 1} Iteration(en)`);
      // Bereits gesammelten Text senden wenn vorhanden
      if (textContent) {
        sendSSE(res, { content: textContent, done: false });
      }
      return; // Tool-Loop beendet
    }

    // ── Tool-Calls verarbeiten ───────────────────────────────────────────────
    console.log(`🔧 ${toolCalls!.length} Tool(s) aufgerufen:`, toolCalls!.map((t) => t.name));

    // Assistant-Nachricht zur History hinzufügen
    if (provider === 'Anthropic') {
      currentMessages.push({ role: 'assistant', content: rawAnthropicContent });
    } else {
      // OpenAI-Style: tool_calls in der Nachricht
      const assistantMsg: any = {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolCalls!.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      };
      currentMessages.push(assistantMsg);
    }

    // Tools ausführen und Ergebnisse sammeln
    const toolResultsForAnthropic: any[] = [];
    const toolResultsForOpenAI: any[] = [];

    for (const toolCall of toolCalls!) {
      // Tool-Use-Event an Client senden
      sendSSE(res, {
        type: 'tool_use',
        tool_name: toolCall.name,
        tool_input: toolCall.input,
      });

      // Tool ausführen
      const result = await toolRegistry.executeTool(toolCall.name, toolCall.input);

      if (result.success) {
        sendSSE(res, {
          type: 'tool_result',
          tool_name: toolCall.name,
          result: result.data,
        });
      } else {
        sendSSE(res, {
          type: 'tool_error',
          tool_name: toolCall.name,
          error: result.error,
        });
      }

      // Ergebnis für Provider formatieren
      const formattedResult = formatToolResultForProvider(
        provider,
        toolCall.id,
        result
      );

      if (provider === 'Anthropic') {
        toolResultsForAnthropic.push(formattedResult);
      } else {
        toolResultsForOpenAI.push(formattedResult);
      }
    }

    // Tool-Ergebnisse zur History hinzufügen
    if (provider === 'Anthropic') {
      currentMessages.push({ role: 'user', content: toolResultsForAnthropic });
    } else {
      // OpenAI-Style: jedes Tool-Ergebnis als eigene Nachricht
      for (const toolResult of toolResultsForOpenAI) {
        currentMessages.push(toolResult);
      }
    }

    // → Weiter zum nächsten Loop-Durchlauf
  }

  // Sicherheitslimit erreicht
  console.warn('⚠️ Tool-Loop Sicherheitslimit (10 Iterationen) erreicht');
  sendSSE(res, {
    content: 'Maximale Tool-Iterationen erreicht. Bitte versuche es erneut.',
    done: false,
  });
}

// ============================================================================
// MCP Status (bestehender Endpoint - beibehalten)
// ============================================================================

router.get('/mcp/status', (req, res) => {
  res.json({
    initialized: false,
    servers: [],
    toolCount: 0,
  });
});

// ============================================================================
// POST /api/chat - Haupt-Chat-Endpoint mit Tool-Loop
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const { provider, model, messages, stream = true } = req.body as ChatRequest;

    console.log(`💬 Chat request: ${provider}:${model} (stream: ${stream})`);

    if (!provider || !model || !messages) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // SSE-Header immer setzen (auch für Tool-Loop Events)
    setupSSE(res);

    try {
      // Tool-Loop ausführen (kümmert sich um Tool-Calls + finale Antwort)
      await runToolLoop(provider, model, messages, res);
    } catch (loopError: any) {
      console.error('Tool-Loop error:', loopError);
      // Fallback: Direkt streamen ohne Tools
      console.log('⚠️ Fallback: Streaming ohne Tool-Loop');

      const ollamaUrl = getConfig('llm.ollama.url') || 'http://localhost:11434';
      const litellmUrl = getConfig('llm.litellm.url') || '';
      const litellmKey = getConfig('llm.litellm.key') || '';
      const anthropicKey = getConfig('llm.anthropic.key') || '';

      if (provider === 'Ollama') {
        await streamOllama(ollamaUrl, model, messages, res);
      } else if (provider === 'LiteLLM') {
        await streamLiteLLM(litellmUrl, litellmKey, model, messages, res);
      } else if (provider === 'Anthropic') {
        await streamAnthropic(anthropicKey, model, messages, res);
      } else {
        // Dynamic provider fallback
        const dynProvider = getDynamicProvider(provider);
        if (dynProvider?.url) {
          await streamOpenAICompatible(dynProvider.url, dynProvider.apiKey || '', model, messages, res, dynProvider.customHeaders);
        }
      }
    }

    // Stream beenden
    sendSSE(res, { done: true });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      sendSSE(res, { error: error.message });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

export default router;
