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
export declare function decideAgentAction(input: {
    hasRun: boolean;
    runStatus: 'missing' | 'active' | 'attested' | 'failed';
    finalDecision: boolean;
    attestationFailures: number;
    failureThreshold: number;
    autonomy: AgentAutonomy;
}): AgentEffect;
export declare function withinBudget(spent: number, cost: number, limit: number): boolean;
