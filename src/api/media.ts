/**
 * Media API
 *
 * Endpunkte für:
 * - TTS: POST /api/media/tts → Audio generieren
 * - Image-Gen: POST /api/media/image → Bild generieren
 * - Serve: GET /api/media/audio/:filename → Audio ausliefern
 * - Serve: GET /api/media/images/:filename → Bild ausliefern
 * - Test: POST /api/media/test/tts → Verbindung testen
 * - Test: POST /api/media/test/image-gen → Verbindung testen
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { generateTTS, testTTS, getAudioFilePath } from '../services/tts';
import { generateImage, testImageGen, getImageFilePath } from '../services/image-gen';
import { setConfig } from '../db';

const router = Router();

// ============================================================================
// TTS - Audio generieren
// ============================================================================

router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice, speed, provider } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }

    const result = await generateTTS({ text, voice, speed, provider });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      filename: result.filename,
      url: `/api/media/audio/${result.filename}`,
      provider: result.provider,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Image-Gen - Bild generieren
// ============================================================================

router.post('/image', async (req: Request, res: Response) => {
  try {
    const { prompt, style, size, quality, provider } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    const result = await generateImage({ prompt, style, size, quality, provider });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      filename: result.filename,
      url: `/api/media/images/${result.filename}`,
      provider: result.provider,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Audio-Datei ausliefern
// ============================================================================

router.get('/audio/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  const filepath = getAudioFilePath(filename);

  if (!filepath) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(filepath);
  stream.pipe(res);
  stream.on('error', () => res.status(500).end());
});

// ============================================================================
// Bild-Datei ausliefern
// ============================================================================

router.get('/images/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  const filepath = getImageFilePath(filename);

  if (!filepath) {
    return res.status(404).json({ error: 'Image file not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.webp' ? 'image/webp' :
    'image/png';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(filepath);
  stream.pipe(res);
  stream.on('error', () => res.status(500).end());
});

// ============================================================================
// Test: TTS Verbindung
// ============================================================================

router.post('/test/tts', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, voice } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'provider and apiKey required' });
    }

    const ok = await testTTS(provider, apiKey);

    if (ok) {
      // Einstellungen speichern
      setConfig('media.tts.provider', provider);
      setConfig('media.tts.api_key', apiKey); // stored as-is
      if (voice) setConfig('media.tts.voice', voice);
    }

    res.json({
      success: ok,
      provider,
      connected: ok,
      error: ok ? null : 'Connection failed',
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// ============================================================================
// Test: Image-Gen Verbindung
// ============================================================================

router.post('/test/image-gen', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, size, quality } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'provider and apiKey required' });
    }

    const ok = await testImageGen(provider, apiKey);

    if (ok) {
      // Einstellungen speichern
      setConfig('media.image_gen.provider', provider);
      setConfig('media.image_gen.api_key', apiKey); // stored as-is
      if (size) setConfig('media.image_gen.size', size);
      if (quality) setConfig('media.image_gen.quality', quality);
    }

    res.json({
      success: ok,
      provider,
      connected: ok,
      error: ok ? null : 'Connection failed',
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// ============================================================================
// Status: Welche Media-Capabilities sind aktiv?
// ============================================================================

router.get('/status', (req: Request, res: Response) => {
  try {
    const { getConfig } = require('../db');

    const ttsProvider = getConfig('media.tts.provider');
    const ttsKey = getConfig('media.tts.api_key');
    const imageProvider = getConfig('media.image_gen.provider');
    const imageKey = getConfig('media.image_gen.api_key');

    res.json({
      tts: {
        active: !!(ttsProvider && ttsKey),
        provider: ttsProvider || null,
        voice: getConfig('media.tts.voice') || 'nova',
      },
      imageGen: {
        active: !!(imageProvider && imageKey),
        provider: imageProvider || null,
        size: getConfig('media.image_gen.size') || '1024x1024',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
