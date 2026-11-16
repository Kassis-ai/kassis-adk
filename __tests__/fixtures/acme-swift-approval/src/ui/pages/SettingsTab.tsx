import { useState } from 'react';
import type { JSX } from 'react';
import { useAddonTranslation } from '@kassis/host-sdk';
import { addonFetch } from '../api.js';

const ADDON_ID = 'acme-swift-approval';

type SettingsForm = {
  allowedMessageTypes: string[];
  highValueThresholds: Record<string, string>;
  maxAmountPerMessage: string;
  expiryHours: string;
  requireApproveComment: boolean;
  notifyApprovers: boolean;
};

const EMPTY: SettingsForm = {
  allowedMessageTypes: ['MT103', 'MT202'],
  highValueThresholds: { CHF: '1000000', EUR: '1000000', USD: '1000000' },
  maxAmountPerMessage: '',
  expiryHours: '24',
  requireApproveComment: false,
  notifyApprovers: true,
};

function readConfiguration(payload: unknown): SettingsForm {
  if (!payload || typeof payload !== 'object') return EMPTY;
  const record = payload as { configuration?: unknown; data?: { configuration?: unknown } };
  const row = record.configuration ?? record.data?.configuration ?? payload;
  const values =
    row && typeof row === 'object' && 'configuration' in row
      ? (row as { configuration?: unknown }).configuration
      : row;
  if (!values || typeof values !== 'object') return EMPTY;
  const source = values as Partial<SettingsForm>;
  return {
    allowedMessageTypes: Array.isArray(source.allowedMessageTypes)
      ? source.allowedMessageTypes.filter((item) => item === 'MT103' || item === 'MT202')
      : EMPTY.allowedMessageTypes,
    highValueThresholds:
      source.highValueThresholds && typeof source.highValueThresholds === 'object'
        ? source.highValueThresholds
        : EMPTY.highValueThresholds,
    maxAmountPerMessage:
      typeof source.maxAmountPerMessage === 'string' ? source.maxAmountPerMessage : '',
    expiryHours:
      typeof source.expiryHours === 'number' ? String(source.expiryHours) : EMPTY.expiryHours,
    requireApproveComment: source.requireApproveComment === true,
    notifyApprovers: source.notifyApprovers !== false,
  };
}

export function SettingsTab(): JSX.Element {
  const { t } = useAddonTranslation(ADDON_ID);
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [notice, setNotice] = useState('');

  async function load(): Promise<void> {
    const response = await addonFetch('/configuration');
    if (!response.ok) return;
    setForm(readConfiguration(await response.json()));
  }

  async function save(): Promise<void> {
    const expiryHours = Number(form.expiryHours);
    const configuration = {
      allowedMessageTypes: form.allowedMessageTypes,
      highValueThresholds: form.highValueThresholds,
      maxAmountPerMessage: form.maxAmountPerMessage.length > 0 ? form.maxAmountPerMessage : null,
      expiryHours: Number.isInteger(expiryHours) ? expiryHours : 24,
      requireApproveComment: form.requireApproveComment,
      notifyApprovers: form.notifyApprovers,
    };
    const response = await addonFetch('/configuration', {
      method: 'PUT',
      body: JSON.stringify({ configuration }),
    });
    setNotice(response.ok ? t('settings.saved') : t('settings.saveError'));
  }

  function toggleType(type: 'MT103' | 'MT202', checked: boolean): void {
    const next = new Set(form.allowedMessageTypes);
    if (checked) next.add(type);
    else next.delete(type);
    setForm({ ...form, allowedMessageTypes: [...next] });
  }

  return (
    <section data-testid={`${ADDON_ID}-settings-tab`}>
      <h1>{t('settings.title')}</h1>
      <button type="button" onClick={() => void load()}>
        {t('settings.title')}
      </button>
      <fieldset>
        <legend>{t('settings.allowedMessageTypes')}</legend>
        <label>
          <input
            type="checkbox"
            checked={form.allowedMessageTypes.includes('MT103')}
            onChange={(event) => toggleType('MT103', event.target.checked)}
          />
          {t('settings.mt103')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.allowedMessageTypes.includes('MT202')}
            onChange={(event) => toggleType('MT202', event.target.checked)}
          />
          {t('settings.mt202')}
        </label>
      </fieldset>
      <label>
        {t('settings.maxAmount')}
        <input
          value={form.maxAmountPerMessage}
          onChange={(event) => setForm({ ...form, maxAmountPerMessage: event.target.value })}
        />
      </label>
      <label>
        {t('settings.expiryHours')}
        <input
          value={form.expiryHours}
          onChange={(event) => setForm({ ...form, expiryHours: event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={form.requireApproveComment}
          onChange={(event) => setForm({ ...form, requireApproveComment: event.target.checked })}
        />
        {t('settings.requireApproveComment')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={form.notifyApprovers}
          onChange={(event) => setForm({ ...form, notifyApprovers: event.target.checked })}
        />
        {t('settings.notifyApprovers')}
      </label>
      <p>{t('settings.thresholds')}</p>
      <button type="button" onClick={() => void save()}>
        {t('settings.save')}
      </button>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
