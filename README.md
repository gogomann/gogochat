# 🛠️ GogoChat v0.5 – Erweiterungsplan: Multimodale Capabilities

> **Arbeitsanweisung für Claude Code**
> Dieses Dokument beschreibt, wie GogoChat um multimodale Fähigkeiten erweitert wird.
> Alles folgt dem bestehenden **Capability-Driven Pattern**: User konfiguriert → Live-Test → Feature erscheint.

---

## 🎯 Überblick: Neue Capabilities

| Capability | Settings-Key | Beschreibung | Abhängigkeit |
|---|---|---|---|
| **Tool-Use** | `llm.tools` | Function Calling für LLMs | LLM muss connected sein |
| **Bildgenerierung** | `media.image_gen` | Text → Bild | Stability AI / DALL-E / Ollama |
| **TTS** | `media.tts` | Text → Sprache | OpenAI TTS / Google / lokal |
| **STT** | `media.stt` | Sprache → Text | Whisper API / lokal |
| **PDF-Extraktion** | `media.pdf` | PDF → Text | Lokal (kein API nötig) |
| **OCR** | `media.ocr` | Bild → Text | Tesseract / Cloud Vision |

---

## 📁 Neue Projektstruktur (Erweiterung)

```
gogo_chat/
├── src/
│   ├── api/
│   │   ├── settings.ts          # ✅ EXISTS – erweitern um neue Test-Endpoints
│   │   ├── capabilities.ts      # ✅ EXISTS – erweitern um neue Capabilities
│   │   ├── chat.ts              # 🆕 Chat-Endpoint mit Tool-Loop
│   │   └── media.ts             # 🆕 Media-Endpoints (TTS/STT/Image/PDF/OCR)
│   ├── services/
│   │   ├── llm.ts               # ✅ EXISTS – erweitern um Tool-Use
│   │   ├── database.ts          # ✅ EXISTS
│   │   ├── tool-registry.ts     # 🆕 Tool-Definitionen & Ausführung
│   │   ├── tts.ts               # 🆕 Text-to-Speech Service
│   │   ├── stt.ts               # 🆕 Speech-to-Text Service
│   │   ├── image-gen.ts         # 🆕 Bildgenerierung Service
│   │   ├── pdf-extract.ts       # 🆕 PDF-Extraktion Service
│   │   └── ocr.ts               # 🆕 OCR Service
│   ├── tools/                   # 🆕 Einzelne Tool-Implementierungen
│   │   ├── web-search.ts        # 🆕 Web-Suche Tool
│   │   ├── calculator.ts        # 🆕 Rechner Tool
│   │   ├── file-reader.ts       # 🆕 Datei-Lesen Tool
│   │   ├── image-gen-tool.ts    # 🆕 Bild-generieren als Tool
│   │   └── tts-tool.ts          # 🆕 TTS als Tool
│   ├── types/
│   │   └── index.ts             # ✅ EXISTS – erweitern um neue Types
│   └── index.ts                 # ✅ EXISTS – neue Routes registrieren
│
├── client/
│   ├── components/
│   │   ├── StatusBar.tsx         # ✅ EXISTS – neue Capability-Badges
│   │   ├── SettingsModal.tsx     # ✅ EXISTS – neue Settings-Sections
│   │   ├── ChatInterface.tsx     # 🆕 Vollständige Chat-UI
│   │   ├── ChatMessage.tsx       # 🆕 Nachricht mit Bild/Audio Support
│   │   ├── AudioRecorder.tsx     # 🆕 Mikrofon-Aufnahme Komponente
│   │   ├── FileUpload.tsx        # 🆕 PDF/Bild Upload Komponente
│   │   ├── ImagePreview.tsx      # 🆕 Generierte Bilder anzeigen
│   │   └── AudioPlayer.tsx       # 🆕 TTS Audio abspielen
│   └── lib/
│       ├── api.ts               # ✅ EXISTS – neue API-Calls
│       ├── store.ts             # ✅ EXISTS – neue Capability-States
│       └── types.ts             # ✅ EXISTS – neue Types
│
├── uploads/                     # 🆕 Temporärer Upload-Ordner
├── generated/                   # 🆕 Generierte Dateien (Audio/Bilder)
└── MULTIMODAL_PLAN.md          # 🆕 DIESES DOKUMENT
```

---

## 1️⃣ TOOL-USE / FUNCTION CALLING

### Konzept
GogoChat's LLM-Service bekommt eine **Tool-Loop**. Claude/Ollama entscheidet selbst, wann ein Tool aufgerufen wird. Das Ergebnis wird zurückgefüttert bis eine finale Antwort kommt.

### Wichtige Regeln
- Tools werden als **JSON-Schema** definiert (OpenAI/Anthropic Format)
- Der Chat-Endpoint muss eine **While-Schleife** haben
- Tools können **andere Capabilities** aufrufen (z.B. Tool "generate_image" ruft `image-gen.ts` auf)
- Jedes Tool muss **einzeln aktivierbar** sein in Settings

### Settings-Key
```
llm.tools.enabled = true/false
llm.tools.available = ["web_search", "calculator", "image_gen", "tts"]
```

### Neuer Endpoint
```
POST /api/chat
Body: { message, conversationHistory, model, provider }
Response: { response, toolsUsed[], generatedMedia[] }
```

### Implementierung: `src/services/tool-registry.ts`

```typescript
// WICHTIG: Das GogoChat Capability-Pattern beibehalten!
// Tools sind nur verfügbar wenn ihre Capability "connected" ist.

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
  requiredCapability?: string; // z.B. "media.image_gen"
}

interface ToolResult {
  success: boolean;
  data: any;
  mediaType?: "image" | "audio" | "text";
  mediaPath?: string;
}

// Registry: Alle verfügbaren Tools
const toolRegistry: Map<string, ToolDefinition> = new Map();

// Tool registrieren
function registerTool(tool: ToolDefinition, handler: Function): void;

// Verfügbare Tools basierend auf aktiven Capabilities filtern
function getAvailableTools(activeCapabilities: string[]): ToolDefinition[];

// Tool ausführen
async function executeTool(name: string, input: object): Promise<ToolResult>;
```

### Implementierung: `src/api/chat.ts` – Tool-Loop

```typescript
// KERNLOGIK: Die Tool-Schleife

async function handleChatMessage(req, res) {
  const { message, history, model, provider } = req.body;

  // 1. Aktive Capabilities prüfen
  const capabilities = await getActiveCapabilities();

  // 2. Verfügbare Tools basierend auf Capabilities
  const availableTools = getAvailableTools(capabilities);

  // 3. Messages aufbauen
  let messages = [...history, { role: "user", content: message }];

  // 4. TOOL-LOOP
  const MAX_ITERATIONS = 10; // Sicherheitslimit
  let iteration = 0;
  let allToolResults = [];
  let generatedMedia = [];

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // LLM aufrufen (Ollama ODER Anthropic ODER LiteLLM)
    const response = await callLLM({
      provider,
      model,
      messages,
      tools: availableTools.length > 0 ? availableTools : undefined
    });

    // Prüfen: Hat das LLM ein Tool aufgerufen?
    if (response.stopReason === "tool_use") {
      // Assistant-Antwort zur History
      messages.push({ role: "assistant", content: response.content });

      // Alle Tool-Aufrufe verarbeiten
      const toolResults = [];
      for (const toolCall of response.toolCalls) {
        const result = await executeTool(toolCall.name, toolCall.input);
        allToolResults.push({ tool: toolCall.name, result });

        if (result.mediaPath) {
          generatedMedia.push({
            type: result.mediaType,
            path: result.mediaPath
          });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(result.data)
        });
      }

      // Tool-Ergebnisse zurück an LLM
      messages.push({ role: "user", content: toolResults });
      // → Schleife geht weiter

    } else {
      // FINALE ANTWORT - Schleife beenden
      return res.json({
        response: response.textContent,
        toolsUsed: allToolResults,
        generatedMedia
      });
    }
  }

  // Sicherheitslimit erreicht
  return res.json({
    response: "Maximale Tool-Iterationen erreicht.",
    toolsUsed: allToolResults,
    generatedMedia
  });
}
```

### Provider-Unterschiede beachten!

```typescript
// WICHTIG: Jeder LLM-Provider hat ein anderes Tool-Format!

// --- ANTHROPIC (Claude) ---
// Tools werden im API-Call als `tools` Parameter übergeben
// Response enthält `content` Blöcke mit type "tool_use"
// Ergebnis geht als "tool_result" Block zurück

// --- OLLAMA ---
// Nur bestimmte Modelle unterstützen Tools (llama3.1, mistral-nemo, etc.)
// Format folgt OpenAI-Standard
// Endpoint: POST /api/chat mit "tools" Parameter
// Response enthält "tool_calls" Array in message

// --- LITELLM ---
// Proxy übersetzt automatisch ins richtige Format
// OpenAI-kompatibles Tool-Format verwenden
// LiteLLM leitet an das jeweilige Backend weiter

async function callLLM({ provider, model, messages, tools }) {
  switch (provider) {
    case "ollama":
      return await callOllama(model, messages, tools);
    case "anthropic":
      return await callAnthropic(model, messages, tools);
    case "litellm":
      return await callLiteLLM(model, messages, tools);
  }
}
```

---

## 2️⃣ BILDGENERIERUNG

### Capability-Pattern
```
Settings: media.image_gen.provider = "stability" | "dalle" | "ollama"
Settings: media.image_gen.api_key = "sk-..." (encrypted)
Settings: media.image_gen.url = "..." (nur bei Ollama/custom)

Test-Endpoint: POST /api/settings/test/image-gen
→ Testet ob API erreichbar ist und Key gültig

Status: media.image_gen → 🟢 connected → "Bilder generieren" Button erscheint
```

### Implementierung: `src/services/image-gen.ts`

```typescript
interface ImageGenRequest {
  prompt: string;
  style?: string;
  size?: string;
  provider: "stability" | "dalle" | "ollama";
}

interface ImageGenResult {
  success: boolean;
  filepath: string;    // Pfad zum gespeicherten Bild
  url: string;         // URL für Frontend
}

async function generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
  switch (req.provider) {
    case "stability":
      // Stability AI API
      // POST https://api.stability.ai/v1/generation/...
      // Body: { text_prompts: [{text, weight}], cfg_scale, steps, ... }
      // Response: base64 Bild → speichern unter /generated/
      break;

    case "dalle":
      // OpenAI DALL-E 3
      // POST https://api.openai.com/v1/images/generations
      // Body: { model: "dall-e-3", prompt, size, quality }
      // Response: URL → herunterladen → speichern unter /generated/
      break;

    case "ollama":
      // Für Modelle wie LLaVA die Bilder verstehen
      // HINWEIS: Ollama kann aktuell KEINE Bilder generieren!
      // Nur Bildverständnis (Vision). Das klar kommunizieren.
      break;
  }
}
```

### Test-Endpoint: `POST /api/settings/test/image-gen`

```typescript
// Genau wie bestehende Test-Endpoints in settings.ts
async function testImageGen(req, res) {
  const { provider, apiKey, url } = req.body;

  try {
    switch (provider) {
      case "stability":
        // GET https://api.stability.ai/v1/engines/list
        // mit Authorization Header → prüft ob Key gültig
        break;

      case "dalle":
        // GET https://api.openai.com/v1/models
        // mit API Key → prüft ob Key gültig
        break;
    }

    return res.json({ success: true, provider });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
}
```

### Als Tool für den Chat:

```typescript
// In tools/image-gen-tool.ts
const imageGenTool: ToolDefinition = {
  name: "generate_image",
  description:
    "Generiert ein Bild basierend auf einer Beschreibung. " +
    "Nutze dies wenn der User ein Bild erstellt haben möchte.",
  input_schema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detaillierte Bildbeschreibung (englisch für beste Ergebnisse)"
      },
      style: {
        type: "string",
        enum: ["photographic", "digital-art", "anime", "comic-book", "3d-model"],
        description: "Gewünschter Bildstil"
      }
    },
    required: ["prompt"]
  },
  requiredCapability: "media.image_gen" // Nur wenn Capability aktiv!
};
```

---

## 3️⃣ TEXT-TO-SPEECH (TTS)

### Capability-Pattern
```
Settings: media.tts.provider = "openai" | "google" | "local"
Settings: media.tts.api_key = "sk-..." (encrypted)
Settings: media.tts.voice = "nova" | "alloy" | ...
Settings: media.tts.language = "de-DE"

Test-Endpoint: POST /api/settings/test/tts
→ Generiert kurzen Test-Audio-Clip

Status: media.tts → 🟢 connected → 🔊 Button bei jeder Nachricht
```

### Implementierung: `src/services/tts.ts`

```typescript
interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  provider: "openai" | "google" | "elevenlabs" | "local";
}

interface TTSResult {
  success: boolean;
  filepath: string;   // /generated/

