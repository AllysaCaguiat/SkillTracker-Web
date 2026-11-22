import pg from 'pg';
import 'dotenv/config';

// Neon supplies a PostgreSQL connection string; use its pooled URL for deployments.
pg.types.setTypeParser(20, value => Number(value)); // COUNT(*) returns numbers
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 10000,
});

// Small compatibility layer preserves existing app logic while converting SQL syntax.
export function toPostgres(sql) {
  let n = 0;
  return sql
    .replace(/INSERT\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    .replace(/\?/g, () => `$${++n}`)
    .replace(/"student"/g, "'student'")
    .replace(/\bpublished\s*=\s*1\b/gi, 'published = TRUE')
    .replace(/\bpublished\s*=\s*0\b/gi, 'published = FALSE')
    .replace(/\bVALUES\s*\(([^)]*)\)/gi, (m, values) => 'VALUES(' + values.replace(/,\s*0\s*$/,' , FALSE').replace(/,\s*1\s*$/,' , TRUE') + ')');
}
function statement(sql) {
  let converted = toPostgres(sql);
  if (/^\s*INSERT\s+INTO\s+/i.test(converted)) {
    if (/\bINSERT\s+INTO\s+enrollments\b|\bINSERT\s+INTO\s+lesson_progress\b/i.test(converted) && /INSERT\s+IGNORE/i.test(sql)) converted += ' ON CONFLICT DO NOTHING';
    // Insert ID is needed by existing routes; RETURNING supports PG identity IDs.
    if (!/\bRETURNING\b/i.test(converted)) converted += /\bINSERT\s+INTO\s+lesson_progress\b/i.test(converted) ? ' RETURNING user_id' : ' RETURNING id';
  }
  return converted;
}
async function perform(client, sql, params = []) {
  const result = await client.query(statement(sql), params);
  if (/^\s*INSERT\s+INTO/i.test(sql)) return {insertId: result.rows[0]?.id ?? null, affectedRows: result.rowCount};
  if (/^\s*(UPDATE|DELETE)/i.test(sql)) return {affectedRows: result.rowCount};
  return result.rows;
}
export async function rows(sql, params = []) { return perform(pool, sql, params); }
export const db = {
  async query(sql, params = []) { return [await perform(pool, sql, params)]; },
  async execute(sql, params = []) { return [await perform(pool, sql, params)]; },
  async getConnection() {
    const client = await pool.connect();
    return {
      async beginTransaction() { await client.query('BEGIN'); },
      async commit() { await client.query('COMMIT'); },
      async rollback() { await client.query('ROLLBACK'); },
      async query(sql, params = []) { return [await perform(client, sql, params)]; },
      async execute(sql, params = []) { return [await perform(client, sql, params)]; },
      release() { client.release(); },
    };
  },
  async end() { await pool.end(); },
};
