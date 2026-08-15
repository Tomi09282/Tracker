// src/payments/handlers.js — what a verified event MEANS, decided without touching anything.
//
// ═══ PURE, FOR THE SAME REASON THE SIGNATURE CHECK IS ══════════════════════════════════════════
//
// This turns a processor's vocabulary into this product's. It needs no database and no clock, so
// every branch — including the ones that only happen when a card is declined in a country whose
// bank does 3DS on renewals — can be driven from a probe with a literal object.

/**
 * ═══ THE STATUS MAP, AND WHY UNKNOWN FAILS CLOSED ══════════════════════════════════════════════
 *
 * Stripe has more subscription states than this product acts on, and the schema's CHECK admits
 * four. Mapping is therefore mandatory, and the interesting decisions are the ones that are not
 * one-to-one:
 *
 *   `unpaid`             — dunning is OVER and it failed. Keeping this as `past_due` would grant
 *                          the tier forever to somebody who has stopped paying, because `past_due`
 *                          deliberately keeps entitlement.
 *   `incomplete`         — the FIRST payment never succeeded. There was never an entitlement to
 *                          keep, so this is not a downgrade, it is a subscription that never began.
 *   `incomplete_expired` — the same, made permanent.
 *   `paused`             — no entitlement while paused, by definition.
 *
 * All four collapse to `canceled`, which resolves to the free tier. And ANYTHING unrecognised does
 * too: a status this product has never heard of must not silently grant a paid plan, and a state
 * Stripe adds next year would otherwise do exactly that.
 *
 * Failing closed is safe here in a way it would not be elsewhere, and that is not luck — the seat
 * cap is enforced at "add a client" and never at "have clients", so the worst a wrong `canceled`
 * can do is stop growth until the next event corrects it. It cannot dissolve a relationship.
 */
const STATUS_MAP = new Map([
  ['trialing', 'trialing'],
  ['active', 'active'],
  ['past_due', 'past_due'],
  ['canceled', 'canceled'],
  ['unpaid', 'canceled'],
  ['incomplete', 'canceled'],
  ['incomplete_expired', 'canceled'],
  ['paused', 'canceled'],
]);

export const mapStatus = (raw) => STATUS_MAP.get(raw) ?? 'canceled';
export const isKnownStatus = (raw) => STATUS_MAP.has(raw);

/** The events this product acts on. Everything else is recorded and ignored, deliberately. */
const HANDLED = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

const str = (v, max = 255) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/**
 * Turn a verified event into an intent, or `null` when there is nothing to do.
 *
 * `null` is a first-class answer, not a failure: most of what a processor sends is about invoices,
 * payment methods and charges, and a product that treated every unhandled type as an error would
 * fill its log with noise and hide the real ones.
 */
export function intentFrom(event) {
  const type = str(event?.type, 128);
  if (!type || !HANDLED.has(type)) return null;

  const sub = event?.data?.object;
  if (!sub || typeof sub !== 'object') return null;

  const subscriptionId = str(sub.id);
  // `customer` is an id string on a normal webhook and an expanded object if somebody enabled
  // expansion on the endpoint. Reading only the string would silently drop every event on a
  // correctly-configured-but-unusual account.
  const customerId = str(sub.customer) ?? str(sub.customer?.id);
  if (!subscriptionId || !customerId) return null;

  // The price lives on the first line item. A subscription can carry several — this product sells
  // ONE plan at a time, so more than one is a configuration this code does not claim to handle,
  // and it says so rather than picking the first and hoping.
  const items = Array.isArray(sub.items?.data) ? sub.items.data : [];
  if (items.length > 1) return { kind: 'unsupported', reason: 'multi_item_subscription', subscriptionId, customerId };
  const priceId = str(items[0]?.price?.id);

  /*
   * `deleted` is the one type whose payload status is not the whole truth: Stripe sends the
   * subscription object as it was, and the EVENT is the cancellation. Trusting `sub.status` here
   * has produced "the subscription was deleted and the row still says active" in more than one
   * product.
   */
  const rawStatus = type === 'customer.subscription.deleted' ? 'canceled' : str(sub.status, 64);

  return {
    kind: 'subscription',
    type,
    subscriptionId,
    customerId,
    priceId,
    rawStatus,
    status: mapStatus(rawStatus),
    // Present on a subscription, absent on some test payloads. Null is fine — the column is
    // nullable and nothing branches on it.
    currentPeriodEnd: Number.isInteger(sub.current_period_end) ? sub.current_period_end : null,
    /*
     * How the FIRST event finds its coach. A Checkout Session is created with the coach's id in
     * metadata, and Stripe copies session metadata onto the subscription it creates — so the very
     * first `customer.subscription.created` carries it, and every later event can be resolved by
     * customer or subscription id instead.
     *
     * Read as a STRING and coerced with care: this is attacker-adjacent data in the sense that it
     * round-trips through a third party, so it is validated as a positive integer rather than
     * trusted into a query.
     */
    coachIdHint: /^[1-9]\d{0,17}$/.test(String(sub.metadata?.coach_id ?? '')) ? Number(sub.metadata.coach_id) : null,
  };
}
