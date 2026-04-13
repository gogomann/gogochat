import { Router, Request, Response } from 'express';
import {
  createConversation,
  getAllConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  addMessage,
  getMessages,
} from '../db';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// GET /api/conversations - Get all conversations
router.get('/', (req: Request, res: Response) => {
  try {
    const conversations = getAllConversations();
    res.json(conversations);
  } catch (error: any) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/conversations - Create new conversation
router.post('/', (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const conversation = createConversation(title || 'New Chat');
    console.log(`📝 Created conversation: ${conversation.id}`);
    res.json(conversation);
  } catch (error: any) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/conversations/:id - Get single conversation
router.get('/:id', (req: Request, res: Response) => {
  try {
    const conversation = getConversation(req.params.id as string);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/conversations/:id - Update conversation title
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    updateConversationTitle(req.params.id as string, title);
    console.log(`✏️  Renamed conversation ${req.params.id as string} to: ${title}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/conversations/:id - Delete conversation
router.delete('/:id', (req: Request, res: Response) => {
  try {
    deleteConversation(req.params.id as string);
    console.log(`🗑️  Deleted conversation: ${req.params.id as string}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/conversations/:id/messages - Get messages for conversation
router.get('/:id/messages', (req: Request, res: Response) => {
  try {
    const messages = getMessages(req.params.id as string);
    res.json(messages);
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/conversations/:id/messages - Add message to conversation
router.post('/:id/messages', (req: Request, res: Response) => {
  try {
    const { role, content, model } = req.body;
    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    const message = addMessage(req.params.id as string, role, content, model);
    res.json(message);
  } catch (error: any) {
    console.error('Add message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/conversations/:id/export - Export conversation as markdown
router.get('/:id/export', (req: Request, res: Response) => {
  try {
    const conversation = getConversation(req.params.id as string);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = getMessages(req.params.id as string);

    // Create markdown content
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `**Created:** ${new Date(conversation.created_at).toLocaleString()}\n`;
    markdown += `**Updated:** ${new Date(conversation.updated_at).toLocaleString()}\n`;
    markdown += `**ID:** ${conversation.id}\n\n`;
    markdown += `---\n\n`;

    for (const msg of messages) {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n\n`;
      if (msg.model) {
        markdown += `*Model: ${msg.model}*\n\n`;
      }
      markdown += `${msg.content}\n\n`;
      markdown += `---\n\n`;
    }

    // Save to file
    const chatsDir = path.join(os.homedir(), '.gogochat', 'chats');
    if (!fs.existsSync(chatsDir)) {
      fs.mkdirSync(chatsDir, { recursive: true });
    }

    const filename = `${conversation.id}.md`;
    const filepath = path.join(chatsDir, filename);
    fs.writeFileSync(filepath, markdown, 'utf8');

    console.log(`📄 Exported conversation to: ${filepath}`);

    res.json({
      success: true,
      filepath,
      content: markdown,
    });
  } catch (error: any) {
    console.error('Export conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
