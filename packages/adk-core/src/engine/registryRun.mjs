/**
 * When KASSIS_ADK_INSTANCE is set, certify starts a registry run and submits the attestation.
 */
export async function submitCertifiedRun(input) {
  const base = String(input.instance).replace(/\/$/, '');
  const headers = {
    'content-type': 'application/json',
    Authorization: `Bearer ${input.token}`,
  };
  const fetchImpl = input.fetchImpl;
  const started = await fetchImpl(`${base}/api/v1/agent-registry/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      profileCode: input.profileCode,
      agentId: input.agentId,
      agentKind: 'coding',
      correlationId: null,
    }),
  });
  if (!started.ok) {
    throw new Error(`Run start failed (${started.status})`);
  }
  const startedBody = await started.json();
  const runId = startedBody?.data?.id ?? startedBody?.id;
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error('Run start did not return an id');
  }
  const attested = await fetchImpl(`${base}/api/v1/agent-registry/runs/${runId}/attest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ answers: input.answers }),
  });
  if (!attested.ok) {
    throw new Error(`Run attest failed (${attested.status})`);
  }
  return { runId };
}
