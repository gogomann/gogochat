import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { ConfigEntry } from '../types';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto';

let db: Database.Database;

/**
 * Initialize SQLite database
 * Creates DB at ~/.gogochat/gogochat.db
 */
export function initDatabase(): Database.Database {
  const gogoChatDir = path.join(os.homedir(), '.gogochat');

  // Create directory if it doesn't exist
  if (!fs.existsSync(gogoChatDir)) {
    fs.mkdirSync(gogoChatDir, { recursive: true });
  }

  const dbPath = path.join(gogoChatDir, 'gogochat.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables
  createTables();

  return db;
}

/**
 * Create database tables
 */
function createTables() {
  // Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Messages table (for chat history)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      reasoning TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Capabilities status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS capability_status (
      capability TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      message TEXT,
      last_checked TEXT DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// ============================================================================
// Conversation Operations
// ============================================================================

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  reasoning?: string;
  created_at: string;
}

export function createConversation(title: string = 'New Chat'): Conversation {
  const id = `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const stmt = db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `);
  stmt.run(id, title);

  return {
    id,
    title,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function getAllConversations(): Conversation[] {
  const stmt = db.prepare(`
    SELECT * FROM conversations
    ORDER BY updated_at DESC
  `);
  return stmt.all() as Conversation[];
}

export function getConversation(id: string): Conversation | undefined {
  const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  return stmt.get(id) as Conversation | undefined;
}

export function updateConversationTitle(id: string, title: string): void {
  const stmt = db.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(title, id);
}

export function deleteConversation(id: string): void {
  // Delete all messages first
  const deleteMessages = db.prepare('DELETE FROM messages WHERE conversation_id = ?');
  deleteMessages.run(id);

  // Delete conversation
  const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ?');
  deleteConv.run(id);
}

export function addMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string, model?: string): Message {
  const stmt = db.prepare(`
    INSERT INTO messages (conversation_id, role, content, model, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  const result = stmt.run(conversationId, role, content, model);

  // Update conversation timestamp
  const updateStmt = db.prepare(`
    UPDATE conversations
    SET updated_at = datetime('now')
    WHERE id = ?
  `);
  updateStmt.run(conversationId);

  return {
    id: result.lastInsertRowid as number,
    conversation_id: conversationId,
    role,
    content,
    model,
    created_at: new Date().toISOString(),
  };
}

export function getMessages(conversationId: string): Message[] {
  const stmt = db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(conversationId) as Message[];
}

// ============================================================================
// Config Operations
// ============================================================================

/**
 * Set config value (plain text, no encryption)
 */
export function setConfig(key: string, value: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO config (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `);

  stmt.run(key, value);
}

/**
 * Get config value (plain text)
 */
export function getConfig(key: string): string | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
  const row = stmt.get(key) as ConfigEntry | undefined;

  if (!row) return null;

  return row.value;
}

/**
 * Get all config entries (plain text)
 */
export function getAllConfig(): Record<string, string> {
  const db = getDatabase();
  const stmt = db.prepare('SELECT key, value FROM config');
  const rows = stmt.all() as ConfigEntry[];

  const config: Record<string, string> = {};

  for (const row of rows) {
    config[row.key] = row.value;
  }

  return config;
}

/**
 * Delete config entry
 */
export function deleteConfig(key: string): void {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM config WHERE key = ?');
  stmt.run(key);
}

/**
 * Get database path
 */
export function getDatabasePath(): string {
  return path.join(os.homedir(), '.gogochat', 'gogochat.db');
}
