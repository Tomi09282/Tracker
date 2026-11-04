import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, Plus } from 'lucide-react';
import { isValidDisplayName } from '../../../lib/person';
import { toCoins } from '../../coins/useCoins';
import { ListRow } from '../../../ui/data/ListRow';
import { RowStack } from '../../../ui/data/RowStack';
import { Sheet } from '../../../ui/feedback/variants/E14E20';
import { Segmented } from '../../../ui/feedback/variants/E6Segmented';
import { Field } from '../../../ui/primitives/Field';
import { MaskedField } from '../../../ui/primitives/MaskedField';
import { NumeralField } from '../../../ui/primitives/NumeralField';
import { Pressable } from '../../../ui/primitives/Pressable';
import type { AdminRole } from './accountsApi';

/*
 * The sheets of the account page (frames `admin-account-detail-2a-name`, `-2b-role`, `-2d-coins`).
 *
 * Each sheet owns its draft and forgets it when it closes. The writes are the page's: a sheet
 * hands up what was chosen (`onSave`), and the page answers with `busy` / `error` / by closing it,
 * so a refused write is never hidden by a vanishing sheet. The lime pill is the sheet's one shape.
 */

interface SheetBase {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  /** The refusal, in words (already translated). */
  error: string | null;
  /** The sheet's "Újra" in the header after a failed write. */
  onRetry?: () => void;
}

/* ── 2a · name ─────────────────────────────────────────────────────────────────────────────── */

export function NameSheet({
  current,
  onSave,
  ...base
}: SheetBase & { current: string; onSave: (displayName: string | null) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(current);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!base.open) return;
    setDraft(current);
    const id = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [base.open, current]);

  const trimmed = draft.trim();
  const dirty = trimmed !== current.trim();
  const valid = isValidDisplayName(draft);

  return (
    <Sheet open={base.open} onClose={base.onClose} title={t('adminUsers.nameSheet.title')} status={base.error ? 'error' : 'idle'} onRetry={base.onRetry}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && valid && !base.busy) onSave(trimmed.length ? trimmed : null);
        }}
      >
        <Field
          ref={field}
          label={t('adminUsers.nameSheet.label')}
          value={draft}
          maxLength={120}
          autoComplete="off"
          hint={t('adminUsers.nameSheet.hint')}
          error={base.error ?? (valid ? undefined : t('adminUsers.nameSheet.invalid'))}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Pressable type="submit" variant="primary" size="lg" className="w-full" busy={base.busy} disabled={!dirty || !valid}>
          {t('common.save')}
        </Pressable>
      </form>
    </Sheet>
  );
}

/* ── 2b · role ─────────────────────────────────────────────────────────────────────────────── */

const ROLES: readonly AdminRole[] = ['user', 'coach', 'admin'];

/**
 * A sentence that follows "Jelenlegi · " starts in lower case (frame 2b: "Jelenlegi · kliensek és tervek"),
 * except in German, where the nouns keep their capital.
 */
const afterDot = (text: string, lang: string) =>
  lang.startsWith('de') ? text : text.charAt(0).toLocaleLowerCase(lang) + text.slice(1);

export function RoleSheet({
  current,
  onSave,
  ...base
}: SheetBase & { current: AdminRole; onSave: (role: AdminRole, password: string | undefined) => void }) {
  const { t, i18n } = useTranslation();
  const [chosen, setChosen] = useState<AdminRole>(current);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!base.open) return;
    setChosen(current);
    setPassword('');
  }, [base.open, current]);

  // The step-up is asked ONLY when granting admin: the admin's OWN password, never the account's.
  const grantsAdmin = chosen === 'admin' && current !== 'admin';
  const ready = chosen !== current && (!grantsAdmin || password.length > 0);

  return (
    <Sheet open={base.open} onClose={base.onClose} title={t('adminUsers.col.role')} status={base.error ? 'error' : 'idle'} onRetry={base.onRetry}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !base.busy) onSave(chosen, grantsAdmin ? password : undefined);
        }}
      >
        <RowStack as="div" role="radiogroup" open close aria-label={t('adminUsers.col.role')}>
          {ROLES.map((r) => (
            <ListRow
              key={r}
              role="radio"
              aria-checked={chosen === r}
              title={t(`adminUsers.role.${r}`)}
              sub={r === current ? t('adminUsers.roleSheet.current', { text: afterDot(t(`adminUsers.roleSheet.about.${r}`), i18n.language) }) : t(`adminUsers.roleSheet.about.${r}`)}
              subLines={2}
              trailing={chosen === r ? <Check aria-hidden className="size-5 text-text-1" strokeWidth={2.25} /> : <span aria-hidden className="size-5" />}
              onClick={() => setChosen(r)}
            />
          ))}
        </RowStack>
        {grantsAdmin ? (
          <MaskedField
            label={t('adminUsers.roleSheet.password')}
            // The frame draws the field with no reveal control: an admin's own password is never shown.
            revealable={false}
            value={password}
            autoComplete="current-password"
            hint={t('adminUsers.roleSheet.passwordHint')}
            error={base.error ?? undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : base.error ? (
          <p role="alert" className="text-cap text-danger">
            {base.error}
          </p>
        ) : null}
        <Pressable type="submit" variant="primary" size="lg" className="w-full" busy={base.busy} disabled={!ready}>
          {t('common.save')}
        </Pressable>
      </form>
    </Sheet>
  );
}

/**
 * The amount, as frame 2d draws it: the figure in the display face with its unit, centred between the
 * two 44 pt buttons, no label row and no underline (the kit's `NumberStepper` sets the figure on the
 * left, on a line). Still a real input - `spinbutton`, typed or stepped, ArrowUp / ArrowDown - because
 * an adjustment of 4 000 coins is not 4 000 taps.
 */
function CentredStepper({
  label,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  unit: string;
}) {
  const { t } = useTranslation();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const shown = value === null ? '' : String(value);
  const by = (d: number) => onChange(clamp((value ?? min) + d));
  return (
    <div role="group" aria-label={label} className="flex h-16 items-start justify-between">
      <Pressable variant="link" shape="icon" aria-label={t('common.less')} disabled={value !== null && value <= min} onPointerDown={(e) => e.preventDefault()} onClick={() => by(-1)}>
        <Minus aria-hidden />
      </Pressable>
      <div className="flex items-start">
        <NumeralField
          label={label}
          inputMode="numeric"
          role="spinbutton"
          aria-valuenow={value ?? undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          value={shown}
          onChange={(e) => {
            const text = e.target.value.replace(/\D/g, '').slice(0, 5);
            onChange(text === '' ? null : clamp(Number(text)));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              by(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              by(-1);
            }
          }}
          className="w-auto text-center"
        />
        <span aria-hidden className="ms-1.5 mt-9 text-cap text-text-2">
          {unit}
        </span>
      </div>
      <Pressable variant="link" shape="icon" aria-label={t('common.more')} disabled={value !== null && value >= max} onPointerDown={(e) => e.preventDefault()} onClick={() => by(1)}>
        <Plus aria-hidden />
      </Pressable>
    </div>
  );
}

/* ── 2d · coins ────────────────────────────────────────────────────────────────────────────── */

/** The server's bound on one adjustment: 1 000 000 minor units either way (api.md). */
const MAX_COINS = 10_000;

export function CoinSheet({
  balanceMinor,
  onSave,
  ...base
}: SheetBase & { balanceMinor: number; onSave: (amountMinor: number, note: string, key: string) => void }) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState<number | null>(10);
  const [note, setNote] = useState('');
  // One idempotency key per opening: a retry of the SAME sheet replays instead of paying twice.
  const key = useMemo(() => crypto.randomUUID(), [base.open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!base.open) return;
    setDirection('credit');
    setAmount(10);
    setNote('');
  }, [base.open]);

  const balance = toCoins(balanceMinor);
  const coins = amount ?? 0;
  const after = direction === 'credit' ? balance + coins : balance - coins;
  // A debit below zero is refused by the server (409); the sheet says so before the tap.
  const overdraws = direction === 'debit' && after < 0;
  const trimmed = note.trim();
  const ready = coins >= 1 && trimmed.length >= 1 && !overdraws;

  return (
    <Sheet open={base.open} onClose={base.onClose} title={t('adminUsers.coin.title')} status={base.error ? 'error' : 'idle'} onRetry={base.onRetry}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !base.busy) onSave((direction === 'credit' ? 1 : -1) * coins * 100, trimmed, key);
        }}
      >
        <Segmented
          layout="cells"
          label={t('adminUsers.coin.direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'credit', label: t('adminUsers.coin.credit') },
            { value: 'debit', label: t('adminUsers.coin.debit') },
          ]}
        />
        <CentredStepper
          label={t('adminUsers.coin.amount')}
          value={amount}
          onChange={setAmount}
          min={1}
          max={MAX_COINS}
          unit={t('adminUsers.coin.unit')}
        />
        <p className="text-data text-text-2" aria-live="polite">
          {t('adminUsers.coin.balanceLabel')} {balance} {'→'} <span className="text-text-1">{after}</span> {t('adminUsers.coin.unit')}
        </p>
        {overdraws ? (
          <p role="alert" className="-mt-2 text-cap text-danger">
            {t('adminUsers.err.insufficient')}
          </p>
        ) : null}
        <Field
          label={t('adminUsers.coin.note')}
          value={note}
          maxLength={280}
          autoComplete="off"
          hint={t('adminUsers.reasonHint')}
          error={base.error ?? undefined}
          onChange={(e) => setNote(e.target.value)}
        />
        <Pressable type="submit" variant="primary" size="lg" className="w-full" busy={base.busy} disabled={!ready}>
          {t('adminUsers.coin.record')}
        </Pressable>
      </form>
    </Sheet>
  );
}
