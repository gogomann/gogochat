import { LLMTestResult } from '../types';
import pg from 'pg';

const { Pool } = pg;

/**
 * Test PostgreSQL connection
 */
export async function testPostgres(url: string): Promise<LLMTestResult> {
  let pool: pg.Pool | null = null;

  try {
    pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });

    // Simple query to test connection
    await pool.query('SELECT NOW()');

    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error' };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
