/**
 * Tool Registry für GogoChat
 *
 * WICHTIG: Dieses System ist GETRENNT von MCP!
 *
 * - MCP = Lokale System-Tools (Terminal, Filesystem) - funktioniert offline
 * - Tool-Registry = Cloud-Services (Image-Gen, TTS, Web-Search) - braucht Internet
 *
 * Tool-Registry nutzt das Capability-Pattern:
 * - Tools sind nur verfügbar wenn ihre Capability "connected" ist
 * - Jedes Tool kann andere Services aufrufen (image-gen.ts, tts.ts, etc.)
 */

import { getConfig } from '../db';

// ============================================================================
// Types
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  requiredCapability?: string; // z.B. "media.image_gen"
  category: 'media' | 'utility' | 'web' | 'system';
}

export interface ToolResult {
  success: boolean;
  data: any;
  mediaType?: 'image' | 'audio' | 'text' | 'video';
  mediaPath?: string;
  error?: string;
}

export type ToolHandler = (input: any) => Promise<ToolResult>;

// ============================================================================
// Registry Storage
// ============================================================================

class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  /**
   * Registriert ein neues Tool
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    console.log(`🔧 Registering tool: ${definition.name} (${definition.category})`);
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Gibt alle registrierten Tools zurück
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Filtert Tools basierend auf aktiven Capabilities
   *
   * WICHTIG: Nur Tools deren Capability aktiv ist werden zurückgegeben!
   */
  getAvailableTools(): ToolDefinition[] {
    const available: ToolDefinition[] = [];

    for (const { definition } of this.tools.values()) {
      // Wenn kein Capability nötig, immer verfügbar
      if (!definition.requiredCapability) {
        available.push(definition);
        continue;
      }

      // Prüfe ob Capability aktiv ist
      const capabilityKey = definition.requiredCapability;
      const isActive = this.isCapabilityActive(capabilityKey);

      if (isActive) {
        available.push(definition);
      }
    }

    console.log(`🔧 Available tools: ${available.length}/${this.tools.size}`);
    return available;
  }

  /**
   * Führt ein Tool aus
   */
  async executeTool(name: string, input: any): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        data: null,
        error: `Tool '${name}' not found`,
      };
    }

    // Prüfe Capability vor Ausführung
    if (tool.definition.requiredCapability) {
      const isActive = this.isCapabilityActive(tool.definition.requiredCapability);
      if (!isActive) {
        return {
          success: false,
          data: null,
          error: `Capability '${tool.definition.requiredCapability}' not active`,
        };
      }
    }

    try {
      console.log(`🔧 Executing tool: ${name}`, input);
      const result = await tool.handler(input);
      console.log(`✅ Tool executed: ${name}`, result.success);
      return result;
    } catch (error: any) {
      console.error(`❌ Tool execution failed: ${name}`, error);
      return {
        success: false,
        data: null,
        error: error.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Prüft ob eine Capability aktiv ist
   *
   * Beispiele:
   * - media.image_gen → prüft ob Image-Gen API konfiguriert ist
   * - media.tts → prüft ob TTS API konfiguriert ist
   */
  private isCapabilityActive(capability: string): boolean {
    // Split capability: "media.image_gen" → ["media", "image_gen"]
    const parts = capability.split('.');

    if (parts[0] === 'media') {
      // Media capabilities prüfen
      const mediaType = parts[1]; // z.B. "image_gen", "tts", "stt"

      switch (mediaType) {
        case 'image_gen':
          // Prüfe ob Image-Gen konfiguriert ist
          const imageProvider = getConfig('media.image_gen.provider');
          const imageApiKey = getConfig('media.image_gen.api_key');
          return !!(imageProvider && imageApiKey);

        case 'tts':
          // Prüfe ob TTS konfiguriert ist
          const ttsProvider = getConfig('media.tts.provider');
          return !!ttsProvider;

        case 'stt':
          // Prüfe ob STT konfiguriert ist
          const sttProvider = getConfig('media.stt.provider');
          return !!sttProvider;

        case 'ocr':
          // OCR ist lokal, immer verfügbar
          return true;

        case 'pdf':
          // PDF ist lokal, immer verfügbar
          return true;

        default:
          return false;
      }
    }

    if (parts[0] === 'web') {
      // Web-Tools sind immer verfügbar (keine API nötig)
      return true;
    }

    if (parts[0] === 'utility') {
      // Utility-Tools sind immer verfügbar
      return true;
    }

    return false;
  }

  /**
   * Konvertiert Tools ins Anthropic Format
   */
  getToolsForAnthropic(): any[] {
    const available = this.getAvailableTools();
    return available.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  /**
   * Konvertiert Tools ins OpenAI/LiteLLM Format
   */
  getToolsForOpenAI(): any[] {
    const available = this.getAvailableTools();
    return available.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  /**
   * Konvertiert Tools ins Ollama Format (OpenAI-kompatibel)
   */
  getToolsForOllama(): any[] {
    return this.getToolsForOpenAI(); // Ollama nutzt OpenAI Format
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const toolRegistry = new ToolRegistry();

// ============================================================================
// Helper: Tool Results formatieren
// ============================================================================

/**
 * Formatiert Tool-Ergebnisse für verschiedene LLM-Provider
 */
export function formatToolResultForProvider(
  provider: 'Anthropic' | 'LiteLLM' | 'Ollama',
  toolUseId: string,
  result: ToolResult
): any {
  const content = result.success
    ? JSON.stringify(result.data)
    : `Error: ${result.error}`;

  if (provider === 'Anthropic') {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: content,
    };
  }

  // OpenAI/LiteLLM/Ollama Format
  return {
    role: 'tool',
    tool_call_id: toolUseId,
    content: content,
  };
}
