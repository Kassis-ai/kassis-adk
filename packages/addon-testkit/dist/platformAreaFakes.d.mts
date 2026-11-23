/**
 * In-memory fakes for settings, flags, notify, risk, routes, prompts and config.
 */
/**
 * @param {Record<string, unknown> | null | undefined} manifest
 * @param {Record<string, unknown> | undefined} override
 * @returns {Readonly<Record<string, unknown>>}
 */
export declare function createConfigFake(manifest: Record<string, unknown> | null | undefined, override: Record<string, unknown> | undefined): Readonly<Record<string, unknown>>;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createRoutesFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createSettingsFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createFlagsFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createNotifyFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createPromptsFake(recorded: object[]): object;
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createRiskFake(recorded: object[]): object;
