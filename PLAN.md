# GogoChat — PLAN.md
> v0.4 · Ralf · April 2026
> Prinzip: Der User richtet ein was er hat — GogoChat schaltet automatisch frei was möglich ist.

---

## Kern-Paradigma: Capability-driven

**Kein `.env` editieren. Keine YAML-Dateien. Kein Setup-Wissen nötig.**

Der User öffnet die Settings-Seite, gibt URLs und Keys ein, GogoChat testet sofort live
und schaltet Features frei sobald eine Verbindung funktioniert.

```
User gibt ein          →   GogoChat testet sofort   →   Feature erscheint in UI
───────────────────────────────────────────────────────────────────────────────
Ollama URL             →   🟢 verbunden             →   Offline-Chat verfügbar
LiteLLM URL + Key      →   🟢 verbunden             →   Proxy-Chat verfügbar
Anthropic Key          →   🟢 verbunden             →   Cloud-Fallback verfügbar
PG-Main URL            →   🟢 verbunden             →   Projekte + Sync + History
PG-Vector URL          →   🟢 verbunden             →   Memory + Semantic Search
MCP Filesystem         →   🟢 verbunden             →   Datei-Zugriff im Chat
MCP Browser            →   🟢 verbunden             →   Web-Zugriff im Chat
n8n Webhook URL        →   🟢 verbunden             →   Agenten-Flow verfügbar
```

Nichts eingerichtet → GogoChat läuft im Basis-Modus mit SQLite lokal.
Jede neue Verbindung erweitert was möglich ist — ohne Neustart, ohne Reload.

---

## Wo Konfiguration gespeichert wird

Alles landet in SQLite — auch die Verbindungsdaten.
Keine Datei, kein ENV, kein externes Config-Format.

```sql
-- gogochat.db
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT,             -- JSON oder plain Text
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Beispiel-Keys:
```
llm.litellm.url
llm.litellm.key
llm.anthropic.key
llm.ollama.url
llm.ollama.model
db.pg_main.url
db.pg_vector.url
mcp.filesystem.enabled
mcp.filesystem.root
mcp.browser.url
n8n.webhook.url
```

Keys und Anthropic-Key werden verschlüsselt gespeichert (AES-256, Master-Key beim ersten Start generiert).

---

## Capability-Map: Was was freischaltet

```
┌─────────────────────────────────────────────────────────────────────┐
│ IMMER VERFÜGBAR (kein Setup)                                        │
│   SQLite lokal · Basis-Chat · Versionen · Rollback · Flat-Files    │
├─────────────────────────────────────────────────────────────────────┤
│ + Ollama URL         →  Offline-LLM · kein Netz nötig              │
│ + LiteLLM URL/Key    →  Proxy-LLM · alle Modelle                   │
│ + Anthropic Key      →  Cloud-LLM · Fallback                       │
├─────────────────────────────────────────────────────────────────────┤
│ + PG-Main URL        →  Projekte · Sync · vollständige History     │
│ + PG-Vector URL      →  Memory · Semantic Search · Langzeit-Facts  │
├─────────────────────────────────────────────────────────────────────┤
│ + MCP Filesystem     →  Dateien lesen/schreiben im Chat            │
│ + MCP Browser        →  Web-Zugriff im Chat                        │
│ + n8n Webhook        →  Agenten-Flows auslösen                     │
│ + [SLOT] weiteres    →  // CAPABILITY-SLOT                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## LLM-Priorität (automatisch, überschreibbar)

```
Höchste Priorität → Niedrigste Priorität:
  1. LiteLLM Proxy   (wenn konfiguriert + erreichbar)
  2. Anthropic direkt (wenn konfiguriert + erreichbar)
  3. Ollama lokal    (wenn konfiguriert + erreichbar)
  4. [SLOT] llama.cpp
  → kein LLM: Chat gesperrt, Settings-Seite öffnet sich automatisch
```

User kann in der UI manuell eine andere Priorität wählen.
GogoChat merkt sich die Wahl pro Kontext-Modus (Private vs. Business).

---

## Settings-Seite

Jederzeit erreichbar über ⚙️ Icon. Keine Seite verlassen, kein Neustart.

### Aufbau der Settings-Seite:

```
Settings
├── LLM-Verbindungen
│   ├── Ollama          [URL-Feld] [🟢/🔴 live] [Modell-Picker erscheint wenn 🟢]
│   ├── LiteLLM Proxy   [URL-Feld] [Key-Feld] [🟢/🔴 live]
│   ├── Anthropic       [Key-Feld] [🟢/🔴 live]
│   └── // [LLM-SLOT] weiteren Anbieter hier registrieren
│
├── Datenbank
│   ├── SQLite (lokal)  [immer aktiv, Pfad anzeigen]
│   ├── PostgreSQL Main [URL-Feld] [🟢/🔴 live] [Sync-Status]
│   └── PostgreSQL Vektor [URL-Feld] [🟢/🔴 live]
│
├── MCP Tools
│   ├── Filesystem      [Toggle] [Root-Pfad-Feld] [🟢/🔴 live]
│   ├── Browser         [URL-Feld] [🟢/🔴 live]
│   └── // [MCP-SLOT] weiteren MCP-Server hier registrieren
│
├── Agenten
│   ├── n8n             [Webhook-URL-Feld] [🟢/🔴 live]
│   └── // [AGENT-SLOT]
│
└── Was GogoChat jetzt kann
    [Capability-Übersicht: grüne Liste was aktiv ist]
```

### Live-Test beim Tippen:

```
User tippt URL → 800ms debounce → Backend testet Verbindung →
  🟢 + Feature erscheint sofort in UI
  🔴 + kurze Fehlermeldung (timeout / auth / unreachable)
```

Kein Speichern-Button nötig für Tests. Explizites "Speichern" nur für Keys (Sicherheit).

---

## Status-Bar (immer sichtbar im Chat)

```
┌──────────────────────────────────────────────────────┐
│ 🟢 LiteLLM  │ 🟢 PostgreSQL  │ 🟡 Vektor  │ ⚙️     │
└──────────────────────────────────────────────────────┘
```

Klick auf ⚙️ öffnet Settings. Klick auf 🟡 springt direkt zur fehlenden Verbindung.

---

## Schritt 0 — Basis läuft (kein Setup nötig)

GogoChat startet. SQLite wird automatisch angelegt. Kein LLM konfiguriert →
Settings-Seite öffnet sich mit Hinweis: "Richte mindestens ein LLM ein um loszulegen."

**Fertig wenn:**
- [ ] App startet ohne Konfiguration
- [ ] Settings-Seite zeigt alle Felder leer
- [ ] SQLite wird automatisch unter `~/.gogochat/gogochat.db` angelegt
- [ ] Hinweis "Kein LLM konfiguriert" sichtbar

---

## Schritt 1 — Erstes LLM einrichten (Ollama)

User gibt Ollama-URL ein → live Test → 🟢 → Chat-Seite wird freigeschaltet.

**Fertig wenn:**
- [ ] URL eingeben → innerhalb 1 Sekunde 🟢 oder 🔴
- [ ] Bei 🟢: Chat-Fenster erscheint, Modell-Liste lädt
- [ ] Erster Chat funktioniert, landet in SQLite

---

## Schritt 2 — Weitere LLMs (optional, additiv)

Jede weitere LLM-Verbindung erscheint als Option im Backend-Switch der Status-Bar.

---

## Schritt 3 — PostgreSQL (optional, additiv)

User gibt PG-Main URL ein → 🟢 → Projekte-Feature erscheint, Sync startet.
User gibt PG-Vector URL ein → 🟢 → Memory-Feature erscheint in Chat-UI.

---

## Schritt 4 — MCP Tools (optional, additiv)

User aktiviert MCP Filesystem → Root-Pfad-Feld erscheint → 🟢 → Tool-Badge in Chat.

---

## Schritt 5 — Chat-UI (Basis)

```
<StatusBar>      — immer oben
<ChatWindow>     — nur sichtbar wenn min. 1 LLM konfiguriert
<AdvisorToggle>  — erster Schalter
<VersionBar>     — Checkpoint + Rollback
<SettingsButton> — ⚙️ immer erreichbar
```

---

## Schritt 6 — Features die mit Capabilities erscheinen

| Capability | UI-Element das erscheint |
|---|---|
| Ollama / LiteLLM / Anthropic | Chat-Fenster |
| PG-Main | Projekte-Panel, Sync-Badge |
| PG-Vector | Memory-Toggle im Chat |
| MCP Filesystem | Datei-Badge, Tool-Calls sichtbar |
| MCP Browser | Web-Badge |
| n8n | Agenten-Panel |
| Skills JSON | Skill-Selector |
| [SLOT] | // UI-SLOT |

---

## Schritt 7 — Skills, Chaining, Export

Wie v0.3 — aber Skills erscheinen im Selector erst wenn `/skills/` Verzeichnis
mindestens eine JSON-Datei enthält. GogoChat legt 3 Starter-Skills automatisch an.

---

## Offene Slots

```
// [LLM-SLOT]        weiteren LLM-Anbieter registrieren
// [MCP-SLOT]        weiteren MCP-Server registrieren
// [AGENT-SLOT]      weiteren Agenten-Typ registrieren
// [CAPABILITY-SLOT] weiteres Feature konditionell freischalten
// [UI-SLOT]         weiteres Panel konditionell einblenden
```
