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
  // MEDIA TOOLS - Brauchen Capabilities
  // ============================================================================

  // TODO: Image-Gen Tool (Phase 5)
  // TODO: TTS Tool (Phase 6)
  // TODO: STT Tool (Phase 7)

  // ============================================================================
  // SYSTEM TOOLS - Lokale Tools
  // ============================================================================

  // TODO: File-Reader Tool (optional)
  // TODO: PDF-Extract Tool (optional)
  // TODO: OCR Tool (optional)

  const allTools = toolRegistry.getAllTools();
  const available = toolRegistry.getAvailableTools();

  console.log(`✅ Tool Registry initialized: ${available.length}/${allTools.length} tools available`);
}
