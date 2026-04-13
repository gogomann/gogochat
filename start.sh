#!/bin/bash

# GogoChat Starter Script
# Starts both Backend (Port 3001) and Frontend (Port 3000)

echo "🚀 Starting GogoChat..."
echo ""

# Kill any existing processes
echo "🛑 Stopping existing servers..."
pkill -f "tsx watch" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

# Start Backend (Port 3001)
echo "📡 Starting Backend API (Port 3001)..."
npm run dev &
BACKEND_PID=$!
sleep 2

# Start Frontend (Port 3000)
echo "🎨 Starting Frontend (Port 3000)..."
cd client
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ GogoChat is running!"
echo ""
echo "📊 Backend API:  http://localhost:3001"
echo "🎨 Frontend:     http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -f 'tsx watch'; pkill -f 'next dev'; echo '✅ Stopped'; exit" INT

# Keep script running
wait
