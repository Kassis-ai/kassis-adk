/** Issue returned by an engine check before it is mapped to an AdkIssue. */
export interface CatalogIssue {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly fix: string;
}
