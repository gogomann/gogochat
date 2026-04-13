import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

interface InstallRequest {
  command: string;
  mcpName: string;
}

/**
 * Install an MCP tool via npm/npx
 * POST /api/mcp/install
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { command, mcpName } = req.body as InstallRequest;

    if (!command || !mcpName) {
      return res.status(400).json({
        success: false,
        error: 'Missing command or mcpName',
      });
    }

    // Security: Only allow npm and npx commands (allow shell operators for chaining)
    const cleanCommand = command.replace(/\s+/g, ' ').trim();
    if (!cleanCommand.match(/^(npm|npx)(\s|$)/)) {
      return res.status(400).json({
        success: false,
        error: 'Only npm and npx commands are allowed',
      });
    }

    console.log(`Installing MCP: ${mcpName}`);
    console.log(`Command: ${cleanCommand}`);

    // Execute the install command with bash shell
    const { stdout, stderr } = await execAsync(cleanCommand, {
      timeout: 60000, // 60 seconds timeout
      shell: '/bin/bash',
    });

    console.log(`MCP Install Output: ${stdout}`);
    if (stderr && !stderr.includes('npm WARN')) {
      console.error(`MCP Install Stderr: ${stderr}`);
    }

    // Consider it success if no error was thrown (even with stderr warnings)
    return res.json({
      success: true,
      output: stdout,
      stderr: stderr || undefined,
    });
  } catch (error: any) {
    console.error('MCP installation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Installation failed',
      details: error.stderr || error.stdout,
    });
  }
});

export default router;
