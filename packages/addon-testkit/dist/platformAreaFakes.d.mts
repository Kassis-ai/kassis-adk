/**
 * @param {Record<string, unknown> | null | undefined} manifest
 * @param {Record<string, unknown> | undefined} override
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createConfigFake(manifest: Record<string, unknown> | null | undefined, override: Record<string, unknown> | undefined): Readonly<Record<string, unknown>>;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createRoutesFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createSettingsFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createFlagsFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createNotifyFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createPromptsFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createRiskFake(recorded: object[]): object;
