/**
 * Tool Registry Initialisierung
 *
 * Registriert alle verfügbaren Tools beim Server-Start
 *
 * WICHTIG: Wird beim Server-Start aufgerufen (index.ts)
 */

import { toolRegistry } from './tool-registry';

// Basic Tools (immer verfügbar)
import { calculatorTool, handleCalculator } from '../tools/calculator';
import { webSearchTool, handleWebSearch } from '../tools/web-search';

// Media Tools (brauchen Capabilities)
import { imageGenTool, handleImageGen } from '../tools/image-gen-tool';
import { ttsTool, handleTTS } from '../tools/tts-tool';

/**
 * Initialisiert alle Tools
 */
export function initializeTools(): void {
  console.log('🔧 Initializing Tool Registry...');

  // ============================================================================
  // BASIC TOOLS - Immer verfügbar, keine Capabilities nötig
  // ============================================================================

  toolRegistry.register(calculatorTool, handleCalculator);
  toolRegistry.register(webSearchTool, handleWebSearch);

  // ============================================================================
  // MEDIA TOOLS - Brauchen konfigurierte Capabilities
  // ============================================================================

  toolRegistry.register(imageGenTool, handleImageGen);
  toolRegistry.register(ttsTool, handleTTS);

  // ============================================================================
  // SYSTEM TOOLS - Lokale Tools (optional)
  // ============================================================================

  // TODO: File-Reader Tool (braucht MCP Filesystem)
  // TODO: PDF-Extract Tool
  // TODO: OCR Tool

  const allTools = toolRegistry.getAllTools();
  const available = toolRegistry.getAvailableTools();

  console.log(`✅ Tool Registry initialized: ${available.length}/${allTools.length} tools available`);
  console.log(`   Active: ${available.map(t => t.name).join(', ') || 'none'}`);
  console.log(`   Registered: ${allTools.map(t => t.name).join(', ')}`);
}
