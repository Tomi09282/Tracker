import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '../../lib/cn';
import { control } from './control';
import { ControlBody, Pressable } from './Pressable';

/**
 * THE TEXT LINK — Pulse's second action look, and its only one beside the lime pill.
 *
 * Bare words in a 44 pt frame on the left edge. No fill, no border, no hover wash; never lime.
 * Kit: `textLink(label, { lead, trail, danger, role, off })` (figma-build/app-kit.js:203-207).
 *
 *     <TextLink trail={<ChevronRight />} to="/nutrition">Megnyitás</TextLink>   inline, in a section head
 *     <TextLink text="body" onClick={skip}>Kihagyás</TextLink>                  standalone
 *     <TextLink text="body" tone="danger" onClick={ask}>Kijelentkezés</TextLink> destructive — confirm in a sheet
 *     <TextLink disabled>Újra</TextLink>                                         off (40 %)
 *
 * ONE COMPONENT, THREE ELEMENTS, chosen by what the link does — never by how it should look:
 *
 *   `to`        a route of this app      -> the router's `<Link>` (an anchor: middle-click, long-press, "open in new tab")
 *   `href`      anything else with a URL -> a plain `<a>` (a download, mailto:, an external page)
 *   neither     an action                -> `<button>` through `Pressable` (so `busy` and `type` work)
 *
 * The look is `control({ variant: 'link' })` in all three; nothing is styled here.
 * Reference: docs/pipeline/pulse/kit/actions.md.
 */

interface TextLinkOwnProps {
  /**
   * Type role of the words. `cap` — `cap-m` 13 / 18, the inline link (section head, notice
   * line); the default, as in the kit. `body` — `body-m` 16 / 22, the standalone link.
   */
  text?: 'cap' | 'body';
  /** `danger` = danger TEXT. Never a red fill; the action is confirmed in a bottom sheet. */
  tone?: 'default' | 'danger';
  /** Leading glyph (a Lucide icon). Drawn at 16 px, stroke 1.75, `text-2` — danger colour on a danger link. */
  lead?: ReactNode;
  /** Trailing glyph — the chevron of "Megnyitás ›". 16 px, stroke 1.75, `text-2`. */
  trail?: ReactNode;
  /** PLACEMENT only (`self-start`, `ml-auto`, `-my-3` to sit on a 20 pt baseline row). */
  className?: string;
  children?: ReactNode;
}

export interface TextLinkButtonProps
  extends TextLinkOwnProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  to?: undefined;
  href?: undefined;
  /** Three dots in place of the words; the frame keeps its width. */
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export interface TextLinkRouteProps extends TextLinkOwnProps, Omit<LinkProps, 'className' | 'children'> {
  href?: undefined;
  /** An anchor cannot be disabled: the link is rendered inert, out of the tab order, with `aria-disabled`. */
  disabled?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

export interface TextLinkAnchorProps
  extends TextLinkOwnProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> {
  to?: undefined;
  href: string;
  /** As on the route form. */
  disabled?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

export type TextLinkProps = TextLinkButtonProps | TextLinkRouteProps | TextLinkAnchorProps;

/** What makes an anchor inert. Spread LAST, so a caller's `onClick` cannot re-arm a disabled link. */
const inert = (disabled: boolean | undefined) =>
  disabled
    ? ({
        'aria-disabled': true,
        tabIndex: -1,
        onClick: (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault(),
      } as const)
    : null;

export function TextLink(props: TextLinkProps) {
  if (props.to !== undefined) {
    const { text, tone, lead, trail, className, children, disabled, ...rest } = props;
    return (
      <Link data-kit="textLink" className={cn(control({ variant: 'link', tone, text }), className)} {...rest} {...inert(disabled)}>
        <ControlBody variant="link" tone={tone} icon={lead} trail={trail}>
          {children}
        </ControlBody>
      </Link>
    );
  }

  if (props.href !== undefined) {
    const { text, tone, lead, trail, className, children, disabled, to: _to, ...rest } = props;
    return (
      <a data-kit="textLink" className={cn(control({ variant: 'link', tone, text }), className)} {...rest} {...inert(disabled)}>
        <ControlBody variant="link" tone={tone} icon={lead} trail={trail}>
          {children}
        </ControlBody>
      </a>
    );
  }

  const { lead, to: _to, href: _href, ...rest } = props;
  return <Pressable variant="link" icon={lead} {...rest} />;
}
