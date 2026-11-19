export function generatePublisherKey(publisher: string): {
  fingerprint: string;
  publicKey: string;
  file: string;
};
export function exportPublicKey(keyPath: string, outPath: string): string;
export function registerPublisherKey(input: {
  instance: string;
  publisher: string;
  keyPath: string;
  token: string;
}): Promise<string>;
