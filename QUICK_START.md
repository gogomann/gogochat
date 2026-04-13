# 🚀 GogoChat Quick Start

## Currently Running Services ✅

### Backend
- **URL:** http://localhost:3001
- **Status:** 🟢 Running
- **Database:** `~/.gogochat/gogochat.db`
- **Encryption Key:** `~/.gogochat/master.key`

### Frontend
- **URL:** http://localhost:3000
- **Status:** 🟢 Running
- **API Connection:** http://localhost:3001

---

## 📍 Quick Links

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend App** | http://localhost:3000 | Main GogoChat UI |
| **Backend Health** | http://localhost:3001/api/health | System status |
| **Settings API** | http://localhost:3001/api/settings | Get all settings |
| **Capabilities** | http://localhost:3001/api/capabilities | Capability status |

---

## ⚡ First Steps

### 1. Open the App
```bash
# Open in browser
open http://localhost:3000
```

### 2. Configure Your First LLM

**Option A: Ollama (Local)**
1. Make sure Ollama is running locally
2. Enter URL: `http://localhost:11434`
3. Wait for 🟢 (auto-test after 800ms)

**Option B: LiteLLM (Proxy)**
1. Enter LiteLLM URL: `http://localhost:4000`
2. Enter API Key: `sk-...`
3. Wait for 🟢

**Option C: Anthropic (Cloud)**
1. Enter API Key: `sk-ant-...`
2. Wait for 🟢

### 3. Start Chatting
- Once 🟢 appears, chat interface unlocks automatically
- No reload needed!

---

## 🧪 Test the API

### Health Check
```bash
curl http://localhost:3001/api/health | jq
```

### Get Settings
```bash
curl http://localhost:3001/api/settings | jq
```

### Test Ollama Connection
```bash
curl -X POST http://localhost:3001/api/settings/test/ollama \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:11434"}' | jq
```

---

## 🛑 Stop Services

### Stop Backend
```bash
# Find process
lsof -i :3001

# Kill
kill <PID>
```

### Stop Frontend
```bash
# Find process
lsof -i :3000

# Kill
kill <PID>
```

---

## 🔄 Restart Services

### Backend
```bash
npm run dev
```

### Frontend
```bash
cd client
npm run dev
```

---

## 📦 Database

### View Config
```bash
sqlite3 ~/.gogochat/gogochat.db "SELECT * FROM config;"
```

### View Tables
```bash
sqlite3 ~/.gogochat/gogochat.db ".tables"
```

### Reset Everything
```bash
# ⚠️ WARNING: Deletes all data!
rm -rf ~/.gogochat/
# Restart backend to regenerate
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Check what's using port 3001
lsof -i :3001

# Check what's using port 3000
lsof -i :3000

# Kill process
kill <PID>
```

### Settings Not Saving
- Check backend logs
- Verify API connection in browser console
- Check CORS headers

### Live Testing Not Working
- Backend must be running
- Check `.env.local` in client: `NEXT_PUBLIC_API_URL=http://localhost:3001`
- Clear browser cache

---

## 📚 Documentation

- [README.md](README.md) - Full documentation
- [PLAN.md](PLAN.md) - Original design document
- [claude.md](claude.md) - Implementation log
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - What's done

---

## 💡 Tips

1. **Auto-Open Settings:** Settings open automatically if no LLM configured
2. **Live Testing:** Type URL → wait 800ms → automatic test
3. **Status Bar:** Click badges to jump to settings
4. **No Save Button:** Successful tests auto-save config
5. **Encryption:** API keys encrypted automatically

---

**Happy Chatting! 🎉**
