/**
 * @typedef {object} CertifyReport
 * @property {true} ok
 */
/**
 * @param {string} dir
 * @returns {CertifyReport}
 */
export function assertEvidencePack(dir: string): CertifyReport;
export { createTestContext } from "./createTestContext.mjs";
export type CertifyReport = {
    ok: true;
};
export { assertNoHostImports, checkAddonImports } from "./checkAddonImports.mjs";
