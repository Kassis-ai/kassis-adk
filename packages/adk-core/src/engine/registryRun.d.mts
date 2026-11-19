export function submitCertifiedRun(input: {
  instance: string;
  token: string;
  agentId: string;
  profileCode: string;
  answers: readonly object[];
  fetchImpl: typeof fetch;
}): Promise<{ runId: string }>;
