#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packed = path.join(here, '../lib/kassis-adk-mcp.mjs');
if (fs.existsSync(packed)) {
  await import(pathToFileURL(packed).href);
} else {
  await import('@kassis/adk-core/cli/kassis-adk-mcp');
}
