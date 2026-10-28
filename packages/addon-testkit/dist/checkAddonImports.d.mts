/**
 * @typedef {'KADK-201' | 'KADK-202' | 'KADK-203' | 'KADK-204' | 'KADK-205'} ImportCode
 * @typedef {object} AddonImportIssue
 * @property {ImportCode} code
 * @property {string} file
 * @property {number} line
 * @property {string} specifier
 * @property {string} message
 * @typedef {object} FoundSpecifier
 * @property {string} specifier
 * @property {number} index
 */
/**
 * @param {string} source
 * @param {string} [label]
 * @returns {void}
 */
export function assertNoHostImports(source: string, label?: string): void;
/**
 * @param {string} addonDir
 * @returns {AddonImportIssue[]}
 */
export function checkAddonImports(addonDir: string): AddonImportIssue[];
export type ImportCode = "KADK-201" | "KADK-202" | "KADK-203" | "KADK-204" | "KADK-205";
export type AddonImportIssue = {
    code: ImportCode;
    file: string;
    line: number;
    specifier: string;
    message: string;
};
export type FoundSpecifier = {
    specifier: string;
    index: number;
};
