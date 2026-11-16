import { createKadkIssue } from '@kassis/addon-sdk';

/**
 * Same shape as the host AddonContextError: a catalogued KADK refusal for offline tests.
 */
export class TestContextError extends Error {
  /**
   * @param {import('@kassis/addon-sdk').KadkCode} code
   * @param {string} path
   * @param {import('@kassis/addon-sdk').KadkTemplateValues} [values]
   */
  constructor(code, path, values = {}) {
    const issue = createKadkIssue(code, path, values);
    super(`${code}: ${issue.message}`);
    this.name = 'TestContextError';
    this.code = code;
    this.issue = issue;
  }
}