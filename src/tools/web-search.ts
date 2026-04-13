/**
 * Web Search Tool
 *
 * Einfache Web-Suche via DuckDuckGo (keine API nötig!)
 * KEINE Capability nötig - funktioniert mit Internet-Verbindung
 */

import { ToolDefinition, ToolResult } from '../services/tool-registry';

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Sucht im Internet nach aktuellen Informationen. ' +
    'Nutze dies wenn der User nach aktuellen Ereignissen, News, oder Informationen fragt die du nicht kennst.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchbegriff oder Frage',
      },
      num_results: {
        type: 'number',
        description: 'Anzahl der Ergebnisse (1-10)',
        default: 5,
      },
    },
    required: ['query'],
  },
  category: 'web',
  // Keine requiredCapability - funktioniert wenn Internet da ist
};

/**
 * Web Search Handler - Nutzt DuckDuckGo Instant Answer API
 */
export async function handleWebSearch(input: {
  query: string;
  num_results?: number;
}): Promise<ToolResult> {
  try {
    const { query, num_results = 5 } = input;

    // DuckDuckGo Instant Answer API (kostenlos, keine API Key nötig!)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any;

    // DuckDuckGo Ergebnisse formatieren
    const results = [];

    // Abstract (Haupt-Antwort)
    if (data.Abstract) {
      results.push({
        title: data.Heading || 'Answer',
        snippet: data.Abstract,
        url: data.AbstractURL || '',
      });
    }

    // Related Topics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      for (const topic of data.RelatedTopics.slice(0, num_results - 1)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        data: {
          query: query,
          results: [],
          message: 'Keine Ergebnisse gefunden. Versuche eine andere Suchanfrage.',
        },
        mediaType: 'text',
      };
    }

    return {
      success: true,
      data: {
        query: query,
        results: results,
        summary: results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n\n'),
      },
      mediaType: 'text',
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        data: null,
        error: 'Search timeout (10s)',
      };
    }

    return {
      success: false,
      data: null,
      error: `Search error: ${error.message}`,
    };
  }
}
