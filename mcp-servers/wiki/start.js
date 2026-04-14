#!/usr/bin/env node
/**
 * Wiki MCP server launcher — ensures node_modules exists before starting.
 * This runs as the .mcp.json command, so it executes before the server imports anything.
 */
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!existsSync(join(__dirname, 'node_modules'))) {
  execSync('npm install --omit=dev', { cwd: __dirname, stdio: 'ignore' });
}

await import('./server.js');
