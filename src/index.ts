import express from 'express';
import cors from 'cors';
import { initDatabase, getDatabasePath } from './db';
import { initializeTools } from './services/initialize-tools';
import settingsRouter from './api/settings';
import capabilitiesRouter from './api/capabilities';
import chatRouter from './api/chat';
import conversationsRouter from './api/conversations';
import mcpRouter from './api/mcp';
import mcpManagerRouter from './api/mcp-manager';
import toolsRouter from './api/tools';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
console.log('🗄️  Initializing database...');
initDatabase();
console.log(`✅ Database initialized at: ${getDatabasePath()}`);

// Initialize Tool Registry (parallel zu MCP!)
initializeTools();

// Routes
app.use('/api/settings', settingsRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/mcp', mcpRouter); // MCP one-click install
app.use('/api/mcp-manager', mcpManagerRouter); // MCP health/status/tools
app.use('/api/tools', toolsRouter); // Tool Registry API

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: getDatabasePath(),
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 GogoChat API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`⚙️  Settings API: http://localhost:${PORT}/api/settings`);
  console.log(`\n💡 Next: Set up your first LLM in the settings!\n`);
});
