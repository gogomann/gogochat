import { Router } from 'express';
import { getDatabase } from '../db';
import { CapabilityState, Capability, CapabilityStatus } from '../types';

const router = Router();

/**
 * Update capability status
 */
function updateCapabilityStatus(
  capability: Capability,
  status: CapabilityStatus,
  message?: string
) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO capability_status (capability, status, message, last_checked)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(capability) DO UPDATE SET
      status = excluded.status,
      message = excluded.message,
      last_checked = datetime('now')
  `);

  stmt.run(capability, status, message || null);
}

/**
 * Get all capability statuses
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM capability_status');
    const capabilities = stmt.all() as CapabilityState[];

    res.json(capabilities);
  } catch (error) {
    console.error('Error getting capabilities:', error);
    res.status(500).json({ error: 'Failed to get capabilities' });
  }
});

/**
 * Update capability status
 */
router.post('/update', (req, res) => {
  const { capability, status, message } = req.body;

  if (!capability || !status) {
    return res.status(400).json({ error: 'Capability and status are required' });
  }

  try {
    updateCapabilityStatus(capability, status, message);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating capability:', error);
    res.status(500).json({ error: 'Failed to update capability' });
  }
});

export default router;
