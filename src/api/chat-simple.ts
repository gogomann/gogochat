import { Router, Request, Response } from 'express';
import { getConfig } from '../db';

const router = Router();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  provider: 'Ollama' | 'LiteLLM' | 'Anthropic';
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
}

// Ollama Chat - SIMPLE VERSION
async function chatWithOllama(url: string, model: string, messages: ChatMessage[], stream: boolean, res: Response) {
  try {
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}`);
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

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
                res.write(`data: ${JSON.stringify({ content: data.message.content, done: data.done })}\n\n`);
              }
              if (data.done) {
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              }
            } catch (e) {
              console.error('Failed to parse line:', line, e);
            }
          }
        }
      }
      res.end();
    } else {
      const data = await response.json() as any;
      return data.message?.content || '';
    }
  } catch (error: any) {
    console.error('Ollama chat error:', error);
    throw error;
  }
}

// LiteLLM Chat - SIMPLE VERSION
async function chatWithLiteLLM(url: string, apiKey: string, model: string, messages: ChatMessage[], stream: boolean, res: Response) {
  try {
    const response = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LiteLLM error: ${error}`);
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

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
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
              }
            } catch (e) {
              console.error('Failed to parse SSE:', line, e);
            }
          }
        }
      }
      res.end();
    } else {
      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '';
    }
  } catch (error: any) {
    console.error('LiteLLM chat error:', error);
    throw error;
  }
}

// Anthropic Chat - SIMPLE VERSION
async function chatWithAnthropic(apiKey: string, model: string, messages: ChatMessage[], stream: boolean, res: Response) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${error}`);
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

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
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta') {
                const content = parsed.delta?.text;
                if (content) {
                  res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
                }
              } else if (parsed.type === 'message_stop') {
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE:', line, e);
            }
          }
        }
      }
      res.end();
    } else {
      const data = await response.json() as any;
      return data.content?.[0]?.text || '';
    }
  } catch (error: any) {
    console.error('Anthropic chat error:', error);
    throw error;
  }
}

// POST /api/chat - SIMPLE USER CHAT ONLY
router.post('/', async (req: Request, res: Response) => {
  try {
    const { provider, model, messages, stream = true } = req.body as ChatRequest;

    console.log(`💬 Chat request: ${provider}:${model} (stream: ${stream})`);

    if (!provider || !model || !messages) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Route to appropriate provider - NO MCP HERE!
    if (provider === 'Ollama') {
      const url = getConfig('llm.ollama.url') || 'http://localhost:11434';
      await chatWithOllama(url, model, messages, stream, res);
    } else if (provider === 'LiteLLM') {
      const url = getConfig('llm.litellm.url');
      const apiKey = getConfig('llm.litellm.key');
      if (!url || !apiKey) {
        return res.status(400).json({ error: 'LiteLLM not configured' });
      }
      await chatWithLiteLLM(url, apiKey, model, messages, stream, res);
    } else if (provider === 'Anthropic') {
      const apiKey = getConfig('llm.anthropic.key');
      if (!apiKey) {
        return res.status(400).json({ error: 'Anthropic not configured' });
      }
      await chatWithAnthropic(apiKey, model, messages, stream, res);
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
  } catch (error: any) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.end();
    }
  }
});

export default router;
