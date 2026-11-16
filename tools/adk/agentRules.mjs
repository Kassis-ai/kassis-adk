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
  const skills = Array.isArray(lock.skills) ? lock.skills : [];
  if (skills.length > 0) {
    lines.push('## Skills');
    lines.push('');
    lines.push('Read the skill that matches the work before you scaffold or edit that kind.');
    lines.push('');
    for (const skill of skills) {
      const key = typeof skill.key === 'string' ? skill.key : 'skill';
      const title = typeof skill.title === 'string' ? skill.title : key;
      const description =
        typeof skill.description === 'string' ? skill.description : 'See the pinned profile skill body.';
      lines.push(`### ${key}: ${title}`);
      lines.push('');
      lines.push(description);
      lines.push('');
    }
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
