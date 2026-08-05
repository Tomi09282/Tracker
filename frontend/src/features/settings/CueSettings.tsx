import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
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
  label,
  hint,
  available,
  onPreview,
}: {
  channel: CueChannel;
  label: string;
  hint: string;
  available: boolean;
  onPreview: () => void;
}) {
  const cues = useCues();
  const on = cues[channel];
  const id = `cue-${channel}`;

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <span id={id} className="text-body block text-text-1">
          {label}
        </span>
        <p id={`${id}-hint`} className="text-caption mt-0.5 text-text-3">{hint}</p>
      </div>

      <Switch
        checked={on}
        labelledBy={id}
        describedBy={`${id}-hint`}
        // A toggle for something that cannot happen would be a lie. Disabled and dimmed rather
        // than hidden, so the absence is explained rather than mysterious.
        disabled={!available}
        className="self-center"
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
    <div className="divide-y divide-[var(--surface-border)]">
      <Row
        channel="speech"
        label={t('settings.cues.speech')}
        hint={t('settings.cues.speechHint')}
        available={speechAvailable()}
        onPreview={() => speak(t('workout.interval.spokenWork', { round: 1, total: 8 }), i18n.language)}
      />
      <Row
        channel="tone"
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
        label={t('settings.cues.haptics')}
        hint={t('settings.cues.hapticsHint')}
        available={hapticsAvailable()}
        onPreview={() => vibrate('intervalWork')}
      />
    </div>
  );
}
