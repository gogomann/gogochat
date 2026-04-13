/**
 * Image-Gen Tool
 *
 * Ermöglicht dem LLM Bilder zu generieren wenn der User es wünscht.
 * requiredCapability: "media.image_gen" → nur aktiv wenn Image-Gen konfiguriert
 */

import { ToolDefinition, ToolResult } from '../services/tool-registry';
import { generateImage } from '../services/image-gen';

export const imageGenTool: ToolDefinition = {
  name: 'generate_image',
  description:
    'Generiert ein Bild basierend auf einer Beschreibung. ' +
    'Nutze dies wenn der User explizit ein Bild, Foto oder eine Illustration erstellt haben möchte. ' +
    'Gib einen detaillierten englischen Prompt an für beste Ergebnisse.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'Detaillierte Bildbeschreibung auf Englisch (z.B. "a golden retriever puppy in a sunny meadow, photorealistic")',
      },
      style: {
        type: 'string',
        enum: ['photographic', 'digital-art', 'anime', 'comic-book', '3d-model', 'natural'],
        description: 'Gewünschter Bildstil',
      },
      size: {
        type: 'string',
        enum: ['1024x1024', '1792x1024', '1024x1792'],
        description: 'Bildgröße (Standard: 1024x1024)',
      },
    },
    required: ['prompt'],
  },
  category: 'media',
  requiredCapability: 'media.image_gen',
};

export async function handleImageGen(input: {
  prompt: string;
  style?: string;
  size?: string;
}): Promise<ToolResult> {
  const result = await generateImage({
    prompt: input.prompt,
    style: input.style as any,
    size: input.size as any,
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
      url: result.url,
      provider: result.provider,
      message: `Bild wurde erfolgreich generiert: ${result.filename}`,
    },
    mediaType: 'image',
    mediaPath: result.filepath,
  };
}
