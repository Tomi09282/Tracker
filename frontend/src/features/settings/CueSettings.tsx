import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Bell, Speech, Vibrate } from 'lucide-react';
import {
  cueSnapshot,
  setCueEnabled,
  speak,
  speechAvailable,
  subscribeCues,
  tone,
  unlockAudio,
  vibrate,
  hapticsAvailable,
  type CueChannel,
} from '../../features/workout/cues';
import { Switch } from '../../ui/primitives/Switch';
import { Surface } from '../../ui/primitives/Surface';
import { cn } from '../../lib/cn';

/**
 * Which cues the workout player is allowed to emit on THIS device.
 *
 * Three switches rather than one, because they fail differently. The synthetic voice is the one
 * people actually want gone — it is grating in a gym, and on a device with no voice installed for
 * the app's language the browser substitutes another one reading foreign text, which is worse than
 * silence. But the BEEP carries the 3-2-1 and is the only cue that exists at all on iOS Safari,
 * where `navigator.vibrate` is absent. Folding them into one "sounds" toggle would mean switching
 * off the voice silently costs an iPhone user every non-visual cue they have.
 *
 * `useSyncExternalStore`, not `useState`: the preference lives in a module so the player reads it
 * from inside a timer tick with no React involved. A local copy here would drift the moment
 * anything else changed it.
 */

function useCues() {
  return useSyncExternalStore(subscribeCues, cueSnapshot, cueSnapshot);
}

function Row({
  channel,
  icon: Icon,
  label,
  hint,
  available,
  onPreview,
}: {
  channel: CueChannel;
  icon: LucideIcon;
  label: string;
  hint: string;
  available: boolean;
  onPreview: () => void;
}) {
  const cues = useCues();
  const on = cues[channel];
  const id = `cue-${channel}`;

  return (
    <div className="flex items-center gap-tight px-[var(--card-pad)] py-2">
      {/* The dim lands on the icon and the words, NOT on the whole row — the Switch already
          carries the disabled opacity from `control.ts`, and stacking the two would sink an
          unavailable channel to 20% and read as broken rather than as absent. */}
      <div className={cn('flex min-w-0 flex-1 items-center gap-tight', !available && 'opacity-45')}>
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-card bg-surface-2 text-text-2"
        >
          <Icon className="size-icon-m" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <span id={id} className="text-body block text-text-1">
            {label}
          </span>
          <p id={`${id}-hint`} className="text-caption mt-0.5 text-text-3">
            {hint}
          </p>
        </div>
      </div>

      <Switch
        checked={on}
        labelledBy={id}
        describedBy={`${id}-hint`}
        // A toggle for something that cannot happen would be a lie. Disabled and dimmed rather
        // than hidden, so the absence is explained rather than mysterious.
        disabled={!available}
        onChange={(next) => {
          setCueEnabled(channel, next);
          // Turning something ON demonstrates it immediately, inside the tap so iOS counts it as a
          // gesture. Nobody should have to start a Tabata to find out what they just enabled.
          if (next) onPreview();
        }}
      />
    </div>
  );
}

export function CueSettings() {
  const { t, i18n } = useTranslation();

  return (
    // One card, three rows, hairlines between them — `pad="none"` because the rows own their
    // own padding so a divider runs the full width of the card instead of floating inside it.
    <Surface pad="none" className="divide-y divide-[var(--surface-border)] overflow-hidden">
      <Row
        channel="speech"
        icon={Speech}
        label={t('settings.cues.speech')}
        hint={t('settings.cues.speechHint')}
        available={speechAvailable()}
        onPreview={() => speak(t('workout.interval.spokenWork', { round: 1, total: 8 }), i18n.language)}
      />
      <Row
        channel="tone"
        icon={Bell}
        label={t('settings.cues.tone')}
        hint={t('settings.cues.toneHint')}
        available
        onPreview={() => {
          unlockAudio();
          tone(1320, 260);
        }}
      />
      <Row
        channel="haptics"
        icon={Vibrate}
        label={t('settings.cues.haptics')}
        hint={t('settings.cues.hapticsHint')}
        available={hapticsAvailable()}
        onPreview={() => vibrate('intervalWork')}
      />
    </Surface>
  );
}
