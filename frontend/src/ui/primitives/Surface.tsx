import type { ElementType, ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { surface, type SurfaceVariants } from './surfaceRecipe';

type SurfaceProps<T extends ElementType> = SurfaceVariants & {
  /**
   * What this renders as. A card is a `div` most of the time, a `section` when it is a landmark,
   * an `li` inside a list, a `form` when it holds one. Polymorphic rather than always a `div`
   * because wrapping a `section` in a `div` to get a card is how a document outline gets lost.
   *
   * NOT for interactivity: a card you can press is a `Pressable` or a `Link` — this component
   * renders no `<button>`, which also keeps it clear of `check-tokens`' raw-button rule.
   */
  as?: T;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'className' | 'children'>;

/**
 * A panel. The one place the glass material is defined, so that changing it changes it everywhere.
 *
 * See `surface.ts` for the recipe and for why `finish` defaults to `veil` rather than `glass`.
 */
export function Surface<T extends ElementType = 'div'>({
  as,
  elevation,
  finish,
  rim,
  interactive,
  pad,
  className,
  children,
  ...rest
}: SurfaceProps<T>) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag
      className={cn(surface({ elevation, finish, rim, interactive, pad }), className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
