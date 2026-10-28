/** Results returned by every ADK command. The CLI prints them. This package does not. */

export type IssueSeverity = 'error' | 'warning';

export interface AdkIssue {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly fix: string;
  readonly file: string;
  readonly line: number | null;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface CommandResult {
  readonly ok: boolean;
  readonly issues: readonly AdkIssue[];
  readonly data: JsonObject;
}

export interface LogEvent {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

export type LogListener = (event: LogEvent) => void;

export interface CommandFlags {
  readonly id: string;
  readonly dir: string;
  readonly publisher: string;
  readonly tier: string;
  readonly rung: string;
  readonly only: string;
  readonly out: string;
  readonly key: string;
  readonly from: string;
  readonly profile: string;
  readonly instance: string;
  readonly target: string;
  readonly name: string;
  readonly kind: string;
}

export interface CommandRequest {
  readonly command: string;
  readonly subcommand: string;
  readonly positional: string;
  readonly cwd: string;
  readonly flags: CommandFlags;
  /** Undefined when --image was not passed. An empty string means the flag was passed blank. */
  readonly imageFlag: string | undefined;
  readonly followLogs: boolean;
  readonly onLog?: LogListener;
}
