#!/bin/bash

# GogoChat Starter für macOS
# Doppelklick auf diese Datei startet GogoChat

# Wechsel ins richtige Verzeichnis
cd "$(dirname "$0")"

echo "🚀 Starting GogoChat..."
echo ""

# Kill any existing processes
echo "🛑 Stopping existing servers..."
pkill -f "tsx watch" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

# Start Backend (Port 3001)
echo "📡 Starting Backend API (Port 3001)..."
npm run dev > backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

# Start Frontend (Port 3000)
echo "🎨 Starting Frontend (Port 3000)..."
cd client
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 3

echo ""
echo "✅ GogoChat läuft!"
echo ""
echo "📊 Backend API:  http://localhost:3001"
echo "🎨 Frontend:     http://localhost:3000"
echo ""
echo "Backend Log:  tail -f backend.log"
echo "Frontend Log: tail -f frontend.log"
echo ""
echo "Drücke Ctrl+C um alle Server zu stoppen"
echo ""

# Open Browser automatically on Mac
echo "🌐 Öffne Browser..."
sleep 2
open http://localhost:3000

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -f 'tsx watch'; pkill -f 'next dev'; echo '✅ Stopped'; exit" INT

# Keep script running
wait
