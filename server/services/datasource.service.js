// Yeh datasource.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * External data source connectors — ported from the second half of
 * app/api/v1/routes/upload.py (fetch_google_sheet, smart_json_to_df,
 * upload_connect: mysql/postgresql/mssql/json-api/google-sheets).
 *
 * Deviation from the original (noted): mssql (SQL Server) support is
 * not ported — the original used pymssql which has no direct 1:1 Node
 * equivalent installed here; mysql2 and pg (Postgres) are ported and
 * behave the same way. If mssql support is needed later, the `mssql`
 * npm package follows the same connection-string pattern as below.
 */
const fetch = require('node-fetch');
const { smartJsonToRows } = require('../utils/fileParsers');
const { sanitizeForJson } = require('../utils/dataUtils');

/** Mirrors fetch_google_sheet(): 2 of the 3 original strategies (export CSV, gviz/tq). */
async function fetchGoogleSheet(sheetUrl, sheetName = '') {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    const e = new Error('Invalid Google Sheets URL. Could not extract Sheet ID.');
    e.status = 400;
    throw e;
  }
  const sheetId = match[1];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/csv,application/csv,text/plain,*/*',
  };
  const errors = [];

  const { parseCsvBuffer } = require('../utils/fileParsers');

  // Strategy 1: /export?format=csv
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const r = await fetch(url, { headers, redirect: 'follow' });
    const contentType = r.headers.get('content-type') || '';
    if (r.ok && !contentType.includes('text/html')) {
      const buf = Buffer.from(await r.arrayBuffer());
      const { rows, columns } = parseCsvBuffer(buf);
      if (rows.length) return { rows, columns };
    }
  } catch (e) {
    errors.push(`Strategy 1 failed: ${e.message}`);
  }

  // Strategy 2: gviz/tq
  try {
    const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const url = sheetName ? `${base}&sheet=${encodeURIComponent(sheetName)}` : base;
    const r = await fetch(url, { headers, redirect: 'follow' });
    const contentType = r.headers.get('content-type') || '';
    if (r.ok && !contentType.includes('text/html')) {
      const buf = Buffer.from(await r.arrayBuffer());
      const { rows, columns } = parseCsvBuffer(buf);
      if (rows.length) return { rows, columns };
    }
  } catch (e) {
    errors.push(`Strategy 2 failed: ${e.message}`);
  }

  const e = new Error(
    `Failed to fetch Google Sheet. Ensure sheet is public (Anyone with link -> Viewer). Errors: ${errors.join('; ')}`
  );
  e.status = 400;
  throw e;
}

/** Mirrors the `source == "json"` branch of upload_connect(). */
async function fetchJsonApi(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  const data = await res.json();
  let rows = smartJsonToRows(data);
  rows = rows.map((row) => {
    const out = {};
    for (const k of Object.keys(row)) out[String(k).replace(/\./g, '_').trim()] = row[k];
    return out;
  });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

/** Mirrors the mysql/postgresql branches of upload_connect(). */
async function fetchSqlTable({ source, host, port, database, table, username, password }) {
  if (source === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host,
      port: port || 3306,
      user: username,
      password,
      database,
    });
    try {
      const tableName = table || (await firstMysqlTable(conn));
      const [records] = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT 10000`);
      const rows = records;
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return { rows, columns };
    } finally {
      await conn.end();
    }
  }

  if (source === 'postgresql') {
    const { Client } = require('pg');
    const client = new Client({
      host,
      port: port || 5432,
      user: username,
      password,
      database,
    });
    await client.connect();
    try {
      const tableName = table || (await firstPgTable(client));
      const result = await client.query(`SELECT * FROM "${tableName}" LIMIT 10000`);
      const rows = result.rows;
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return { rows, columns };
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported SQL source: ${source} (mssql is not ported yet)`);
}

async function firstMysqlTable(conn) {
  const [tables] = await conn.query('SHOW TABLES');
  if (!tables.length) throw new Error('No tables found in database.');
  return Object.values(tables[0])[0];
}

async function firstPgTable(client) {
  const result = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' LIMIT 1"
  );
  if (!result.rows.length) throw new Error('No tables found in database.');
  return result.rows[0].table_name;
}

/**
 * Top-level dispatcher, mirrors the body of POST /upload/connect in
 * upload.py: routes by `source`, cleans the resulting rows the same
 * way (replace inf with null, stringify object dtype columns), and
 * builds the filename/snapshot fields the route sets on the session.
 */
async function connectExternalSource(payload) {
  const { source, host, port, database, table, username, password, url } = payload;

  let result;
  if (source === 'mysql' || source === 'postgresql' || source === 'mssql') {
    result = await fetchSqlTable({ source, host, port, database, table, username, password });
  } else if (source === 'json') {
    result = await fetchJsonApi(url);
  } else if (source === 'googlesheets') {
    result = await fetchGoogleSheet(url, table || '');
  } else {
    throw new Error(`Unknown source type: ${source}`);
  }

  if (!result.rows.length) {
    throw new Error('The imported dataset is empty.');
  }

  const filename = `${source.charAt(0).toUpperCase() + source.slice(1)} - ${database || String(url || '').slice(0, 15)}`;
  return { rows: result.rows, columns: result.columns, filename };
}

module.exports = { fetchGoogleSheet, fetchJsonApi, fetchSqlTable, connectExternalSource };
