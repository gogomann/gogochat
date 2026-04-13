# 🍎 GogoChat für macOS starten

## 🚀 Super Einfach - Doppelklick!

### Option 1: `.command` Datei (Empfohlen)
1. **Doppelklick** auf `start.command` im Finder
2. Falls Sicherheitswarnung kommt:
   - Rechtsklick → "Öffnen"
   - Oder: Systemeinstellungen → Datenschutz → "Trotzdem öffnen"
3. Terminal öffnet sich automatisch
4. Browser öffnet automatisch http://localhost:3000

**Stoppen:** `Cmd+C` im Terminal oder Terminal schließen

---

## 📋 Alternative Methoden

### Option 2: Terminal
```bash
cd /Users/mac-gogomann/_dev/__tool/gogo_chat
./start.sh
```

### Option 3: Zwei Terminals (Manuell)

**Terminal 1 - Backend:**
```bash
cd /Users/mac-gogomann/_dev/__tool/gogo_chat
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd /Users/mac-gogomann/_dev/__tool/gogo_chat/client
npm run dev
```

---

## 🛑 Server stoppen

### Schnell:
```bash
pkill -f "tsx watch"
pkill -f "next dev"
```

### Im Terminal:
```
Cmd+C
```

---

## 📊 URLs nach dem Start

- **Frontend (UI):** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/api/health

---

## 🔧 Erste Schritte nach dem Start

1. Browser öffnet automatisch auf http://localhost:3000
2. Klicke auf **Settings** (Zahnrad-Icon)
3. Richte mindestens ein LLM ein:
   - **Ollama:** URL eingeben (z.B. `http://localhost:11434`)
   - **LiteLLM:** URL + API Key
   - **Anthropic:** API Key
4. Wähle ein Modell aus dem Dropdown
5. Chatte los! 💬

---

## 🐛 Probleme?

### "Permission denied" beim Start
```bash
chmod +x start.command
chmod +x start.sh
```

### Port bereits belegt
```bash
# Finde was Port 3000 blockiert
lsof -i :3000

# Finde was Port 3001 blockiert
lsof -i :3001

# Stoppe Prozess
kill -9 <PID>
```

### Server startet nicht
```bash
# Alle Node-Prozesse stoppen
pkill -f node

# Neu starten
./start.command
```

### Datenbank Probleme
```bash
# Datenbank neu erstellen
rm -rf ~/.gogochat/gogochat.db
npm run dev  # Erstellt automatisch neu
```

---

## 📁 Log-Dateien

Wenn Probleme auftreten, schau in die Logs:

```bash
# Backend Log
tail -f backend.log

# Frontend Log
tail -f frontend.log
```

---

## 💡 Tipp: Automator App erstellen

1. Öffne **Automator**
2. Neue **Programm**
3. Aktion: "Shell-Skript ausführen"
4. Inhalt:
   ```bash
   cd /Users/mac-gogomann/_dev/__tool/gogo_chat
   ./start.command
   ```
5. Speichern als: "GogoChat.app"
6. Jetzt hast du eine echte macOS App! 🎉
