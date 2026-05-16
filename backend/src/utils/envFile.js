import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ENV_PATH = path.resolve(process.cwd(), '..', '.env');

function envFilePath() {
  return process.env.MEDIAHUB_ENV_FILE_PATH || DEFAULT_ENV_PATH;
}

function parseEnvFile(filePath = envFilePath()) {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value.replace(/\\n/g, '\n');
  }
  return values;
}

function quoteEnv(value) {
  return JSON.stringify(String(value ?? ''));
}

function writeEnvValues(updates, filePath = envFilePath()) {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const seen = new Set();
  const lines = existing.split(/\r?\n/).filter((line, index, arr) => index < arr.length - 1 || line !== '');
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !(match[1] in updates)) return line;
    const key = match[1];
    seen.add(key);
    return `${key}=${quoteEnv(updates[key])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${quoteEnv(value)}`);
  }
  writeFileSync(filePath, `${nextLines.join('\n')}\n`);
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = String(value ?? '');
  }
}

export { envFilePath, parseEnvFile, writeEnvValues };
