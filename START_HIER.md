# GogoChat - Server starten

## 🚀 Schnellstart (Empfohlen)

```bash
./start.sh
```

Das Script startet automatisch:
- **Backend API** auf Port 3001
- **Frontend** auf Port 3000

Drücke `Ctrl+C` um beide Server zu stoppen.

---

## 📋 Manuell starten

### Option 1: Beide Server in einem Terminal

```bash
# Backend starten (Port 3001)
npm run dev &

# Frontend starten (Port 3000)
cd client && npm run dev
```

### Option 2: Zwei separate Terminals

**Terminal 1 - Backend:**
```bash
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

---

## 🛑 Server stoppen

### Schnellstart-Script:
```bash
Ctrl+C im Terminal
```

### Manuell alle stoppen:
```bash
pkill -f "tsx watch"
pkill -f "next dev"
```

### Nur Backend stoppen:
```bash
pkill -f "tsx watch"
```

### Nur Frontend stoppen:
```bash
pkill -f "next dev"
```

---

## 📊 URLs

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/api/health
- **Settings API:** http://localhost:3001/api/settings
- **MCP Manager:** http://localhost:3001/api/mcp-manager/status

---

## ⚙️ Was läuft wo?

### Backend (Port 3001)
- Express.js Server
- SQLite Datenbank (`~/.gogochat/gogochat.db`)
- API Endpoints:
  - `/api/chat` - User Chat
  - `/api/settings` - Einstellungen
  - `/api/mcp` - MCP Installation
  - `/api/mcp-manager` - MCP Status/Tools
  - `/api/conversations` - Conversations
  - `/api/capabilities` - System Features

### Frontend (Port 3000)
- Next.js 16 App
- React UI
- Tailwind CSS
- Zustand State Management

---

## 🐛 Probleme?

### Port schon belegt
```bash
# Finde Prozess auf Port 3001
lsof -i :3001

# Finde Prozess auf Port 3000
lsof -i :3000

# Stoppe mit PID
kill <PID>
```

### Server reagiert nicht
```bash
# Alles stoppen und neu starten
pkill -f "tsx watch"
pkill -f "next dev"
./start.sh
```

### Datenbank Probleme
```bash
# Datenbank-Pfad anzeigen
cat ~/.gogochat/gogochat.db

# Bei Problemen: Datenbank neu erstellen
rm -rf ~/.gogochat/gogochat.db
npm run dev  # Erstellt DB automatisch neu
```
