/**
 * Text-to-Speech Service
 *
 * Capability-Pattern:
 * - media.tts.provider = "openai" | "elevenlabs" | "local"
 * - media.tts.api_key  = encrypted key
 * - media.tts.voice    = z.B. "nova", "alloy", "echo"
 *
 * Status: media.tts → 🟢 → 🔊 Button bei jeder Nachricht
 */

import { getConfig } from '../db';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface TTSRequest {
  text: string;
  voice?: string;
  provider?: 'openai' | 'elevenlabs';
  speed?: number; // 0.25 - 4.0
}

export interface TTSResult {
  success: boolean;
  filepath?: string;
  filename?: string;
  error?: string;
  provider?: string;
}

// ============================================================================
// Generiertes Verzeichnis
// ============================================================================

function getGeneratedDir(): string {
  const dir = path.join(os.homedir(), '.gogochat', 'generated', 'audio');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================================================================
// OpenAI TTS
// ============================================================================

async function generateWithOpenAI(req: TTSRequest): Promise<TTSResult> {
  const apiKey = getConfig('media.tts.api_key') || getConfig('llm.openai.key');
  if (!apiKey) {
    return { success: false, error: 'OpenAI API key not configured (media.tts.api_key)' };
  }

  const voice = req.voice || getConfig('media.tts.voice') || 'nova';
  const speed = req.speed || parseFloat(getConfig('media.tts.speed') || '1.0');
  const model = getConfig('media.tts.model') || 'tts-1';

  // Text kürzen wenn zu lang (OpenAI max 4096 chars)
  const text = req.text.slice(0, 4096);

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      speed,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `OpenAI TTS error: ${error}` };
  }

  // Audio-Datei speichern
  const audioBuffer = await response.arrayBuffer();
  const filename = `tts_${crypto.randomBytes(8).toString('hex')}.mp3`;
  const filepath = path.join(getGeneratedDir(), filename);

  fs.writeFileSync(filepath, Buffer.from(audioBuffer));

  return {
    success: true,
    filepath,
    filename,
    provider: 'openai',
  };
}

// ============================================================================
// ElevenLabs TTS
// ============================================================================

async function generateWithElevenLabs(req: TTSRequest): Promise<TTSResult> {
  const apiKey = getConfig('media.tts.api_key');
  if (!apiKey) {
    return { success: false, error: 'ElevenLabs API key not configured' };
  }

  const voiceId = req.voice || getConfig('media.tts.voice') || 'ErXwobaYiN019PkySvjV'; // Antoni (default)

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: req.text.slice(0, 5000),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `ElevenLabs TTS error: ${error}` };
  }

  const audioBuffer = await response.arrayBuffer();
  const filename = `tts_${crypto.randomBytes(8).toString('hex')}.mp3`;
  const filepath = path.join(getGeneratedDir(), filename);

  fs.writeFileSync(filepath, Buffer.from(audioBuffer));

  return {
    success: true,
    filepath,
    filename,
    provider: 'elevenlabs',
  };
}

// ============================================================================
// Haupt-Funktion: TTS generieren
// ============================================================================

export async function generateTTS(req: TTSRequest): Promise<TTSResult> {
  if (!req.text || req.text.trim().length === 0) {
    return { success: false, error: 'Text is empty' };
  }

  const provider = req.provider || getConfig('media.tts.provider') || 'openai';

  console.log(`🔊 TTS: provider=${provider}, chars=${req.text.length}`);

  try {
    switch (provider) {
      case 'openai':
        return await generateWithOpenAI(req);

      case 'elevenlabs':
        return await generateWithElevenLabs(req);

      default:
        return { success: false, error: `Unknown TTS provider: ${provider}` };
    }
  } catch (error: any) {
    return { success: false, error: `TTS error: ${error.message}` };
  }
}

// ============================================================================
// Verbindungstest
// ============================================================================

export async function testTTS(provider: string, apiKey: string): Promise<boolean> {
  try {
    if (provider === 'openai') {
      // Kurzer Test-Call
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    }

    if (provider === 'elevenlabs') {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey },
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
// Audio-Datei lesen (für HTTP-Streaming an Client)
// ============================================================================

export function getAudioFilePath(filename: string): string | null {
  // Security: Nur Dateien aus dem generierten Verzeichnis
  const dir = getGeneratedDir();
  const filepath = path.join(dir, path.basename(filename));
  return fs.existsSync(filepath) ? filepath : null;
}
