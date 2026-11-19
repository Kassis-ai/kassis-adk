/**
 * Packages the Kassis app owns and publishes from the kassis repository. The kit
 * installs them from npmjs.com; this repository has no copy of their source.
 */
export const HOST_PACKAGE_VERSION = process.env.KASSIS_HOST_PACKAGES_VERSION || '0.1.0';

/** Package directory name in the kassis repository, by npm name. */
export const HOST_PACKAGES = {
  '@kassis/host-sdk': 'host-sdk',
  '@kassis/addon-ui': 'addon-ui',
  '@kassis/agent-kit': 'agent-kit',
};

/** @param {string} dirName @returns {string} npm spec, or '' when dirName is a kit package */
export function hostPackageSpec(dirName) {
  const name = Object.keys(HOST_PACKAGES).find((key) => HOST_PACKAGES[key] === dirName);
  return name ? `${name}@${HOST_PACKAGE_VERSION}` : '';
}
