/**
 * Manifest check and static conformance for one addon directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkAddonImports } from '@kassis/addon-testkit';

/**
 * @param {string} addonDir
 * @returns {string[]}
 */
export function conformanceIssues(addonDir) {
  const issues = checkAddonImports(addonDir).map(
    (issue) => `${issue.code} ${issue.file}:${issue.line} imports '${issue.specifier}'`
  );
  const migrations = path.join(addonDir, 'migrations');
  if (fs.existsSync(migrations)) {
    for (const name of fs.readdirSync(migrations)) {
      if (!name.endsWith('.up.sql')) continue;
      const down = name.replace(/\.up\.sql$/, '.down.sql');
      const upText = fs.readFileSync(path.join(migrations, name), 'utf8');
      if (!fs.existsSync(path.join(migrations, down)) && !upText.includes('irreversible:')) {
        issues.push(`${name} has no down script`);
      }
    }
  }
  return issues;
}