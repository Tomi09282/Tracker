import { useId, useSyncExternalStore } from 'react';
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
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Switch } from '../../ui/primitives/Switch';

/**
 * Which cues the workout player is allowed to emit on THIS device — the three switches behind
 * Profil's "Edzés közbeni jelzések" row (design round A, `settings-v2-2`): the row opens a sheet
 * and the sheet holds these rows, on the gutter, a switch at the end of each. The row's value
 * ("Hang · Rezgés") is `useCueSummary` below, read from the same store.
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

function CueRow({
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
  const id = useId();
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;

  return (
    // A row that only holds a control is not dimmed: the switch carries its own disabled state and
    // the words stay readable (the frame's "Rezgés": switch at 40 %, title in ink).
    <ListRow
      title={label}
      titleId={titleId}
      sub={<span id={hintId}>{hint}</span>}
      subLines={3}
      control={
        <Switch
          checked={cues[channel]}
          labelledBy={titleId}
          describedBy={hintId}
          // A switch for something that cannot happen would be a lie. Disabled rather than hidden,
          // so the absence is explained rather than mysterious.
          disabled={!available}
          onChange={(next) => {
            setCueEnabled(channel, next);
            // Turning something ON demonstrates it immediately, inside the tap so iOS counts it as a
            // gesture. Nobody should have to start a Tabata to find out what they just enabled.
            if (next) onPreview();
          }}
        />
      }
    />
  );
}

/**
 * The row's one-line value: "Hang" when the voice or the beep may sound, "Rezgés" when the device
 * may vibrate (and can), joined by " · " — the words the frame draws. Nothing on = no value: the
 * row then says nothing rather than inventing a word for "off".
 */
export function useCueSummary(): string {
  const { t } = useTranslation();
  const cues = useCues();
  const words: string[] = [];
  if (cues.speech || cues.tone) words.push(t('settings.cues.sound'));
  if (cues.haptics && hapticsAvailable()) words.push(t('settings.cues.haptics'));
  return words.join(' · ');
}

/** The three rows, as the sheet's body. Named as one group by the sheet's title. */
export function CueSettings() {
  const { t, i18n } = useTranslation();

  // Read once, and read by BOTH props: without a motor the row is disabled AND its hint says why
  // (the iPhone fact lives on the vibration row, the row it is about).
  const haptics = hapticsAvailable();

  return (
    <RowStack as="div" role="group" aria-label={t('settings.cues.row')}>
      <CueRow
        channel="speech"
        label={t('settings.cues.speech')}
        hint={t('settings.cues.speechHint')}
        available={speechAvailable()}
        onPreview={() => speak(t('workout.interval.spokenWork', { round: 1, total: 8 }), i18n.language)}
      />
      <CueRow
        channel="tone"
        label={t('settings.cues.tone')}
        hint={t('settings.cues.toneHint')}
        available
        onPreview={() => {
          unlockAudio();
          tone(1320, 260);
        }}
      />
      <CueRow
        channel="haptics"
        label={t('settings.cues.haptics')}
        hint={haptics ? t('settings.cues.hapticsHint') : t('settings.cues.hapticsUnavailable')}
        available={haptics}
        onPreview={() => vibrate('intervalWork')}
      />
    </RowStack>
  );
}
