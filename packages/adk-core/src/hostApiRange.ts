/** hostApi ranges accepted by the manifest schema, compared with HOST_API_VERSION. */

export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseSemVer(text: string): SemVer | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(left: SemVer, right: SemVer): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function atLeast(version: SemVer, floor: SemVer): boolean {
  return compare(version, floor) >= 0;
}

/** True when `version` is inside a manifest hostApi range. An unknown range is false. */
export function hostApiSatisfies(range: string, version: SemVer): boolean {
  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (caret) {
    const major = Number(caret[1]);
    const minor = Number(caret[2]);
    const patch = Number(caret[3]);
    if (version.major !== major) return false;
    if (major === 0 && version.minor !== minor) return false;
    if (version.minor < minor) return false;
    if (version.minor === minor && version.patch < patch) return false;
    return true;
  }
  const tilde = /^~(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (tilde) {
    return (
      version.major === Number(tilde[1]) &&
      version.minor === Number(tilde[2]) &&
      version.patch >= Number(tilde[3])
    );
  }
  const exact = /^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (exact) {
    return (
      version.major === Number(exact[1]) &&
      version.minor === Number(exact[2]) &&
      version.patch === Number(exact[3])
    );
  }
  const bounded = /^>=(\d+)\.(\d+)\.(\d+)(?: <(\d+)\.(\d+)\.(\d+))?$/.exec(range);
  if (!bounded) return false;
  const floor = { major: Number(bounded[1]), minor: Number(bounded[2]), patch: Number(bounded[3]) };
  if (!atLeast(version, floor)) return false;
  if (bounded[4] === undefined) return true;
  const ceiling = { major: Number(bounded[4]), minor: Number(bounded[5]), patch: Number(bounded[6]) };
  return compare(version, ceiling) < 0;
}
