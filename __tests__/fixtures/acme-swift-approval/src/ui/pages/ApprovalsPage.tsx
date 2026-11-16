import { useState } from 'react';
import type { JSX } from 'react';
import {
  ApprovalStatusPanel,
  useAddonTranslation,
  useApprovalInbox,
  useLocale,
} from '@kassis/host-sdk';
import { commentRejection } from '../../rules/comment.js';
import { addonFetch } from '../api.js';
import { formatAmount } from '../formatAmount.js';

const ADDON_ID = 'acme-swift-approval';
const SUBJECT = 'acme-swift-approval.message';

type Summary = {
  id: string;
  messageType: string;
  reference: string;
  senderBic: string;
  receiverBic: string;
  valueDate: string;
  currency: string;
  amount: string;
  highValue: boolean;
  status: string;
  receivedAt: string;
};

type Detail = Summary & {
  orderingCustomer: string | null;
  beneficiary: string;
  remittanceInfo: string | null;
  rawText: string;
  approvalRequestId: string | null;
  submittedBy: string | null;
  decisionComment: string | null;
};

type Filters = {
  status: string;
  messageType: string;
  currency: string;
  valueDateFrom: string;
  valueDateTo: string;
  page: number;
};

const INITIAL_FILTERS: Filters = {
  status: 'PENDING_APPROVAL',
  messageType: '',
  currency: '',
  valueDateFrom: '',
  valueDateTo: '',
  page: 1,
};

function queryString(filters: Filters): string {
  const params = new URLSearchParams();
  params.set('status', filters.status);
  params.set('page', String(filters.page));
  if (filters.messageType) params.set('messageType', filters.messageType);
  if (filters.currency) params.set('currency', filters.currency);
  if (filters.valueDateFrom) params.set('valueDateFrom', filters.valueDateFrom);
  if (filters.valueDateTo) params.set('valueDateTo', filters.valueDateTo);
  return params.toString();
}

export function ApprovalsPage(): JSX.Element {
  const { t } = useAddonTranslation(ADDON_ID);
  const locale = useLocale();
  const inbox = useApprovalInbox();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [rows, setRows] = useState<readonly Summary[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [requireComment, setRequireComment] = useState(false);
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load(next: Filters): Promise<void> {
    const response = await addonFetch(`/queue?${queryString(next)}`);
    if (!response.ok) {
      setNotice(t('pages.approvals.loadError'));
      return;
    }
    const body = (await response.json()) as { messages?: Summary[] };
    setRows(body.messages ?? []);
    setLoaded(true);
    setNotice('');
  }

  async function openRow(id: string): Promise<void> {
    const response = await addonFetch(`/queue/${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const body = (await response.json()) as { message?: Detail; requireApproveComment?: boolean };
    if (!body.message) return;
    setDetail(body.message);
    setRequireComment(body.requireApproveComment === true);
    setComment('');
    setNotice('');
  }

  const requestId = detail?.approvalRequestId ?? '';
  const waiting = inbox.waiting.some((item) => item.id === requestId);
  const maker = inbox.requested.some((item) => item.id === requestId);
  const showDecision = detail?.status === 'PENDING_APPROVAL' && waiting && !maker && requestId.length > 0;

  async function decide(decision: 'approve' | 'reject'): Promise<void> {
    if (!detail || !requestId) return;
    const problem = commentRejection(decision, comment, requireComment);
    if (problem === 'reject-comment-short') {
      setNotice(t('pages.approvals.rejectCommentShort'));
      return;
    }
    if (problem === 'approve-comment-required') {
      setNotice(t('pages.approvals.approveCommentRequired'));
      return;
    }
    await inbox.decide(requestId, decision, comment.trim());
    setDetail(null);
    await load(filters);
  }

  return (
    <section data-testid={`${ADDON_ID}-approvals-page`}>
      <h1>{t('pages.approvals.title')}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = { ...filters, page: 1 };
          setFilters(next);
          void load(next);
        }}
      >
        <label>
          {t('pages.approvals.filterStatus')}
          <input
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          />
        </label>
        <label>
          {t('pages.approvals.filterType')}
          <input
            value={filters.messageType}
            onChange={(event) => setFilters({ ...filters, messageType: event.target.value })}
          />
        </label>
        <label>
          {t('pages.approvals.filterCurrency')}
          <input
            value={filters.currency}
            onChange={(event) => setFilters({ ...filters, currency: event.target.value })}
          />
        </label>
        <label>
          {t('pages.approvals.filterFrom')}
          <input
            value={filters.valueDateFrom}
            onChange={(event) => setFilters({ ...filters, valueDateFrom: event.target.value })}
          />
        </label>
        <label>
          {t('pages.approvals.filterTo')}
          <input
            value={filters.valueDateTo}
            onChange={(event) => setFilters({ ...filters, valueDateTo: event.target.value })}
          />
        </label>
        <button type="submit">{t('pages.approvals.applyFilters')}</button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {loaded && rows.length === 0 ? <p>{t('pages.approvals.empty')}</p> : null}
      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>{t('pages.approvals.receivedAt')}</th>
              <th>{t('pages.approvals.messageType')}</th>
              <th>{t('pages.approvals.reference')}</th>
              <th>{t('pages.approvals.senderBic')}</th>
              <th>{t('pages.approvals.receiverBic')}</th>
              <th>{t('pages.approvals.valueDate')}</th>
              <th>{t('pages.approvals.amount')}</th>
              <th>{t('pages.approvals.highValue')}</th>
              <th>{t('pages.approvals.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => {
                  void openRow(row.id);
                }}
              >
                <td>{row.receivedAt}</td>
                <td>{row.messageType}</td>
                <td>{row.reference}</td>
                <td>{row.senderBic}</td>
                <td>{row.receiverBic}</td>
                <td>{row.valueDate}</td>
                <td>{formatAmount(row.amount, row.currency, locale)}</td>
                <td>{row.highValue ? t('pages.approvals.highValue') : ''}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <button
        type="button"
        onClick={() => {
          const next = { ...filters, page: Math.max(1, filters.page - 1) };
          setFilters(next);
          void load(next);
        }}
      >
        {t('pages.approvals.previous')}
      </button>
      <button
        type="button"
        onClick={() => {
          const next = { ...filters, page: filters.page + 1 };
          setFilters(next);
          void load(next);
        }}
      >
        {t('pages.approvals.next')}
      </button>
      {detail ? (
        <aside>
          <button type="button" onClick={() => setDetail(null)}>
            {t('pages.approvals.close')}
          </button>
          <p>{t('pages.approvals.reference')}</p>
          <p>{detail.reference}</p>
          <p>{t('pages.approvals.orderingCustomer')}</p>
          <p>{detail.orderingCustomer ?? ''}</p>
          <p>{t('pages.approvals.beneficiary')}</p>
          <p>{detail.beneficiary}</p>
          <p>{t('pages.approvals.remittanceInfo')}</p>
          <p>{detail.remittanceInfo ?? ''}</p>
          <p>{t('pages.approvals.rawText')}</p>
          <pre>{detail.rawText}</pre>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(detail.rawText);
              setNotice(t('pages.approvals.copied'));
            }}
          >
            {t('pages.approvals.copy')}
          </button>
          <ApprovalStatusPanel subjectType={SUBJECT} subjectId={detail.id} />
          {showDecision ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <label>
                {t('pages.approvals.comment')}
                <textarea
                  value={comment}
                  onChange={(event) => {
                    setComment(event.target.value);
                  }}
                />
              </label>
              <button type="button" onClick={() => void decide('approve')}>
                {t('pages.approvals.approve')}
              </button>
              <button type="button" onClick={() => void decide('reject')}>
                {t('pages.approvals.reject')}
              </button>
            </form>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
