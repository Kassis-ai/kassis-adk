/**
 * Files a coding agent reads after `kassis adk sync`.
 */
import fs from 'node:fs';
import path from 'node:path';

function ruleText(lock) {
  const lines = [
    `# ${lock.profileId} ${lock.version}`,
    '',
    `Pinned profile hash: ${lock.hash}`,
    '',
    'Read every guardrail before you edit. Fill `.kassis/attestation.json` before you finish.',
    '',
  ];
  for (const item of lock.guardrails) {
    lines.push(`## ${item.key} (${item.severity})`);
    lines.push('');
    lines.push(item.rule);
    lines.push('');
  }
  return `${lines.join('\n')}`;
}

export function writeAgentRuleFiles(lock, dir) {
  const text = ruleText(lock);
  const targets = [
    path.join(dir, 'AGENTS.md'),
    path.join(dir, '.cursor', 'rules', 'adk-guardrails.mdc'),
    path.join(dir, '.claude', 'CLAUDE.md'),
    path.join(dir, '.github', 'copilot-instructions.md'),
  ];
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return targets;
}
