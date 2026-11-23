export { assertNoHostImports, checkAddonImports } from './checkAddonImports.mjs';
export { checkAddonTierRefusals } from './checkAddonTierRefusals.mjs';
export type CertifyReport = {
    ok: true;
};
/**
 * @typedef {object} CertifyReport
 * @property {true} ok
 */
/**
 * @param {string} dir
 * @returns {CertifyReport}
 */
export declare function assertEvidencePack(dir: string): CertifyReport;
export { createTestContext } from './createTestContext.mjs';
