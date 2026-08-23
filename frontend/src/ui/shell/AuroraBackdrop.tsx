/**
 * The light the whole interface floats over (ADR-0015).
 *
 * AN ELEMENT, NOT A BODY BACKGROUND, and the difference is the entire effect. `body` already
 * carries `--surface-0`, and a background painted there scrolls with the page — which reads as
 * wallpaper. A `fixed` layer does not move, so the glass slides across a still field of light and
 * every card picks up a different part of it as the page scrolls. That is what says "depth"
 * rather than "gradient".
 *
 * `-z-10` rather than a rung on the declared ladder: the ladder starts at `--z-sticky: 20` and
 * every rung is a decision about what covers what. This covers nothing and is covered by
 * everything, which a negative z on a fixed element under a transparent body states unambiguously.
 * Adding `--z-aurora: -1` would invite someone to reason about its position, and there is nothing
 * to reason about.
 *
 * `aria-hidden` and `pointer-events-none`: it is decoration in the strictest sense — no meaning to
 * announce, and nothing under it should become untappable.
 */
export function AuroraBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: 'var(--aurora)' }}
    />
  );
}
