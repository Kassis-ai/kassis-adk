/**
 * ctx.core.communication: send and list mail on a record type this addon registered.
 * The host keeps mail accounts and SMTP settings. The addon never receives them.
 */
import type { Disposable } from '../disposable.js';
import type { AddonPrincipal } from './addonIdentity.js';

export interface CommunicationSendInput {
  readonly ownerType: string;
  readonly ownerId: string;
  readonly to: string | readonly string[];
  readonly subject: string;
  readonly body: string;
  /** Core template name or this addon's source_key. Subject and body are the render variables. */
  readonly templateKey?: string;
}

export interface CommunicationSendResult {
  readonly emailId: string;
  readonly status: string;
}

export interface CommunicationListQuery {
  readonly ownerType: string;
  readonly ownerId: string;
}

/** A message on the addon's record. No account id, SMTP setting, or credential. */
export interface CommunicationMessage {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly status: string | null;
  readonly sentAt: string | null;
}

/** Record check the addon supplies. False, a throw, or no answer denies the mail. */
export type CommunicationAccessCheck = (
  principal: AddonPrincipal,
  ownerId: string
) => Promise<boolean>;

export interface CommunicationFacade {
  send(
    principal: AddonPrincipal,
    input: CommunicationSendInput
  ): Promise<CommunicationSendResult>;
  list(
    principal: AddonPrincipal,
    query: CommunicationListQuery
  ): Promise<readonly CommunicationMessage[]>;
  /** Called by the host before send and list. Removed on dispose or disable. */
  registerAccess(ownerType: string, canAccess: CommunicationAccessCheck): Disposable;
}
