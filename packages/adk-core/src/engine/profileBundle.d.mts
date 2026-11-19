export function readBundledProfile(profileId: string): object;
export function verifyProfileSignature(profile: object): boolean;
export function downloadProfile(
  instance: string,
  profileId: string,
  token: string
): Promise<object>;
