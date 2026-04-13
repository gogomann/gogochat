# GogoChat — ARBEITSPARIERE.md
> v0.4 · Sofort loslegen · Schritt 0 läuft ohne jede Konfiguration

---

## Projektstruktur

```
gogochat/
  backend/
    src/
      config/
        store.ts          — Config lesen/schreiben aus SQLite
        capabilities.ts   — Was ist gerade verfügbar?
      db/
        sqlite.ts         — SQLite Setup + Schema
        adapter.ts        — DBAdapter Interface
        sqlite-adapter.ts
        postgres-adapter.ts
      llm/
        detect.ts         — LLM-Fallback-Kette
        ollama.ts
        litellm.ts
        anthropic.ts
      modules/
        preHook.ts        — [PRE-HOOK SLOT]
        postHook.ts       — [POST-HOOK SLOT]
      routes/
        chat.ts
        settings.ts       — Settings-Endpunkte + Live-Test
        status.ts
      index.ts
    package.json
  frontend/
    src/
      components/
        StatusBar.tsx
        SettingsPage.tsx
        ConnectionField.tsx   — URL/Key Feld mit live 🟢/🔴
        ChatWindow.tsx
        AdvisorToggle.tsx
        VersionBar.tsx
      hooks/
        useCapabilities.ts    — Was ist verfügbar?
      App.tsx
    package.json
  skills/
    code.json
    data.json
    strategie.json
  db/
    schema-sqlite.sql
    schema-pg-main.sql
    schema-pg-vector.sql
```

---

## Schritt 0A — SQLite Schema (Config + Chat-Daten)

### `db/schema-sqlite.sql`

```sql
-- Config-Store (ersetzt .env komplett)
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  encrypted  INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Projekte
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  context_mode  TEXT DEFAULT 'private',
  created_at    TEXT DEFAULT (datetime('now')),
  closed_at     TEXT,
  archived_path TEXT,
  synced_to_pg  INTEGER DEFAULT 0
);

-- Chats
CREATE TABLE IF NOT EXISTS chats (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id),
  skill           TEXT DEFAULT 'default',
  context_mode    TEXT DEFAULT 'private',
  created_at      TEXT DEFAULT (datetime('now')),
  closed_at       TEXT,
  chain_parent_id TEXT,
  synced_to_pg    INTEGER DEFAULT 0
);

-- Nachrichten (unveränderlich)
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  chat_id      TEXT NOT NULL REFERENCES chats(id),
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  token_count  INTEGER,
  synced_to_pg INTEGER DEFAULT 0
);

-- Git-Versionen
CREATE TABLE IF NOT EXISTS chat_versions (
  id                TEXT PRIMARY KEY,
  chat_id           TEXT NOT NULL REFERENCES chats(id),
  version_number    INTEGER NOT NULL,
  snapshot_messages TEXT NOT NULL,
  label             TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  is_canonical      INTEGER DEFAULT 0,
  synced_to_pg      INTEGER DEFAULT 0
);

-- Steuer-Spalten pro Chat
CREATE TABLE IF NOT EXISTS chat_controls (
  chat_id      TEXT PRIMARY KEY REFERENCES chats(id),
  advisor_on   INTEGER DEFAULT 0,
  context_mode TEXT DEFAULT 'private',
  skill        TEXT DEFAULT 'default',
  backend      TEXT DEFAULT 'auto',
  mcp_servers  TEXT DEFAULT '[]',
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- Projekt-Export / Beweis-Log
CREATE TABLE IF NOT EXISTS project_exports (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL REFERENCES projects(id),
  export_path           TEXT,
  canonical_version_ids TEXT DEFAULT '[]',
  created_at            TEXT DEFAULT (datetime('now')),
  synced_to_pg          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_chat  ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_versions_chat  ON chat_versions(chat_id, version_number);
```

### Initialisieren:

```bash
mkdir -p ~/.gogochat/chats
sqlite3 ~/.gogochat/gogochat.db < db/schema-sqlite.sql
```

---

## Schritt 0B — Backend Setup

### `backend/package.json` (dependencies)

```json
{
  "dependencies": {
    "express": "^4.18",
    "cors": "^2.8",
    "better-sqlite3": "^9",
    "pg": "^8",
    "node-fetch": "^3"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/express": "*",
    "@types/better-sqlite3": "*",
    "@types/pg": "*",
    "tsx": "^4",
    "nodemon": "^3"
  },
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts"
  }
}
```

### `backend/src/config/store.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DB_PATH = path.resolve(
  process.env.GOGOCHAT_DB || path.join(os.homedir(), '.gogochat', 'gogochat.db')
);

let _db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    // Schema inline initialisieren damit kein Pfad-Problem
    _db.exec(fs.readFileSync(path.join(__dirname, '../../../db/schema-sqlite.sql'), 'utf8'));
  }
  return _db;
}

export function configGet(key: string): string | null {
  const row = getDB().prepare('SELECT value FROM config WHERE key = ?').get(key) as any;
  return row?.value ?? null;
}

export function configSet(key: string, value: string, encrypted = false): void {
  getDB().prepare(`
    INSERT INTO config (key, value, encrypted) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(key, value, encrypted ? 1 : 0);
}

export function configAll(): Record<string, string> {
  const rows = getDB().prepare('SELECT key, value FROM config').all() as any[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function configDelete(key: string): void {
  getDB().prepare('DELETE FROM config WHERE key = ?').run(key);
}
```

### `backend/src/config/capabilities.ts`

```typescript
import { configGet } from './store';

export interface Capabilities {
  llm: {
    ollama:    { available: boolean; url?: string; model?: string };
    litellm:   { available: boolean; url?: string };
    anthropic: { available: boolean };
    active:    'ollama' | 'litellm' | 'anthropic' | null;
  };
  db: {
    sqlite:   { available: true; path: string };
    pgMain:   { available: boolean; url?: string };
    pgVector: { available: boolean; url?: string };
    active:   'postgres' | 'sqlite';
  };
  mcp: {
    filesystem: { available: boolean; root?: string };
    browser:    { available: boolean; url?: string };
    // [MCP-SLOT] weiteres MCP-Tool hier ergänzen
  };
  agents: {
    n8n: { available: boolean; url?: string };
    // [AGENT-SLOT]
  };
  features: {
    chat:          boolean;   // min. 1 LLM
    projects:      boolean;   // PG-Main
    memory:        boolean;   // PG-Vector
    fileAccess:    boolean;   // MCP Filesystem
    webAccess:     boolean;   // MCP Browser
    agentFlow:     boolean;   // n8n
    skillSelector: boolean;   // mind. 1 skill/*.json
    // [FEATURE-SLOT]
  };
}

export async function getCapabilities(): Promise<Capabilities> {
  const ollamaUrl    = configGet('llm.ollama.url');
  const litellmUrl   = configGet('llm.litellm.url');
  const anthropicKey = configGet('llm.anthropic.key');
  const pgMainUrl    = configGet('db.pg_main.url');
  const pgVectorUrl  = configGet('db.pg_vector.url');

  const ollamaOk    = ollamaUrl    ? await testOllama(ollamaUrl)       : false;
  const litellmOk   = litellmUrl   ? await testLiteLLM(litellmUrl)     : false;
  const anthropicOk = anthropicKey ? await testAnthropic(anthropicKey) : false;
  const pgMainOk    = pgMainUrl    ? await testPG(pgMainUrl)           : false;
  const pgVectorOk  = pgVectorUrl  ? await testPGVector(pgVectorUrl)   : false;

  const mcpFsEnabled = configGet('mcp.filesystem.enabled') === '1';
  const mcpBrowserUrl = configGet('mcp.browser.url');
  const n8nUrl = configGet('n8n.webhook.url');

  const activeLLM = litellmOk ? 'litellm'
                  : anthropicOk ? 'anthropic'
                  : ollamaOk ? 'ollama'
                  : null;

  return {
    llm: {
      ollama:    { available: ollamaOk,    url: ollamaUrl ?? undefined, model: configGet('llm.ollama.model') ?? undefined },
      litellm:   { available: litellmOk,   url: litellmUrl ?? undefined },
      anthropic: { available: anthropicOk },
      active:    activeLLM,
    },
    db: {
      sqlite:   { available: true, path: configGet('db.sqlite.path') || '~/.gogochat/gogochat.db' },
      pgMain:   { available: pgMainOk,   url: pgMainUrl ?? undefined },
      pgVector: { available: pgVectorOk, url: pgVectorUrl ?? undefined },
      active:   pgMainOk ? 'postgres' : 'sqlite',
    },
    mcp: {
      filesystem: { available: mcpFsEnabled, root: configGet('mcp.filesystem.root') ?? undefined },
      browser:    { available: !!mcpBrowserUrl, url: mcpBrowserUrl ?? undefined },
    },
    agents: {
      n8n: { available: !!n8nUrl, url: n8nUrl ?? undefined },
    },
    features: {
      chat:          !!activeLLM,
      projects:      pgMainOk,
      memory:        pgVectorOk,
      fileAccess:    mcpFsEnabled,
      webAccess:     !!mcpBrowserUrl,
      agentFlow:     !!n8nUrl,
      skillSelector: true,   // Starter-Skills immer vorhanden
    },
  };
}

// ── Live-Test Funktionen ──────────────────────────────────────────────────────

export async function testOllama(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

export async function testLiteLLM(url: string): Promise<boolean> {
  try {
    const key = (await import('./store')).configGet('llm.litellm.key') || '';
    const r = await fetch(`${url}/health`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2000)
    });
    return r.ok;
  } catch { return false; }
}

export async function testAnthropic(key: string): Promise<boolean> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(3000)
    });
    return r.ok;
  } catch { return false; }
}

export async function testPG(url: string): Promise<boolean> {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    return true;
  } catch { return false; }
}

export async function testPGVector(url: string): Promise<boolean> {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    const client = await pool.connect();
    const r = await client.query("SELECT 1 FROM pg_extension WHERE extname='vector'");
    client.release();
    await pool.end();
    return r.rowCount > 0;
  } catch { return false; }
}
```

### `backend/src/routes/settings.ts`

```typescript
import { Router } from 'express';
import { configGet, configSet, configDelete, configAll } from '../config/store';
import { testOllama, testLiteLLM, testAnthropic, testPG, testPGVector, getCapabilities } from '../config/capabilities';

export const settingsRouter = Router();

// Alle Settings lesen (Keys ohne Werte für verschlüsselte)
settingsRouter.get('/', (_, res) => {
  const all = configAll();
  // Keys nie zurückgeben, nur ob gesetzt
  const safe = Object.fromEntries(
    Object.entries(all).map(([k, v]) =>
      k.includes('.key') || k.includes('.password')
        ? [k, v ? '••••••••' : null]
        : [k, v]
    )
  );
  res.json(safe);
});

// Einzelnen Wert setzen + sofort testen
settingsRouter.put('/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!value) { configDelete(key); return res.json({ ok: true, tested: false }); }

  const isSecret = key.includes('.key') || key.includes('.password');
  configSet(key, value, isSecret);

  // Live-Test nach dem Speichern
  let testResult: boolean | null = null;
  let testError: string | null = null;

  try {
    if (key === 'llm.ollama.url')      testResult = await testOllama(value);
    if (key === 'llm.litellm.url')     testResult = await testLiteLLM(value);
    if (key === 'llm.anthropic.key')   testResult = await testAnthropic(value);
    if (key === 'db.pg_main.url')      testResult = await testPG(value);
    if (key === 'db.pg_vector.url')    testResult = await testPGVector(value);
    // [TEST-SLOT] weiteren Test hier ergänzen
  } catch (e: any) {
    testError = e.message;
  }

  res.json({ ok: true, tested: testResult !== null, connected: testResult, error: testError });
});

// Capabilities (was GogoChat aktuell kann)
settingsRouter.get('/capabilities', async (_, res) => {
  const caps = await getCapabilities();
  res.json(caps);
});

// Ollama Modell-Liste (wenn verbunden)
settingsRouter.get('/llm/ollama/models', async (_, res) => {
  const url = configGet('llm.ollama.url');
  if (!url) return res.json({ models: [] });
  try {
    const r = await fetch(`${url}/api/tags`);
    const data: any = await r.json();
    res.json({ models: data.models?.map((m: any) => m.name) || [] });
  } catch { res.json({ models: [] }); }
});
```

### `backend/src/routes/status.ts`

```typescript
import { Router } from 'express';
import { getCapabilities } from '../config/capabilities';

export const statusRouter = Router();

statusRouter.get('/', async (_, res) => {
  const caps = await getCapabilities();
  res.json({
    mode: caps.db.active,
    llm:  caps.llm.active,
    features: caps.features,
    // [STATUS-SLOT]
  });
});
```

### `backend/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { settingsRouter } from './routes/settings';
import { statusRouter }   from './routes/status';
import { getCapabilities } from './config/capabilities';
import { getDB } from './config/store';

const app = express();
app.use(cors());
app.use(express.json());

// DB beim Start initialisieren (SQLite immer)
getDB();

app.use('/api/settings', settingsRouter);
app.use('/api/status',   statusRouter);

// Chat-Router nur wenn LLM verfügbar
app.use('/api/chat', async (req, res, next) => {
  const caps = await getCapabilities();
  if (!caps.features.chat) {
    return res.status(503).json({
      error: 'Kein LLM konfiguriert',
      action: 'settings',   // UI öffnet Settings automatisch
    });
  }
  next();
});
// app.use('/api/chat', chatRouter);   // kommt Schritt 4

app.listen(3001, () => console.log('GogoChat läuft auf :3001'));
```

---

## Schritt 0C — Frontend Setup

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
```

### `frontend/src/hooks/useCapabilities.ts`

```typescript
import { useEffect, useState } from 'react';

export interface Caps {
  llm:      { active: string | null };
  features: Record<string, boolean>;
}

export function useCapabilities() {
  const [caps, setCaps] = useState<Caps | null>(null);

  const refresh = async () => {
    const r = await fetch('http://localhost:3001/api/settings/capabilities');
    setCaps(await r.json());
  };

  useEffect(() => { refresh(); }, []);

  return { caps, refresh };
}
```

### `frontend/src/components/ConnectionField.tsx`

```tsx
import { useState, useRef } from 'react';

interface Props {
  label:       string;
  configKey:   string;
  placeholder: string;
  type?:       'url' | 'password';
  hint?:       string;
}

type Status = 'idle' | 'testing' | 'ok' | 'error';

export function ConnectionField({ label, configKey, placeholder, type = 'url', hint }: Props) {
  const [value,  setValue]  = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error,  setError]  = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const onChange = (v: string) => {
    setValue(v);
    setStatus('idle');
    clearTimeout(timer.current);
    if (!v) return;

    // 800ms debounce → live test
    timer.current = setTimeout(async () => {
      setStatus('testing');
      setError(null);
      try {
        const r = await fetch(`http://localhost:3001/api/settings/${encodeURIComponent(configKey)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: v }),
        });
        const data = await r.json();
        if (data.tested) {
          setStatus(data.connected ? 'ok' : 'error');
          setError(data.error || (data.connected ? null : 'Nicht erreichbar'));
        } else {
          setStatus('ok');  // gespeichert, kein Test für diesen Key
        }
      } catch {
        setStatus('error');
        setError('Backend nicht erreichbar');
      }
    }, 800);
  };

  const dot = status === 'ok'      ? '🟢'
            : status === 'error'   ? '🔴'
            : status === 'testing' ? '⏳'
            : '⬜';

  return (
    <div className="connection-field">
      <label>{label} {dot}</label>
      <input
        type={type === 'password' ? 'password' : 'text'}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {hint   && <span className="hint">{hint}</span>}
      {error  && <span className="error">{error}</span>}
    </div>
  );
}
```

### `frontend/src/components/SettingsPage.tsx`

```tsx
import { ConnectionField } from './ConnectionField';
import { useCapabilities } from '../hooks/useCapabilities';
import { OllamaModelPicker } from './OllamaModelPicker';

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { caps, refresh } = useCapabilities();

  return (
    <div className="settings-page">
      <header>
        <h1>⚙️ GogoChat Einstellungen</h1>
        <button onClick={onClose}>✕</button>
      </header>

      {/* Was GogoChat jetzt kann */}
      <section className="capabilities">
        <h2>Was GogoChat jetzt kann</h2>
        <div className="cap-grid">
          {Object.entries(caps?.features || {}).map(([k, v]) => (
            <span key={k} className={v ? 'cap-on' : 'cap-off'}>
              {v ? '🟢' : '⬜'} {k}
            </span>
          ))}
        </div>
      </section>

      {/* LLM */}
      <section>
        <h2>🤖 LLM-Verbindungen</h2>
        <p className="section-hint">Richte mindestens eine Verbindung ein. GogoChat wählt automatisch die beste.</p>

        <ConnectionField
          label="Ollama (lokal, kein Netz nötig)"
          configKey="llm.ollama.url"
          placeholder="http://localhost:11434"
          hint="Empfohlen für Offline-Nutzung und im Zug"
        />
        {caps?.llm?.ollama?.available && <OllamaModelPicker />}

        <ConnectionField
          label="LiteLLM Proxy"
          configKey="llm.litellm.url"
          placeholder="http://nass.local:4001"
        />
        <ConnectionField
          label="LiteLLM API Key"
          configKey="llm.litellm.key"
          placeholder="sk-..."
          type="password"
        />

        <ConnectionField
          label="Anthropic API Key"
          configKey="llm.anthropic.key"
          placeholder="sk-ant-..."
          type="password"
          hint="Cloud-Fallback wenn Proxy nicht erreichbar"
        />

        {/* [LLM-SLOT] weiteren Anbieter hier hinzufügen */}
      </section>

      {/* Datenbank */}
      <section>
        <h2>🗄️ Datenbank</h2>
        <div className="always-active">🟢 SQLite lokal — immer aktiv (~/.gogochat/gogochat.db)</div>

        <ConnectionField
          label="PostgreSQL Main (Docker)"
          configKey="db.pg_main.url"
          placeholder="postgresql://user:pass@localhost:5432/gogochat_main"
          hint="Freischalten: Projekte, vollständige History, Sync"
        />
        <ConnectionField
          label="PostgreSQL Vector (Docker)"
          configKey="db.pg_vector.url"
          placeholder="postgresql://user:pass@localhost:5433/gogochat_vector"
          hint="Freischalten: Langzeit-Gedächtnis, Semantic Search"
        />
      </section>

      {/* MCP Tools */}
      <section>
        <h2>🔌 MCP Tools</h2>
        <ConnectionField
          label="Filesystem Root-Pfad"
          configKey="mcp.filesystem.root"
          placeholder="/Users/ralf"
          hint="Freischalten: Dateien lesen/schreiben im Chat"
        />
        <ConnectionField
          label="Browser MCP URL"
          configKey="mcp.browser.url"
          placeholder="http://localhost:3100"
          hint="Freischalten: Web-Zugriff im Chat"
        />
        {/* [MCP-SLOT] */}
      </section>

      {/* Agenten */}
      <section>
        <h2>⚙️ Agenten</h2>
        <ConnectionField
          label="n8n Webhook URL"
          configKey="n8n.webhook.url"
          placeholder="http://localhost:5678/webhook/gogochat"
          hint="Freischalten: Agenten-Flows aus dem Chat auslösen"
        />
        {/* [AGENT-SLOT] */}
      </section>
    </div>
  );
}
```

### `frontend/src/components/StatusBar.tsx`

```tsx
import { useCapabilities } from '../hooks/useCapabilities';

export function StatusBar({ onSettingsClick }: { onSettingsClick: () => void }) {
  const { caps } = useCapabilities();
  if (!caps) return <div className="status-bar">Starte...</div>;

  const llmLabel = caps.llm?.active ?? 'kein LLM';
  const dbLabel  = caps.features?.projects ? 'PostgreSQL' : 'SQLite';

  return (
    <div className="status-bar">
      <span className={caps.features?.chat ? 'ok' : 'warn'}>
        {caps.features?.chat ? '🟢' : '🔴'} LLM: {llmLabel}
      </span>
      <span className="ok">🟢 DB: {dbLabel}</span>
      {!caps.features?.memory && <span className="warn">🟡 Vektor: nicht aktiv</span>}
      {caps.features?.fileAccess && <span className="ok">🟢 Dateien</span>}
      {/* [STATUS-SLOT] */}
      <button onClick={onSettingsClick}>⚙️</button>
    </div>
  );
}
```

### `frontend/src/App.tsx`

```tsx
import { useState } from 'react';
import { StatusBar }    from './components/StatusBar';
import { SettingsPage } from './components/SettingsPage';
import { ChatWindow }   from './components/ChatWindow';
import { useCapabilities } from './hooks/useCapabilities';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const { caps } = useCapabilities();

  return (
    <div className="app">
      <StatusBar onSettingsClick={() => setShowSettings(true)} />

      {showSettings && (
        <SettingsPage onClose={() => setShowSettings(false)} />
      )}

      {caps?.features?.chat
        ? <ChatWindow />
        : (
          <div className="no-llm">
            <p>Kein LLM konfiguriert.</p>
            <button onClick={() => setShowSettings(true)}>⚙️ Einstellungen öffnen</button>
          </div>
        )
      }
    </div>
  );
}
```

---

## Starter-Skills (werden automatisch angelegt)

### `skills/code.json`

```json
{
  "id": "code",
  "label": "Code & Tech",
  "icon": "💻",
  "systemPrompt": "Du bist ein präziser technischer Assistent. Antworte auf Deutsch. Nur Lösungen, keine Alternativen. Vollständiger, lauffähiger Code.",
  "tools": []
}
```

### `skills/data.json`

```json
{
  "id": "data",
  "label": "Data & SQL",
  "icon": "📊",
  "systemPrompt": "Du bist ein Data-Engineer Assistent. Fokus auf SQL, BigQuery und Datenstrukturen. Antworte auf Deutsch.",
  "tools": []
}
```

### `skills/strategie.json`

```json
{
  "id": "strategie",
  "label": "Strategie",
  "icon": "🎯",
  "systemPrompt": "Du bist ein kreativer Strategie-Assistent. Denke strukturiert und kreativ. Antworte auf Deutsch.",
  "tools": []
}
```

---

## Starten (Schritt 0 komplett)

```bash
# Backend
cd backend
npm install
npm run dev
# → "GogoChat läuft auf :3001"

# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173

# Ergebnis:
# App öffnet sich, Settings-Seite erscheint weil kein LLM konfiguriert
# Ollama URL eingeben → 800ms → 🟢 → Chat-Fenster erscheint
```

---

## Noch nicht — kommt nach Schritt 0

```
// [SCHRITT 1] ChatWindow + AdvisorToggle + VersionBar implementieren
// [SCHRITT 2] OllamaModelPicker Komponente
// [SCHRITT 3] LLM-Adapter (Ollama · LiteLLM · Anthropic) + Streaming
// [SCHRITT 4] DBAdapter (SQLite · Postgres) + Chat speichern
// [SCHRITT 5] Rollback + Checkpoint vollständig
// [SCHRITT 6] PG-Main Schema + Sync
// [SCHRITT 7] PG-Vector + Memory
// [SCHRITT 8] MCP Filesystem Client
// [SCHRITT 9] Chat-Chaining + Projekt-Export
```
