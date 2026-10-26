/**
 * Returned by every registration. Disposing removes what was registered; a second call does
 * nothing. The host also disposes everything an addon registered when it is disabled.
 */
export interface Disposable {
  dispose(): Promise<void>;
}
