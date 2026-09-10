import { Check } from 'lucide-react';
import { Pressable } from './Pressable';

/** Multi-select chip. Same reasoning as Choice, with checkbox semantics. */
export function Toggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      variant={on ? 'primary' : 'secondary'}
      shape="chip"
      icon={on ? <Check className="size-icon-s" aria-hidden /> : undefined}
    >
      {label}
    </Pressable>
  );
}
