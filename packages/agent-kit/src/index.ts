/**
 * Decisions for a task agent. The host passes the failure threshold from settings.
 */
export type AgentAutonomy = 'act' | 'suggest';

export type AgentKitManifest = {
  id: string;
  profileCode: string;
  autonomy: AgentAutonomy;
};

export type AgentEffect = 'apply' | 'approval' | 'suggest';

export function decideAgentAction(input: {
  hasRun: boolean;
  runStatus: 'missing' | 'active' | 'attested' | 'failed';
  finalDecision: boolean;
  attestationFailures: number;
  failureThreshold: number;
  autonomy: AgentAutonomy;
}): AgentEffect {
  if (input.autonomy === 'suggest') return 'suggest';
  if (input.failureThreshold > 0 && input.attestationFailures >= input.failureThreshold) {
    return 'suggest';
  }
  if (!input.hasRun || input.runStatus === 'missing' || input.runStatus === 'failed') {
    return 'approval';
  }
  if (input.finalDecision && input.runStatus !== 'attested') return 'approval';
  return 'apply';
}

export function withinBudget(spent: number, cost: number, limit: number): boolean {
  if (!Number.isFinite(spent) || !Number.isFinite(cost) || !Number.isFinite(limit)) return false;
  if (spent < 0 || cost < 0 || limit < 0) return false;
  return spent + cost <= limit;
}
