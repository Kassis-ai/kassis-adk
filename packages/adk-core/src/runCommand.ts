import path from 'node:path';
import type { CommandRequest, CommandResult } from './types.ts';
import { failure } from './issues.ts';
import {
  attestProject,
  buildProject,
  certifyProject,
  checkProject,
  conformanceProject,
  explainProject,
  initProject,
  keysProject,
  packProject,
  rulesProject,
  signProject,
  syncProject,
  testProject,
} from './projectCommands.ts';
import { startDevHost } from './devHost.ts';
import { migrateProject } from './migrateCommand.ts';
import { doctorProject } from './doctor.ts';
import { scaffoldProject } from './scaffoldFeature.ts';
import { deployProject, packageProject, sbomProject, statusProject } from './packageCommand.ts';

function projectDir(request: CommandRequest): string {
  if (request.flags.dir) return path.resolve(request.cwd, request.flags.dir);
  if (request.command === 'init' && request.flags.id)
    return path.resolve(request.cwd, request.flags.id);
  return path.resolve(request.cwd);
}

/** Runs one CLI command. Printing and process exit stay in the CLI. */
export async function runCommand(request: CommandRequest): Promise<CommandResult> {
  const dir = projectDir(request);
  const flags = request.flags;
  switch (request.command) {
    case 'init':
      return initProject(flags.id, dir, flags.publisher, flags.tier, flags.rung);
    case 'check':
      return checkProject(dir);
    case 'conformance':
      return conformanceProject(dir);
    case 'explain':
      return explainProject(request.positional);
    case 'sync':
      return syncProject(
        dir,
        flags.profile,
        flags.instance,
        flags.from ? path.resolve(request.cwd, flags.from) : ''
      );
    case 'attest':
      return attestProject(dir);
    case 'rules':
      return rulesProject(dir);
    case 'pack':
      return packProject(dir, flags.out ? path.resolve(request.cwd, flags.out) : '');
    case 'package':
      return packageProject(dir, flags.out, request.cwd);
    case 'sbom':
      return sbomProject(dir);
    case 'deploy':
      return deployProject(dir, flags.instance, request.positional, request.cwd);
    case 'status':
      return statusProject(flags.instance);
    case 'certify':
      return certifyProject(dir);
    case 'build':
      return buildProject(dir, flags.only, request.onLog);
    case 'test':
      return testProject(dir, request.onLog);
    case 'sign':
      return signProject(dir, flags.key ? path.resolve(request.cwd, flags.key) : '', request.onLog);
    case 'keys':
      return keysProject(
        request.subcommand,
        flags.publisher,
        flags.key ? path.resolve(request.cwd, flags.key) : '',
        flags.out ? path.resolve(request.cwd, flags.out) : '',
        flags.instance
      );
    case 'dev':
      return startDevHost(dir, request.imageFlag, request.followLogs, request.onLog);
    case 'migrate':
      return migrateProject(dir, request.subcommand, flags.target);
    case 'doctor':
      return doctorProject(dir, { requirements: request.requirements });
    case 'scaffold':
      return scaffoldProject({
        dir,
        kind: flags.kind,
        id: flags.id,
        name: flags.name,
        publisher: flags.publisher,
        tier: flags.tier,
        rung: flags.rung,
      });
    default:
      return failure(`Unknown command ${request.command}`, 'Run kassis-addon --help.');
  }
}
