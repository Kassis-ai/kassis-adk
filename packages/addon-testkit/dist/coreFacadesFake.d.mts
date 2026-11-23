/**
 * In-memory ctx.core facades for offline tests. Tier refusals use KADK-219.
 */
/**
 * @param {1 | 2} tier
 * @param {object[]} recorded
 * @returns {object}
 */
export declare function createCoreFacadesFake(tier: 1 | 2, recorded: object[]): object;
