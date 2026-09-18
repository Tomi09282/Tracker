/**
 * Same set of equipment ids, order ignored — the server does not promise an order.
 *
 * Moved out of `EquipmentSection` so `ClientEquipmentCard` could use the same rule rather than
 * write its own copy: two definitions of "did this actually change" agree today and are exactly
 * the kind of pair that drifts the first time one of them grows an edge case the other never
 * gets. `ClientEquipmentCard` needs it for a different reason than `EquipmentSection` does — there
 * a no-op save would still notify and audit-log a change into someone else's account — but the
 * question is the same question.
 */
export const sameSet = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));
