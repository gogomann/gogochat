import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get or create master encryption key
 * Stored at ~/.gogochat/master.key
 */
export function getMasterKey(): Buffer {
  const gogoChatDir = path.join(os.homedir(), '.gogochat');
  const keyPath = path.join(gogoChatDir, 'master.key');

  // Create directory if it doesn't exist
  if (!fs.existsSync(gogoChatDir)) {
    fs.mkdirSync(gogoChatDir, { recursive: true });
  }

  // Create key if it doesn't exist
  if (!fs.existsSync(keyPath)) {
    const key = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, key, { mode: 0o600 }); // Only owner can read/write
    return key;
  }

  return fs.readFileSync(keyPath);
}

/**
 * Encrypt sensitive data (API keys, etc)
 */
export function encrypt(text: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedData: string): string {
  const key = getMasterKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a value looks encrypted
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 &&
         parts[0].length === IV_LENGTH * 2 &&
         parts[1].length === AUTH_TAG_LENGTH * 2;
}
