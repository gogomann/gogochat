/**
 * Bildgenerierung Service
 *
 * Capability-Pattern:
 * - media.image_gen.provider = "dalle" | "stability"
 * - media.image_gen.api_key  = encrypted
 * - media.image_gen.size     = "1024x1024" etc.
 *
 * Status: media.image_gen → 🟢 → "Bild generieren" Button erscheint
 */

import { getConfig } from '../db';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ImageGenRequest {
  prompt: string;
  style?: 'photographic' | 'digital-art' | 'anime' | 'comic-book' | '3d-model' | 'natural';
  size?: '1024x1024' | '1792x1024' | '1024x1792' | '512x512';
  quality?: 'standard' | 'hd';
  provider?: 'dalle' | 'stability';
}

export interface ImageGenResult {
  success: boolean;
  filepath?: string;
  filename?: string;
  url?: string; // Relativer URL für Frontend
  error?: string;
  provider?: string;
}

// ============================================================================
// Generiertes Verzeichnis
// ============================================================================

function getGeneratedDir(): string {
  const dir = path.join(os.homedir(), '.gogochat', 'generated', 'images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================================================================
// DALL-E 3 (OpenAI)
// ============================================================================

async function generateWithDalle(req: ImageGenRequest): Promise<ImageGenResult> {
  const apiKey = getConfig('media.image_gen.api_key') || getConfig('llm.openai.key');
  if (!apiKey) {
    return { success: false, error: 'OpenAI API key not configured (media.image_gen.api_key)' };
  }

  const size = req.size || getConfig('media.image_gen.size') || '1024x1024';
  const quality = req.quality || getConfig('media.image_gen.quality') || 'standard';

  // DALL-E 3 unterstützt nur bestimmte Größen
  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  const finalSize = validSizes.includes(size) ? size : '1024x1024';

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: req.prompt,
      n: 1,
      size: finalSize,
      quality,
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `DALL-E error: ${error}` };
  }

  const data = await response.json() as any;
  const imageUrl = data.data?.[0]?.url;

  if (!imageUrl) {
    return { success: false, error: 'No image URL in response' };
  }

  // Bild herunterladen und lokal speichern
  const imgResponse = await fetch(imageUrl);
  const imgBuffer = await imgResponse.arrayBuffer();

  const filename = `img_${crypto.randomBytes(8).toString('hex')}.png`;
  const filepath = path.join(getGeneratedDir(), filename);
  fs.writeFileSync(filepath, Buffer.from(imgBuffer));

  return {
    success: true,
    filepath,
    filename,
    url: `/api/media/images/${filename}`,
    provider: 'dalle',
  };
}

// ============================================================================
// Stability AI
// ============================================================================

async function generateWithStability(req: ImageGenRequest): Promise<ImageGenResult> {
  const apiKey = getConfig('media.image_gen.api_key');
  if (!apiKey) {
    return { success: false, error: 'Stability AI API key not configured' };
  }

  const stylePresets: Record<string, string> = {
    'photographic': 'photographic',
    'digital-art': 'digital-art',
    'anime': 'anime',
    'comic-book': 'comic-book',
    '3d-model': '3d-model',
    'natural': 'photographic',
  };

  const stylePreset = req.style ? (stylePresets[req.style] || 'photographic') : undefined;

  const body: any = {
    text_prompts: [{ text: req.prompt, weight: 1 }],
    cfg_scale: 7,
    steps: 30,
    samples: 1,
  };

  if (stylePreset) {
    body.style_preset = stylePreset;
  }

  const response = await fetch(
    'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `Stability AI error: ${error}` };
  }

  const data = await response.json() as any;
  const base64Image = data.artifacts?.[0]?.base64;

  if (!base64Image) {
    return { success: false, error: 'No image in response' };
  }

  const filename = `img_${crypto.randomBytes(8).toString('hex')}.png`;
  const filepath = path.join(getGeneratedDir(), filename);
  fs.writeFileSync(filepath, Buffer.from(base64Image, 'base64'));

  return {
    success: true,
    filepath,
    filename,
    url: `/api/media/images/${filename}`,
    provider: 'stability',
  };
}

// ============================================================================
// Haupt-Funktion: Bild generieren
// ============================================================================

export async function generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
  if (!req.prompt || req.prompt.trim().length === 0) {
    return { success: false, error: 'Prompt is empty' };
  }

  const provider = req.provider || getConfig('media.image_gen.provider') || 'dalle';

  console.log(`🎨 Image-Gen: provider=${provider}, prompt="${req.prompt.slice(0, 50)}..."`);

  try {
    switch (provider) {
      case 'dalle':
        return await generateWithDalle(req);

      case 'stability':
        return await generateWithStability(req);

      default:
        return { success: false, error: `Unknown image-gen provider: ${provider}` };
    }
  } catch (error: any) {
    return { success: false, error: `Image generation error: ${error.message}` };
  }
}

// ============================================================================
// Verbindungstest
// ============================================================================

export async function testImageGen(provider: string, apiKey: string): Promise<boolean> {
  try {
    if (provider === 'dalle') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    }

    if (provider === 'stability') {
      const response = await fetch('https://api.stability.ai/v1/engines/list', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    }

    return false;
  } catch {
    return false;
  }
}

// ============================================================================
// Bild-Datei lesen
// ============================================================================

export function getImageFilePath(filename: string): string | null {
  const dir = getGeneratedDir();
  const filepath = path.join(dir, path.basename(filename));
  return fs.existsSync(filepath) ? filepath : null;
}
