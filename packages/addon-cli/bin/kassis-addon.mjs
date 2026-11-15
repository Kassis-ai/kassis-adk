#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packed = path.join(here, '../lib/kassis-addon.mjs');
const source = path.resolve(here, '../../../tools/adk/kassis-addon.mjs');
const target = fs.existsSync(packed) ? packed : source;
await import(pathToFileURL(target).href);
