import type { AddonContext, AddonPrincipal } from '@kassis/addon-sdk';
import { readSettings } from './settings.js';
import { ingestMessage } from './messages/ingest.js';
import { getMessage, listMessages } from './messages/repository.js';
import type { ListFilter } from './messages/types.js';

const SUBJECT = 'acme-swift-approval.message';
const PAGE = 25;

type RequestLike = {
  readonly method?: string;
  readonly path?: string;
  readonly url?: string;
  readonly body?: unknown;
  readonly query?: Record<string, unknown>;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
};

function queryValue(query: Record<string, unknown> | undefined, key: string): string | null {
  const value = query?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function pageOffset(query: Record<string, unknown> | undefined): number {
  const raw = queryValue(query, 'page');
  const page = raw ? Number(raw) : 1;
  if (!Number.isInteger(page) || page < 1) return 0;
  return (page - 1) * PAGE;
}

function filterFrom(query: Record<string, unknown> | undefined): ListFilter {
  return {
    status: queryValue(query, 'status') ?? 'PENDING_APPROVAL',
    messageType: queryValue(query, 'messageType'),
    currency: queryValue(query, 'currency'),
    valueDateFrom: queryValue(query, 'valueDateFrom'),
    valueDateTo: queryValue(query, 'valueDateTo'),
    limit: PAGE,
    offset: pageOffset(query),
  };
}

function detailId(path: string): string | null {
  const match = /^\/queue\/([^/]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

async function policyStatus(ctx: AddonContext, res: ResponseLike): Promise<void> {
  const enforced = await ctx.core.approvals.isEnforced(SUBJECT);
  if (!enforced) {
    res.status(503).json({ ok: false, reason: 'Approval policy is not enforced' });
    return;
  }
  res.status(200).json({ ok: true, subjectType: SUBJECT });
}

/** FR-01, FR-11, FR-12, FR-13, FR-16. One mount: the tier 2 runner matches the path it is given. */
export function createDispatcher(ctx: AddonContext): (req: RequestLike, res: ResponseLike) => Promise<void> {
  return async (req, res) => {
    const principal = ctx.routes.principalOf(req) as AddonPrincipal;
    const path = req.path ?? req.url ?? '/';
    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET' && path === '/release-policy') {
      await policyStatus(ctx, res);
      return;
    }
    if (method === 'POST' && path === '/messages') {
      if (req.body === undefined) {
        res.status(503).json({
          reason: 'tier2-route-body-not-forwarded',
        });
        return;
      }
      const outcome = await ingestMessage(ctx, principal, req.body);
      res.status(outcome.status).json(outcome.body);
      return;
    }
    if (method === 'GET' && path === '/queue') {
      const rows = await listMessages(ctx, filterFrom(req.query));
      res.status(200).json({ messages: rows, pageSize: PAGE });
      return;
    }
    if (method === 'GET') {
      const id = detailId(path);
      if (id) {
        const message = await getMessage(ctx, id);
        if (!message) {
          res.status(404).json({ reason: 'Message not found' });
          return;
        }
        res.status(200).json({
          message,
          requireApproveComment: readSettings(ctx.config).requireApproveComment,
        });
        return;
      }
    }
    res.status(404).json({ reason: 'Not found' });
  };
}
