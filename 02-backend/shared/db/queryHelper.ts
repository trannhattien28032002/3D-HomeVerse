import { PoolClient, Pool } from 'pg';

// Convert a single snake_case key to camelCase.
function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

// Recursively convert all snake_case keys in a plain object to camelCase.
// Does NOT recurse into Date, Buffer, or non-plain-object values.
export function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    const camelKey = snakeToCamel(key);
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !Buffer.isBuffer(value) &&
      !Array.isArray(value)
    ) {
      result[camelKey] = toCamel(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

export function toCamelRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(toCamel);
}

// Typed query wrapper. Runs sql against the provided client or pool,
// returns rows cast to T with snake_case keys mapped to camelCase.
export async function typedQuery<T>(
  client: PoolClient | Pool,
  sql: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await client.query(sql, params);
  const camelRows = toCamelRows(result.rows as Record<string, unknown>[]) as unknown as T[];
  return { rows: camelRows, rowCount: result.rowCount ?? 0 };
}
