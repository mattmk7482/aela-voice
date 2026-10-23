#!/usr/bin/env node
/**
 * MCP server launcher — installs dependencies before the server imports any.
 * This runs as the .mcp.json command. Other processes may install this
 * directory at the same moment; ensureDeps makes that safe.
 */
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureDeps } from '../../lib/ensure-deps.js';

ensureDeps(dirname(fileURLToPath(import.meta.url)));

await import('./server.js');
