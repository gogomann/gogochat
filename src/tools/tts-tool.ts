/**
 * TTS Tool
 *
 * Ermöglicht dem LLM Text in Sprache umzuwandeln.
 * requiredCapability: "media.tts" → nur aktiv wenn TTS konfiguriert
 */

import { ToolDefinition, ToolResult } from '../services/tool-registry';
import { generateTTS } from '../services/tts';

export const ttsTool: ToolDefinition = {
  name: 'text_to_speech',
  description:
    'Wandelt Text in gesprochene Sprache um und erstellt eine Audio-Datei. ' +
    'Nutze dies wenn der User explizit möchte dass Text vorgelesen wird oder ' +
    'ein Audio-Clip erstellt werden soll.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Der Text der in Sprache umgewandelt werden soll (max. 4000 Zeichen)',
      },
      voice: {
        type: 'string',
        enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        description: 'Stimme (Standard: nova - weiblich, klar)',
      },
      speed: {
        type: 'number',
        description: 'Sprechgeschwindigkeit (0.25 bis 4.0, Standard: 1.0)',
      },
    },
    required: ['text'],
  },
  category: 'media',
  requiredCapability: 'media.tts',
};

export async function handleTTS(input: {
  text: string;
  voice?: string;
  speed?: number;
}): Promise<ToolResult> {
  // Text kürzen wenn zu lang
  const text = input.text.slice(0, 4000);

  const result = await generateTTS({
    text,
    voice: input.voice,
    speed: input.speed,
  });

  if (!result.success) {
    return {
      success: false,
      data: null,
      error: result.error,
    };
  }

  return {
    success: true,
    data: {
      filename: result.filename,
      url: `/api/media/audio/${result.filename}`,
      provider: result.provider,
      message: `Audio wurde erfolgreich erstellt: ${result.filename}`,
      chars: text.length,
    },
    mediaType: 'audio',
    mediaPath: result.filepath,
  };
}
