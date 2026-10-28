export function decideAgentAction(input) {
    if (input.autonomy === 'suggest')
        return 'suggest';
    if (input.failureThreshold > 0 && input.attestationFailures >= input.failureThreshold) {
        return 'suggest';
    }
    if (!input.hasRun || input.runStatus === 'missing' || input.runStatus === 'failed') {
        return 'approval';
    }
    if (input.finalDecision && input.runStatus !== 'attested')
        return 'approval';
    return 'apply';
}
export function withinBudget(spent, cost, limit) {
    if (!Number.isFinite(spent) || !Number.isFinite(cost) || !Number.isFinite(limit))
        return false;
    if (spent < 0 || cost < 0 || limit < 0)
        return false;
    return spent + cost <= limit;
}
