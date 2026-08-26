/**
 * Muscle-map geometry.
 *
 * Hand-built SVG rather than a cut-out illustration, for two reasons a bitmap cannot satisfy:
 * every region must be addressable ONE MUSCLE AT A TIME by the same slug the database uses, and
 * every region must take its fill from a theme token so the figure recolours with the rest of the
 * app. A third reason is licensing — the exercise dataset is CC-BY-SA and properly attributed, and
 * an anatomy plate of unknown provenance is not something to smuggle into the bundle.
 *
 * Everything here is measured from `landmarks.ts`. No shape carries its own free-floating
 * coordinates, and every paired muscle is drawn once and mirrored. That is the fix for the first
 * version, where the silhouette was one blob and each muscle was an independently typed string:
 * nothing tied a shape to the body under it, so the pecs floated above the ribcage, the head read
 * as a martini glass, and the halves were not actually symmetrical.
 */
import { CX, Y, W, x, M, L, C, Q, Z, path, pair, spanMidline, type P } from './landmarks';

export type BodySide = 'front' | 'back';

export interface MuscleShape {
  /** Matches `muscle_groups.slug` in the database — the map and the data cannot drift apart. */
  slug: string;
  side: BodySide;
  /** One or more path definitions; paired muscles carry two, the second mirrored. */
  d: string[];
}

const p = (px: number, py: number): P => [px, py];

/** Outer and inner edges of a limb, given its axis and half-width at that height. */
const out = (axis: number, half: number) => axis + half;
const inn = (axis: number, half: number) => axis - half;

/* ── the body outline ───────────────────────────────────────────────────────────────────────
 *
 * Separate anatomical parts rather than one continuous silhouette. The old single path is why the
 * head rendered as a martini glass: skull, jaw and neck shared an outline, so a curve that was
 * slightly wrong anywhere deformed all three. Parts can each be right on their own.
 *
 * Torso and limbs are drawn as LEFT halves and mirrored, so the two sides are identical by
 * construction rather than by careful typing.
 */

/** Cranium tapering into a jaw. One centred shape — the head is not a paired muscle. */
const HEAD = path(
  M(p(CX, Y.skull)),
  C(p(x(W.skull), Y.skull + 3), p(x(W.skull), Y.brow - 6), p(x(W.skull), Y.brow + 6)),
  C(p(x(W.skull - 1), Y.chin - 16), p(x(W.jaw), Y.chin - 4), p(CX, Y.chin)),
  C(p(x(W.jaw, 1), Y.chin - 4), p(x(W.skull - 1, 1), Y.chin - 16), p(x(W.skull, 1), Y.brow + 6)),
  C(p(x(W.skull, 1), Y.brow - 6), p(x(W.skull, 1), Y.skull + 3), p(CX, Y.skull)),
  Z,
);

/** Neck, widening into the trapezius at its base so it does not read as a stalk. */
const NECK = path(
  M(p(x(W.neck - 5), Y.chin - 8)),
  C(p(x(W.neck - 4), Y.jaw + 4), p(x(W.neck - 1), Y.jaw + 10), p(x(W.neck), Y.sternumTop + 2)),
  L(p(x(W.neck, 1), Y.sternumTop + 2)),
  C(p(x(W.neck - 1, 1), Y.jaw + 10), p(x(W.neck - 4, 1), Y.jaw + 4), p(x(W.neck - 5, 1), Y.chin - 8)),
  Z,
);

/**
 * Torso: neck base → out along the clavicle to the deltoid → down the flank → in at the waist →
 * out over the hip → in to the crotch. Left half, mirrored to complete.
 */
const TORSO_HALF = path(
  M(p(CX, Y.sternumTop - 6)),
  L(p(x(W.neck - 1), Y.sternumTop - 2)),
  // The trapezius slope out to the shoulder. This one line is what makes a figure read as
  // athletic rather than as a rectangle with arms attached.
  C(p(x(28), Y.shoulder - 8), p(x(46), Y.shoulder - 6), p(x(W.chest + 4), Y.shoulder + 8)),
  // Down the outside of the ribcage, past the armpit.
  C(p(x(W.chest + 2), Y.armpit + 10), p(x(W.chest - 2), Y.nipple + 20), p(x(W.ribcage), Y.ribcage)),
  // Into the waist — the narrowest point of the whole figure, and the reason the figure has a
  // shape at all.
  C(p(x(W.ribcage - 6), Y.waist - 6), p(x(W.waist + 2), Y.waist - 2), p(x(W.waist), Y.waist + 10)),
  // Back out over the iliac crest to the hip.
  C(p(x(W.waist + 5), Y.navel + 14), p(x(W.hip - 1), Y.hip - 14), p(x(W.hip), Y.hip + 4)),
  // The hip crease down to the crotch.
  C(p(x(W.hip - 4), Y.crotch - 16), p(x(24), Y.crotch - 4), p(CX, Y.crotch + 2)),
  Z,
);

/**
 * Arm: deltoid cap → upper arm → elbow → forearm → wrist → hand, then back up the inner edge.
 *
 * Built around its OWN axis (`W.armAxis*`) rather than hung off the torso outline. The first
 * version measured the arm from the shoulder half-width, which put its inner edge inside the
 * ribcage — the arm and torso merged into one blob and the figure appeared to have no arms.
 */
const ARM_HALF = path(
  // Deltoid cap, the widest part of the arm.
  M(p(x(inn(W.armAxisTop, 12)), Y.shoulder + 2)),
  C(
    p(x(out(W.armAxisTop, 14)), Y.shoulder + 4),
    p(x(out(W.armAxisTop, 16)), Y.armpit),
    p(x(out(W.armAxisTop, 14)), Y.armpit + 14),
  ),
  // Outer edge of the upper arm down to the elbow.
  C(
    p(x(out(W.armAxisElbow, 15)), Y.nipple + 30),
    p(x(out(W.armAxisElbow, 14)), Y.elbow - 20),
    p(x(out(W.armAxisElbow, 12)), Y.elbow),
  ),
  // Forearm, tapering to the wrist.
  C(
    p(x(out(W.armAxisWrist, 12)), Y.elbow + 30),
    p(x(out(W.armAxisWrist, 10)), Y.wrist - 24),
    p(x(out(W.armAxisWrist, 7)), Y.wrist),
  ),
  // The hand: a closed mitt. Fingers at this scale would be four grey specks.
  C(
    p(x(out(W.armAxisWrist, 9)), Y.wrist + 18),
    p(x(out(W.armAxisWrist, 8)), Y.fingertip),
    p(x(W.armAxisWrist), Y.fingertip),
  ),
  C(
    p(x(inn(W.armAxisWrist, 8)), Y.fingertip),
    p(x(inn(W.armAxisWrist, 9)), Y.wrist + 18),
    p(x(inn(W.armAxisWrist, 7)), Y.wrist),
  ),
  // Inner edge back up: forearm, elbow, biceps, into the armpit.
  C(
    p(x(inn(W.armAxisWrist, 10)), Y.wrist - 24),
    p(x(inn(W.armAxisElbow, 12)), Y.elbow + 26),
    p(x(inn(W.armAxisElbow, 12)), Y.elbow),
  ),
  C(
    p(x(inn(W.armAxisElbow, 14)), Y.elbow - 24),
    p(x(inn(W.armAxisTop, 14)), Y.nipple),
    p(x(inn(W.armAxisTop, 12)), Y.armpit + 2),
  ),
  Z,
);

/**
 * Leg: crotch → inner thigh → knee → calf → ankle → foot → back up the outside to the hip.
 *
 * Built around its own axis, like the arm. Both edges are measured from the LEG's centre line, so
 * the limb has a real thickness at every height instead of two edges that happen to be near each
 * other.
 */
const LEG_HALF = path(
  M(p(CX - 4, Y.crotch - 6)),
  // Inner thigh down to the knee.
  C(
    p(x(inn(W.legAxisHip, W.thighTop - 4)), Y.thighMid - 30),
    p(x(inn(W.legAxisKnee, W.thighMidW - 2)), Y.thighMid + 20),
    p(x(inn(W.legAxisKnee, W.kneeW)), Y.kneeTop),
  ),
  // Knee, then the inner calf and ankle.
  C(
    p(x(inn(W.legAxisKnee, W.kneeW - 1)), Y.kneeBottom + 10),
    p(x(inn(W.legAxisAnkle, W.calfW - 2)), Y.calfMid + 10),
    p(x(inn(W.legAxisAnkle, W.ankleW)), Y.ankle),
  ),
  C(p(x(inn(W.legAxisAnkle, W.ankleW)), Y.ankle + 10), p(x(inn(W.legAxisAnkle, W.ankleW + 1)), Y.foot - 4), p(x(inn(W.legAxisAnkle, W.ankleW + 2)), Y.foot)),
  // The foot, pointing outward.
  L(p(x(out(W.legAxisAnkle, W.ankleW + 8)), Y.foot + 1)),
  C(
    p(x(out(W.legAxisAnkle, W.ankleW + 11)), Y.foot - 6),
    p(x(out(W.legAxisAnkle, W.ankleW + 2)), Y.foot - 12),
    p(x(out(W.legAxisAnkle, W.ankleW + 1)), Y.ankle),
  ),
  // Outer calf, swelling at the gastrocnemius.
  C(
    p(x(out(W.legAxisAnkle, W.calfW)), Y.calfMid + 16),
    p(x(out(W.legAxisKnee, W.calfW + 1)), Y.calfMid - 26),
    p(x(out(W.legAxisKnee, W.kneeW)), Y.kneeBottom),
  ),
  // Knee up the outside of the thigh to the hip.
  C(
    p(x(out(W.legAxisKnee, W.kneeW + 3)), Y.kneeTop - 14),
    p(x(out(W.legAxisHip, W.thighMidW + 3)), Y.thighMid - 40),
    p(x(W.hip - 1), Y.hip + 6),
  ),
  C(p(x(W.hip - 8), Y.crotch - 20), p(x(16), Y.crotch - 12), p(CX - 4, Y.crotch - 6)),
  Z,
);

/**
 * The body under the muscles. An array rather than one string so each part can be simple, and so
 * a part that is wrong is obvious on its own instead of deforming its neighbours.
 *
 * Front and back share the outline — a mirrored silhouette would be the same pixels. They differ
 * in the muscles drawn on top, which is the only difference that carries information.
 */
export const SILHOUETTE: Record<BodySide, string[]> = {
  // `spanMidline` and not `pair` for the torso: the two halves would each stroke their closing
  // edge down the midline. The arms and legs are genuinely two shapes and pair correctly.
  front: [HEAD, NECK, spanMidline(TORSO_HALF), ...pair(ARM_HALF), ...pair(LEG_HALF)],
  back: [HEAD, NECK, spanMidline(TORSO_HALF), ...pair(ARM_HALF), ...pair(LEG_HALF)],
};

/* ── front-view muscles ─────────────────────────────────────────────────────────────────── */

/** Sternocleidomastoid: the cord from behind the ear down to the sternum. */
const NECK_FRONT = path(
  M(p(x(W.neck - 5), Y.chin - 4)),
  C(p(x(W.neck - 6), Y.jaw + 8), p(x(9), Y.jaw + 14), p(x(3), Y.sternumTop)),
  C(p(x(1), Y.sternumTop - 4), p(x(5), Y.jaw + 8), p(x(6), Y.chin - 6)),
  Z,
);

/** Pectoralis major: broad at the sternum, tucking under the deltoid. */
/**
 * Pectoralis major in its two visible parts: the clavicular head running up towards the collarbone
 * and the sternal mass below it. One slug, two shapes — the seam between them is what stops the
 * chest reading as a single rounded plate.
 */
/*
 * The inner edge is 1.5 from the midline, not 3, so the sternal gap matches the linea alba below
 * it. At 3 the chest parted twice as wide as the abdomen and the two gaps stacked into a single
 * seam that widened as it climbed — the most conspicuous line on the figure, and one the reference
 * does not have at all.
 */
const CHEST_UPPER = path(
  M(p(CX - 1.5, Y.sternumTop + 6)),
  C(p(x(24), Y.sternumTop + 2), p(x(42), Y.shoulder + 6), p(x(W.chest - 2), Y.armpit + 2)),
  C(p(x(W.chest - 10), Y.armpit + 10), p(x(24), Y.armpit + 14), p(CX - 1.5, Y.armpit + 16)),
  Z,
);

const CHEST_LOWER = path(
  M(p(CX - 1.5, Y.armpit + 20)),
  C(p(x(26), Y.armpit + 18), p(x(W.chest - 6), Y.armpit + 12), p(x(W.chest - 4), Y.nipple)),
  C(p(x(W.chest - 6), Y.nipple + 14), p(x(W.chest - 14), Y.nipple + 26), p(x(30), Y.ribcage - 4)),
  C(p(x(18), Y.ribcage), p(x(6), Y.ribcage - 6), p(CX - 1.5, Y.ribcage - 12)),
  Z,
);

/** Anterior deltoid: the front third of the shoulder cap. */
const FRONT_DELT = path(
  M(p(x(W.chest - 4), Y.shoulder + 4)),
  C(p(x(inn(W.armAxisTop, 4)), Y.shoulder + 4), p(p(x(inn(W.armAxisTop, 2)), Y.armpit)[0], Y.armpit), p(x(inn(W.armAxisTop, 4)), Y.armpit + 14)),
  C(p(x(W.chest - 8), Y.armpit + 12), p(x(W.chest - 8), Y.armpit - 8), p(x(W.chest - 4), Y.shoulder + 4)),
  Z,
);

/** Lateral deltoid: the outer cap that gives the shoulder its width. */
const SIDE_DELT = path(
  M(p(x(inn(W.armAxisTop, 6)), Y.shoulder + 2)),
  C(p(x(out(W.armAxisTop, 13)), Y.shoulder + 6), p(x(out(W.armAxisTop, 15)), Y.armpit), p(x(out(W.armAxisTop, 13)), Y.armpit + 14)),
  C(p(x(W.armAxisTop), Y.armpit + 14), p(x(inn(W.armAxisTop, 5)), Y.armpit - 6), p(x(inn(W.armAxisTop, 6)), Y.shoulder + 2)),
  Z,
);

/** Biceps: the belly of the upper arm, stopping short of both joints. */
const BICEPS = path(
  M(p(x(out(W.armAxisTop, 11)), Y.armpit + 20)),
  C(p(x(out(W.armAxisElbow, 11)), Y.nipple + 30), p(x(out(W.armAxisElbow, 10)), Y.elbow - 26), p(x(out(W.armAxisElbow, 8)), Y.elbow - 12)),
  C(p(x(inn(W.armAxisElbow, 8)), Y.elbow - 10), p(x(inn(W.armAxisTop, 10)), Y.nipple + 26), p(x(inn(W.armAxisTop, 9)), Y.armpit + 22)),
  Z,
);

/** Forearm flexors, tapering to the wrist. */
const FOREARM_FRONT = path(
  M(p(x(out(W.armAxisElbow, 10)), Y.elbow - 2)),
  C(p(x(out(W.armAxisWrist, 10)), Y.elbow + 32), p(x(out(W.armAxisWrist, 8)), Y.wrist - 26), p(x(out(W.armAxisWrist, 5)), Y.wrist - 6)),
  C(p(x(inn(W.armAxisWrist, 5)), Y.wrist - 6), p(x(inn(W.armAxisWrist, 9)), Y.elbow + 30), p(x(inn(W.armAxisElbow, 10)), Y.elbow)),
  Z,
);

/**
 * Rectus abdominis, drawn as one column per side with the linea alba as the gap between them,
 * rather than as six separate blocks. At this size individual segments would be four-pixel
 * slivers that read as noise, and the slug is `abs`, not `abs-upper-left`.
 */
/**
 * One segment of the rectus abdominis. Three of these per side, separated by the tendinous
 * inscriptions — the gaps between them are as much of the information as the segments are, and
 * they are what makes an abdominal wall read as one rather than as a slab.
 *
 * The measured height of the whole column is 73 units, so a third of it is ~24: at the
 * component's rendered size that is roughly 26 px per segment, comfortably visible. The earlier
 * decision to draw one block was made on an assumption about size that turned out to be wrong.
 */
/*
 * The first coordinate is the half-width of the gap at the midline, and at 4 it was the widest line
 * on the figure: 4 either side is an eight-unit channel down a 260-unit body, and with the chest
 * gap and the neck strands landing on the same axis it read as one long seam from chin to pubis.
 * The reference draws the linea alba as a LINE — the segments nearly touch and the divider is the
 * stroke between them, the same grammar as every other boundary on the plate.
 */
const absSegment = (top: number, bottom: number, outerTop: number, outerBottom: number) =>
  path(
    M(p(x(1.5), top)),
    C(p(x(outerTop - 4), top - 2), p(p(x(outerTop), top + 4)[0], top + 4), p(x(outerTop), top + 8)),
    C(p(x(outerBottom + 1), bottom - 10), p(x(outerBottom), bottom - 4), p(x(outerBottom - 3), bottom)),
    L(p(x(1.5), bottom)),
    Z,
  );

/*
 * FOUR ROWS, not three.
 *
 * The reference draws an eight-pack: four pairs of segments between the ribcage and the pubis,
 * each shorter and narrower than the one above it. Three rows read as a torso with a line across
 * it; four read as abdominals, because the eye counts the repeats and the taper is what says
 * "these are one muscle divided" rather than "these are three shapes".
 */
const ABS_SEGMENTS = [
  absSegment(Y.ribcage + 2, Y.ribcage + 21, 21, 21),
  absSegment(Y.ribcage + 23, Y.ribcage + 42, 21, 20),
  absSegment(Y.navel - 8, Y.navel + 13, 20, 18),
  // The lowest segment is longer and tapers hardest — it runs to the pubis, not to the navel.
  absSegment(Y.navel + 15, Y.crotch - 16, 18, 10),
];

/** External oblique: the flank between the ribcage and the hip. */
const OBLIQUES = path(
  M(p(x(31), Y.ribcage - 4)),
  C(p(x(W.ribcage - 3), Y.ribcage + 14), p(x(W.waist), Y.waist + 12), p(x(W.waist - 5), Y.hip - 8)),
  // The inner edge stops at half-width 23. The rectus abdominis reaches out to 21.4, measured, so
  // anything smaller here has the flank lying on top of the abdominals — which is what a
  // point-sampled overlap check found at 16%. The oblique is LATERAL to the rectus, not over it.
  C(p(x(27), Y.hip - 12), p(x(24), Y.navel + 10), p(x(23), Y.navel - 14)),
  C(p(x(26), Y.ribcage + 6), p(x(29), Y.ribcage - 2), p(x(31), Y.ribcage - 4)),
  Z,
);

/**
 * Quadriceps: from the hip crease to just above the knee.
 *
 * Inset from the leg outline on BOTH edges. The first version was measured from the hip half-width
 * and spilled past the inner edge of the thigh, so it rendered as a green pill floating outside
 * the leg — clearly visible the moment the figure was drawn at size.
 */
/**
 * Quadriceps, as its three visible heads rather than one slab:
 *   vastus lateralis — the outer sweep, from the hip to just above the knee;
 *   rectus femoris   — the central column;
 *   vastus medialis  — the teardrop low on the inside, which only exists in the bottom third.
 *
 * All three carry the `quads` slug, so they light together and report one muscle. The division is
 * visual, and it is the single biggest reason the thigh now reads as a thigh.
 */
const VASTUS_LATERALIS = path(
  M(p(x(out(W.legAxisHip, W.thighTop - 6)), Y.crotch - 6)),
  C(
    p(x(out(W.legAxisHip, W.thighTop - 4)), Y.crotch + 20),
    p(x(out(W.legAxisHip, W.thighMidW - 1)), Y.thighMid + 10),
    p(x(out(W.legAxisKnee, W.kneeW - 3)), Y.kneeTop - 6),
  ),
  C(
    p(x(out(W.legAxisKnee, W.kneeW - 9)), Y.kneeTop - 2),
    p(x(out(W.legAxisKnee, W.kneeW - 11)), Y.kneeTop - 10),
    p(x(out(W.legAxisKnee, W.kneeW - 10)), Y.thighMid + 20),
  ),
  // The inner edge sat at half-width 29 while the rectus femoris beside it reached 26 — a
  // three-unit channel that showed the pale torso through the middle of a lit thigh, so a worked
  // quadriceps read as two blue stripes rather than one muscle. It now stops one unit short of its
  // neighbour, which is a stroke's width: a line, not a gap.
  C(
    p(x(out(W.legAxisHip, W.thighTop - 19)), Y.thighMid - 20),
    p(x(out(W.legAxisHip, W.thighTop - 17)), Y.crotch + 10),
    p(x(out(W.legAxisHip, W.thighTop - 6)), Y.crotch - 6),
  ),
  Z,
);

const RECTUS_FEMORIS = path(
  M(p(x(out(W.legAxisHip, W.thighTop - 19)), Y.crotch - 4)),
  C(
    p(x(out(W.legAxisHip, W.thighTop - 15)), Y.crotch + 16),
    p(x(out(W.legAxisKnee, W.kneeW - 12)), Y.thighMid + 20),
    p(x(out(W.legAxisKnee, W.kneeW - 13)), Y.kneeTop - 12),
  ),
  C(
    p(x(inn(W.legAxisKnee, W.kneeW - 8)), Y.kneeTop - 8),
    p(x(inn(W.legAxisKnee, W.kneeW - 6)), Y.thighMid + 24),
    p(x(inn(W.legAxisHip, W.thighTop - 17)), Y.crotch + 12),
  ),
  C(
    p(x(inn(W.legAxisHip, W.thighTop - 20)), Y.crotch),
    p(x(out(W.legAxisHip, W.thighTop - 21)), Y.crotch - 6),
    p(x(out(W.legAxisHip, W.thighTop - 19)), Y.crotch - 4),
  ),
  Z,
);

const VASTUS_MEDIALIS = path(
  M(p(x(inn(W.legAxisKnee, W.kneeW - 7)), Y.thighMid + 6)),
  C(
    p(x(inn(W.legAxisKnee, W.kneeW - 10)), Y.thighMid + 40),
    p(x(inn(W.legAxisKnee, W.kneeW - 9)), Y.kneeTop - 14),
    p(x(inn(W.legAxisKnee, W.kneeW - 4)), Y.kneeTop - 8),
  ),
  C(
    p(x(inn(W.legAxisKnee, W.kneeW - 1)), Y.kneeTop - 10),
    p(x(inn(W.legAxisKnee, W.kneeW - 2)), Y.thighMid + 30),
    p(x(inn(W.legAxisKnee, W.kneeW - 7)), Y.thighMid + 6),
  ),
  Z,
);

/** Adductors: the inner thigh, medial to the quadriceps. */
const ADDUCTORS = path(
  M(p(CX - 4, Y.crotch - 4)),
  C(
    p(x(inn(W.legAxisHip, W.thighTop - 16)), Y.crotch + 10),
    p(x(inn(W.legAxisHip, W.thighTop - 15)), Y.thighMid - 14),
    p(x(inn(W.legAxisKnee, W.thighMidW - 9)), Y.thighMid + 22),
  ),
  C(p(x(9), Y.thighMid + 12), p(x(5), Y.crotch + 22), p(CX - 4, Y.crotch - 4)),
  Z,
);

/** Abductors / gluteus medius: the outer hip, seen from the front as the flare above the thigh. */
const ABDUCTORS = path(
  M(p(x(W.waist + 3), Y.navel + 12)),
  C(p(x(W.hip - 1), Y.hip - 12), p(x(W.hip - 2), Y.hip + 10), p(x(W.thigh + 11), Y.crotch - 2)),
  C(p(x(W.thigh + 3), Y.crotch - 10), p(x(28), Y.hip - 6), p(x(W.waist + 3), Y.navel + 12)),
  Z,
);

/** Tibialis anterior — the shin. The `calves` slug lights from either view. */
const SHIN = path(
  M(p(x(out(W.legAxisKnee, W.kneeW - 3)), Y.kneeBottom + 2)),
  C(
    p(x(out(W.legAxisAnkle, W.calfW - 2)), Y.calfMid - 14),
    p(x(out(W.legAxisAnkle, W.calfW - 4)), Y.calfMid + 20),
    p(x(out(W.legAxisAnkle, W.ankleW - 1)), Y.ankle - 8),
  ),
  C(
    p(x(inn(W.legAxisAnkle, W.ankleW - 2)), Y.ankle - 8),
    p(x(inn(W.legAxisAnkle, W.calfW - 3)), Y.calfMid + 4),
    p(x(inn(W.legAxisKnee, W.kneeW - 3)), Y.kneeBottom + 4),
  ),
  Z,
);

/* ── back-view muscles ──────────────────────────────────────────────────────────────────── */

/** Upper trapezius: the diamond from the base of the skull out to the shoulders. */
const TRAPS = path(
  M(p(CX - 2, Y.sternumTop - 8)),
  C(p(x(16), Y.sternumTop - 8), p(x(38), Y.shoulder - 4), p(x(W.chest - 2), Y.shoulder + 10)),
  C(p(x(38), Y.armpit + 16), p(x(20), Y.nipple + 6), p(CX - 2, Y.nipple + 22)),
  Z,
);

/** Latissimus dorsi: the wing sweeping from the armpit down into the lower back. */
const LATS = path(
  M(p(x(W.chest - 6), Y.armpit)),
  C(p(x(W.chest - 2), Y.nipple + 14), p(x(W.ribcage - 1), Y.ribcage + 10), p(x(W.waist - 1), Y.waist + 16)),
  C(p(x(22), Y.waist + 6), p(x(14), Y.ribcage - 2), p(x(13), Y.nipple + 10)),
  C(p(x(24), Y.nipple - 2), p(x(34), Y.armpit - 2), p(x(W.chest - 6), Y.armpit)),
  Z,
);

/** Posterior deltoid. */
const REAR_DELT = path(
  M(p(x(W.chest - 4), Y.shoulder + 4)),
  C(p(x(out(W.armAxisTop, 12)), Y.shoulder + 8), p(x(out(W.armAxisTop, 14)), Y.armpit + 2), p(x(out(W.armAxisTop, 12)), Y.armpit + 16)),
  C(p(x(W.chest - 10), Y.armpit + 14), p(x(W.chest - 10), Y.armpit - 6), p(x(W.chest - 4), Y.shoulder + 4)),
  Z,
);

/** Triceps: the back of the upper arm, larger than the biceps as it should be. */
const TRICEPS = path(
  M(p(x(out(W.armAxisTop, 12)), Y.armpit + 18)),
  C(p(x(out(W.armAxisElbow, 12)), Y.nipple + 32), p(x(out(W.armAxisElbow, 11)), Y.elbow - 24), p(x(out(W.armAxisElbow, 9)), Y.elbow - 10)),
  C(p(x(inn(W.armAxisElbow, 9)), Y.elbow - 8), p(x(inn(W.armAxisTop, 11)), Y.nipple + 24), p(x(inn(W.armAxisTop, 10)), Y.armpit + 20)),
  Z,
);

/** Forearm extensors. */
const FOREARM_BACK = path(
  M(p(x(out(W.armAxisElbow, 10)), Y.elbow)),
  C(p(x(out(W.armAxisWrist, 10)), Y.elbow + 34), p(x(out(W.armAxisWrist, 8)), Y.wrist - 24), p(x(out(W.armAxisWrist, 5)), Y.wrist - 4)),
  C(p(x(inn(W.armAxisWrist, 5)), Y.wrist - 4), p(x(inn(W.armAxisWrist, 9)), Y.elbow + 32), p(x(inn(W.armAxisElbow, 10)), Y.elbow + 2)),
  Z,
);

/**
 * The neck seen from BEHIND: the strip between the base of the skull and the trapezius.
 *
 * The back view used to reuse the sternocleidomastoid, which is a front-of-neck muscle. Measured
 * by sampling points, it sat 42% inside the trapezius — so a click there returned whichever of the
 * two happened to be painted last.
 */
const NECK_BACK = path(
  M(p(x(11), Y.chin - 6)),
  C(p(x(11), Y.jaw + 2), p(x(9), Y.jaw + 6), p(x(7), Y.sternumTop - 10)),
  C(p(x(2), Y.sternumTop - 8), p(x(3), Y.jaw + 2), p(x(4), Y.chin - 8)),
  Z,
);

/** Erector spinae: the columns either side of the spine. */
const LOWER_BACK = path(
  M(p(x(3), Y.nipple + 10)),
  C(p(x(20), Y.ribcage - 4), p(x(23), Y.waist + 10), p(x(19), Y.hip - 6)),
  C(p(x(12), Y.hip - 2), p(x(5), Y.waist + 8), p(x(3), Y.nipple + 10)),
  Z,
);

/** Gluteus maximus. */
const GLUTES = path(
  M(p(CX - 4, Y.hip - 14)),
  C(p(x(20), Y.hip - 18), p(x(W.hip - 3), Y.hip - 8), p(x(W.hip - 5), Y.hip + 18)),
  C(p(x(W.hip - 9), Y.crotch), p(x(20), Y.crotch + 10), p(CX - 4, Y.crotch - 2)),
  Z,
);

/** Hamstrings: the back of the thigh, from the glute fold to the knee. */
const HAMSTRINGS = path(
  M(p(x(inn(W.legAxisHip, W.thighTop - 11)), Y.crotch + 4)),
  C(
    p(x(out(W.legAxisHip, W.thighTop - 3)), Y.crotch),
    p(x(out(W.legAxisHip, W.thighMidW + 1)), Y.thighMid + 8),
    p(x(out(W.legAxisKnee, W.kneeW - 5)), Y.kneeTop - 8),
  ),
  C(
    p(x(W.legAxisKnee), Y.kneeTop),
    p(x(inn(W.legAxisKnee, W.kneeW - 6)), Y.kneeTop),
    p(x(inn(W.legAxisKnee, W.kneeW - 5)), Y.kneeTop - 10),
  ),
  C(
    p(x(inn(W.legAxisKnee, W.thighMidW - 5)), Y.thighMid + 14),
    p(x(inn(W.legAxisHip, W.thighTop - 7)), Y.thighMid - 26),
    p(x(inn(W.legAxisHip, W.thighTop - 11)), Y.crotch + 4),
  ),
  Z,
);

/** Gastrocnemius: the calf, widest just below the knee. */
/** Gastrocnemius, drawn as its two heads — the lateral one sits slightly higher than the medial. */
const CALF_LATERAL = path(
  M(p(x(out(W.legAxisKnee, W.kneeW - 2)), Y.kneeBottom + 2)),
  C(
    p(x(out(W.legAxisAnkle, W.calfW - 1)), Y.calfMid - 18),
    p(x(out(W.legAxisAnkle, W.calfW - 2)), Y.calfMid + 16),
    p(x(out(W.legAxisAnkle, W.ankleW + 1)), Y.ankle - 12),
  ),
  C(
    p(x(out(W.legAxisAnkle, W.ankleW + 3)), Y.ankle - 16),
    p(x(W.legAxisKnee), Y.calfMid + 2),
    p(x(out(W.legAxisKnee, W.kneeW - 8)), Y.kneeBottom + 4),
  ),
  Z,
);

const CALF_MEDIAL = path(
  M(p(x(out(W.legAxisKnee, W.kneeW - 10)), Y.kneeBottom + 4)),
  C(
    p(x(inn(W.legAxisKnee, W.kneeW - 12)), Y.calfMid - 6),
    p(x(inn(W.legAxisAnkle, W.ankleW - 4)), Y.calfMid + 22),
    p(x(out(W.legAxisAnkle, W.ankleW - 1)), Y.ankle - 12),
  ),
  C(
    p(x(inn(W.legAxisAnkle, W.ankleW - 1)), Y.ankle - 14),
    p(x(inn(W.legAxisAnkle, W.calfW - 3)), Y.calfMid + 2),
    p(x(inn(W.legAxisKnee, W.kneeW - 2)), Y.kneeBottom + 4),
  ),
  Z,
);

/* ── the map ────────────────────────────────────────────────────────────────────────────── */

/* ── Anatomical detail ────────────────────────────────────────────────────────────────────────
 *
 * WHAT SEPARATES A SILHOUETTE FROM A PLATE.
 *
 * The reference draws structures this app's taxonomy does not have a slug for — serratus slips
 * over the ribs, the sartorius crossing the thigh, the brachialis beside the biceps, the
 * sternocleidomastoid down the neck, a kneecap, fingers. `muscle_groups` has nineteen rows and
 * none of them is any of those, and inventing slugs the database never issues would put regions on
 * the map that no exercise can ever light.
 *
 * So they are DETAIL: outlined, never filled, never selectable, never in the accessibility tree.
 * They are what makes the body read as a body — the drawing's grammar rather than its vocabulary.
 * A figure with twelve fillable regions and nothing between them is a diagram of twelve regions;
 * the same figure with the tissue drawn around them is an anatomy plate that happens to be
 * interactive.
 *
 * Everything here is measured from `landmarks.ts` like the muscles, and paired the same way, so
 * the detail cannot drift off the body when a landmark moves.
 */

/** Sternocleidomastoid: the two strands from behind the ear down to the sternum notch. */
const NECK_STRANDS = [
  path(M(p(x(W.jaw - 3), Y.jaw + 2)), C(p(x(W.neck - 2), Y.chin + 14), p(x(9), Y.sternumTop - 10), p(x(5), Y.sternumTop + 2))),
  path(M(p(x(W.jaw - 9), Y.jaw + 4)), C(p(x(W.neck - 7), Y.chin + 16), p(x(7), Y.sternumTop - 8), p(x(3), Y.sternumTop + 2))),
];

/** The clavicle, which is what gives the shoulder its shelf and the traps their lower edge. */
const CLAVICLE = [
  path(M(p(CX - 4, Y.sternumTop + 2)), C(p(x(20), Y.sternumTop - 4), p(x(38), Y.shoulder - 4), p(x(W.shoulder - 14), Y.shoulder + 2))),
];

/** Trapezius seen from the FRONT: the slope from the neck out over the clavicle. */
const TRAP_FRONT = [
  path(M(p(x(6), Y.chin + 12)), C(p(x(22), Y.sternumTop - 8), p(x(40), Y.sternumTop - 6), p(x(W.shoulder - 16), Y.shoulder))),
];

/**
 * Serratus anterior: the finger-like slips that interleave with the oblique over the ribs.
 *
 * Four of them, shortening downward, each angled toward the armpit — the direction they pull. This
 * is the single most recognisable structure on a front anatomy plate and its absence is most of
 * why the flank read as blank.
 */
const SERRATUS = [0, 1, 2, 3].map((i) =>
  path(
    M(p(x(W.ribcage - 6 - i * 2), Y.armpit + 30 + i * 15)),
    C(
      p(x(30 - i * 2), Y.armpit + 28 + i * 15),
      p(x(26 - i * 2), Y.armpit + 24 + i * 15),
      p(x(23 - i), Y.armpit + 22 + i * 15),
    ),
  ),
);

/** Brachialis: the strip that shows outside the biceps and disappears under it at the elbow. */
const BRACHIALIS = [
  path(
    M(p(x(out(W.armAxisTop, 11)), Y.armpit + 16)),
    C(p(x(out(W.armAxisElbow, 12)), Y.armpit + 46), p(x(out(W.armAxisElbow, 10)), Y.elbow - 26), p(x(out(W.armAxisElbow, 4)), Y.elbow - 4)),
  ),
];

/** The bundles of the forearm — four, converging on the wrist. */
const FOREARM_BUNDLES = [0, 1, 2, 3].map((i) =>
  path(
    M(p(x(out(W.armAxisElbow, 8 - i * 5)), Y.elbow + 4)),
    C(
      p(x(out(W.armAxisWrist, 7 - i * 4)), Y.elbow + 34),
      p(x(out(W.armAxisWrist, 5 - i * 3)), Y.wrist - 26),
      p(x(out(W.armAxisWrist, 3 - i * 2)), Y.wrist - 4),
    ),
  ),
);

/** Fingers: four creases across the hand, which is all it takes to stop reading as a mitten. */
const FINGERS = [0, 1, 2, 3].map((i) =>
  path(
    M(p(x(out(W.armAxisWrist, 7 - i * 4.5)), Y.wrist + 6)),
    L(p(x(out(W.armAxisWrist, 8 - i * 5.5)), Y.fingertip - 4)),
  ),
);

/**
 * Sartorius: the long strap from the hip point diagonally across the thigh to the inner knee.
 *
 * It is what divides the quadriceps from the adductors on a plate, and without it the front of the
 * thigh is one undivided field — which is exactly how ours read.
 */
const SARTORIUS = [
  path(
    M(p(x(W.hip - 6), Y.hip + 4)),
    C(p(x(W.legAxisHip + 6), Y.thighMid - 30), p(x(W.legAxisKnee - 6), Y.thighMid + 20), p(x(inn(W.legAxisKnee, 10)), Y.kneeTop - 10)),
  ),
];

/** Vastus medialis: the teardrop just above the inside of the knee. */
const VASTUS_TEARDROP = [
  path(
    M(p(x(inn(W.legAxisKnee, 12)), Y.thighMid + 34)),
    C(p(x(inn(W.legAxisKnee, 15)), Y.kneeTop - 26), p(x(inn(W.legAxisKnee, 13)), Y.kneeTop - 10), p(x(inn(W.legAxisKnee, 4)), Y.kneeTop - 4)),
    C(p(x(out(W.legAxisKnee, 2)), Y.kneeTop - 14), p(x(inn(W.legAxisKnee, 4)), Y.thighMid + 32), p(x(inn(W.legAxisKnee, 12)), Y.thighMid + 34)),
    Z,
  ),
];

/** The kneecap. A joint, not a muscle, and the figure looks boneless without it. */
const KNEECAP = [
  path(
    M(p(x(W.legAxisKnee - 7), Y.kneeTop + 2)),
    C(p(x(W.legAxisKnee - 9), Y.kneeTop + 12), p(x(W.legAxisKnee + 7), Y.kneeTop + 12), p(x(W.legAxisKnee + 6), Y.kneeTop + 2)),
    C(p(x(W.legAxisKnee + 5), Y.kneeTop - 6), p(x(W.legAxisKnee - 6), Y.kneeTop - 6), p(x(W.legAxisKnee - 7), Y.kneeTop + 2)),
    Z,
  ),
];

/** Tibialis anterior, running beside the shin bone. */
const TIBIALIS = [
  path(
    M(p(x(inn(W.legAxisKnee, 6)), Y.kneeBottom + 10)),
    C(p(x(inn(W.legAxisAnkle, 7)), Y.calfMid + 10), p(x(inn(W.legAxisAnkle, 5)), Y.calfMid + 50), p(x(inn(W.legAxisAnkle, 2)), Y.ankle - 8)),
  ),
];

/** Back: the spinal groove, and the shoulder blades either side of it. */
const SPINE = [path(M(p(CX, Y.sternumTop + 8)), L(p(CX, Y.hip - 6)))];

const SCAPULA = [
  path(
    M(p(x(12), Y.armpit - 4)),
    C(p(x(30), Y.armpit + 2), p(x(W.ribcage - 6), Y.armpit + 26), p(x(W.ribcage - 10), Y.ribcage - 4)),
  ),
  path(M(p(x(14), Y.armpit + 22)), L(p(x(W.ribcage - 8), Y.armpit + 14))),
];

/** The two heads of the gastrocnemius, meeting at the achilles. */
const CALF_SPLIT = [
  path(M(p(x(W.legAxisKnee), Y.kneeBottom + 10)), L(p(x(W.legAxisAnkle - 1), Y.ankle - 14))),
];

/**
 * The detail layer, per side.
 *
 * Ordered the way the body layers: the things that sit UNDER the muscles first, so a highlighted
 * region covers what should be behind it and not the other way round. In practice they are all
 * drawn in one stroke-only pass, so this ordering is for the reader.
 */
export const DETAIL: Record<BodySide, string[]> = {
  front: [
    ...NECK_STRANDS.flatMap(pair),
    ...CLAVICLE.flatMap(pair),
    ...TRAP_FRONT.flatMap(pair),
    ...SERRATUS.flatMap(pair),
    ...BRACHIALIS.flatMap(pair),
    ...FOREARM_BUNDLES.flatMap(pair),
    ...FINGERS.flatMap(pair),
    ...SARTORIUS.flatMap(pair),
    ...VASTUS_TEARDROP.flatMap(pair),
    ...KNEECAP.flatMap(pair),
    ...TIBIALIS.flatMap(pair),
  ],
  back: [
    ...NECK_STRANDS.flatMap(pair),
    ...SPINE,
    ...SCAPULA.flatMap(pair),
    ...FOREARM_BUNDLES.flatMap(pair),
    ...FINGERS.flatMap(pair),
    ...KNEECAP.flatMap(pair),
    ...CALF_SPLIT.flatMap(pair),
  ],
};

/* ── Fibre striations ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THE FIGURE WAS MISSING, measured: 42 paths and zero lines. Every muscle was one flat
 * silhouette, so the drawing read as a set of coloured regions rather than as a body — and both
 * mockups draw fine fibre lines inside every belly, which is the single thing that makes an
 * anatomical plate look like one.
 *
 * ═══ THEY ARE DECORATION, AND THAT IS STRUCTURAL ══════════════════════════════════════════════
 *
 * These carry NO slug and take NO fill. They are drawn in one `aria-hidden`, `pointer-events-none`
 * layer above the muscle fills, so they can never intercept a tap meant for a region that is
 * already below the 44px floor, and they cannot be confused with a selectable muscle by anything
 * reading the tree. A striation is a texture, not a target.
 *
 * ═══ AND THEY FOLLOW THE FIBRE, NOT THE OUTLINE ═══════════════════════════════════════════════
 *
 * Each line runs the direction the muscle actually pulls — the pec fans in toward the sternum, the
 * lat sweeps up and in toward the armpit, the rectus femoris runs straight down the thigh. Drawn
 * across the fibre they would read as bandages. Every coordinate comes from `landmarks.ts` for the
 * same reason the shapes do: move a landmark and the texture moves with the body.
 */

/** Chest: fans converging on the sternum, which is how the pec actually inserts. */
const CHEST_FIBRES = [
  path(M(p(CX - 6, Y.sternumTop + 12)), C(p(x(22), Y.sternumTop + 12), p(x(36), Y.shoulder + 4), p(x(W.chest - 8), Y.armpit))),
  path(M(p(CX - 6, Y.sternumTop + 22)), C(p(x(24), Y.sternumTop + 24), p(x(38), Y.armpit - 2), p(x(W.chest - 6), Y.armpit + 8))),
  path(M(p(CX - 6, Y.armpit + 4)), C(p(x(24), Y.armpit + 8), p(x(36), Y.armpit + 12), p(x(W.chest - 8), Y.armpit + 18))),
];

/** Deltoid: three short arcs radiating from the shoulder cap. */
const DELT_FIBRES = [
  path(M(p(x(W.shoulder - 20), Y.shoulder - 2)), Q(p(x(W.shoulder - 6), Y.shoulder + 8), p(x(W.shoulder - 8), Y.armpit + 2))),
  path(M(p(x(W.shoulder - 26), Y.shoulder + 2)), Q(p(x(W.shoulder - 14), Y.shoulder + 12), p(x(W.shoulder - 16), Y.armpit + 4))),
];

/** Abs: the tendinous intersections across, and the linea alba down the middle. */
const ABS_FIBRES = [
  // No stroke down the midline. The two rows of segments already leave a narrow channel there, and
  // a line drawn inside it made three parallel darks where the reference has one gap.
  path(M(p(x(16), Y.ribcage - 8)), L(p(x(-16, 1), Y.ribcage - 8))),
  path(M(p(x(15), Y.ribcage + 10)), L(p(x(-15, 1), Y.ribcage + 10))),
  path(M(p(x(14), Y.waist + 6)), L(p(x(-14, 1), Y.waist + 6))),
];

/** Obliques: diagonals running down and in toward the hip. */
const OBLIQUE_FIBRES = [
  path(M(p(x(W.ribcage - 4), Y.ribcage)), L(p(x(W.waist - 6), Y.navel + 4))),
  path(M(p(x(W.ribcage - 2), Y.ribcage + 12)), L(p(x(W.waist - 4), Y.navel + 14))),
];

/** Upper arm: two lines along the bone, which is the direction of every head of it. */
const UPPER_ARM_FIBRES = [
  path(M(p(x(W.armAxisTop - 5), Y.armpit + 6)), C(p(x(W.armAxisElbow - 7), Y.armpit + 40), p(x(W.armAxisElbow - 6), Y.elbow - 30), p(x(W.armAxisElbow - 4), Y.elbow - 6))),
  path(M(p(x(W.armAxisTop + 4), Y.armpit + 8)), C(p(x(W.armAxisElbow + 4), Y.armpit + 42), p(x(W.armAxisElbow + 5), Y.elbow - 28), p(x(W.armAxisElbow + 5), Y.elbow - 6))),
];

/** Forearm: one line, because at this scale two is a smudge. */
const FOREARM_FIBRES = [
  path(M(p(x(W.armAxisElbow - 2), Y.elbow + 6)), C(p(x(W.armAxisWrist - 3), Y.elbow + 30), p(x(W.armAxisWrist - 2), Y.wrist - 20), p(x(W.armAxisWrist - 2), Y.wrist - 6))),
];

/** Quadriceps: the three heads, running the length of the thigh. */
const QUAD_FIBRES = [
  path(M(p(x(W.legAxisHip - 12), Y.crotch + 6)), C(p(x(W.legAxisKnee - 14), Y.thighMid - 20), p(x(W.legAxisKnee - 12), Y.thighMid + 20), p(x(W.legAxisKnee - 9), Y.kneeTop - 8))),
  path(M(p(x(W.legAxisHip), Y.crotch + 4)), C(p(x(W.legAxisKnee), Y.thighMid - 20), p(x(W.legAxisKnee), Y.thighMid + 20), p(x(W.legAxisKnee), Y.kneeTop - 6))),
  path(M(p(x(W.legAxisHip + 11), Y.crotch + 8)), C(p(x(W.legAxisKnee + 12), Y.thighMid - 16), p(x(W.legAxisKnee + 11), Y.thighMid + 22), p(x(W.legAxisKnee + 8), Y.kneeTop - 8))),
];

/** Shin: one line beside the bone. */
const SHIN_FIBRES = [
  path(M(p(x(W.legAxisKnee - 4), Y.kneeBottom + 6)), C(p(x(W.legAxisAnkle - 5), Y.calfMid), p(x(W.legAxisAnkle - 4), Y.calfMid + 40), p(x(W.legAxisAnkle - 3), Y.ankle - 10))),
];

/** Trapezius: the diagonal from the neck out to the shoulder. */
const TRAP_FIBRES = [
  path(M(p(CX - 4, Y.chin + 10)), L(p(x(W.shoulder - 22), Y.shoulder + 4))),
  path(M(p(CX - 4, Y.sternumTop + 10)), L(p(x(W.ribcage - 2), Y.armpit + 16))),
];

/** Latissimus: sweeps up and IN, toward the armpit it inserts under. */
const LAT_FIBRES = [
  path(M(p(x(W.waist - 6), Y.ribcage + 16)), C(p(x(W.ribcage - 8), Y.ribcage), p(x(W.chest - 10), Y.armpit + 14), p(x(W.chest - 6), Y.armpit + 4))),
  path(M(p(x(W.waist - 4), Y.navel)), C(p(x(W.ribcage - 4), Y.ribcage + 8), p(x(W.chest - 6), Y.armpit + 22), p(x(W.chest - 2), Y.armpit + 12))),
];

/** Lower back: the erectors, two short columns beside the spine. */
const LOWER_BACK_FIBRES = [
  path(M(p(x(10), Y.ribcage + 14)), L(p(x(12), Y.hip - 10))),
];

/** Glute: an arc following the fold. */
const GLUTE_FIBRES = [
  path(M(p(x(W.hip - 10), Y.hip - 10)), Q(p(x(20), Y.hip + 14), p(x(6), Y.crotch - 2))),
];

/** Hamstrings: the long heads down the back of the thigh. */
const HAMSTRING_FIBRES = [
  path(M(p(x(W.legAxisHip - 9), Y.crotch + 8)), C(p(x(W.legAxisKnee - 11), Y.thighMid), p(x(W.legAxisKnee - 10), Y.thighMid + 30), p(x(W.legAxisKnee - 8), Y.kneeTop - 8))),
  path(M(p(x(W.legAxisHip + 8), Y.crotch + 8)), C(p(x(W.legAxisKnee + 10), Y.thighMid), p(x(W.legAxisKnee + 9), Y.thighMid + 30), p(x(W.legAxisKnee + 7), Y.kneeTop - 8))),
];

/** Calf: the two heads of the gastrocnemius, meeting at the achilles. */
const CALF_FIBRES = [
  path(M(p(x(W.legAxisKnee - 8), Y.kneeBottom + 8)), C(p(x(W.legAxisAnkle - 9), Y.calfMid), p(x(W.legAxisAnkle - 5), Y.calfMid + 34), p(x(W.legAxisAnkle - 2), Y.ankle - 12))),
  path(M(p(x(W.legAxisKnee + 7), Y.kneeBottom + 8)), C(p(x(W.legAxisAnkle + 8), Y.calfMid), p(x(W.legAxisAnkle + 4), Y.calfMid + 34), p(x(W.legAxisAnkle + 1), Y.ankle - 12))),
];

/**
 * The texture layer, per side. Mirrored like everything else, so the two halves cannot drift.
 *
 * Ordered roughly top to bottom, which matters only for reading the source — they are all drawn in
 * one pass with one stroke and never overlap enough for paint order to show.
 */
export const STRIATIONS: Record<BodySide, string[]> = {
  front: [
    ...CHEST_FIBRES.flatMap(pair),
    ...DELT_FIBRES.flatMap(pair),
    ...ABS_FIBRES,
    ...OBLIQUE_FIBRES.flatMap(pair),
    ...UPPER_ARM_FIBRES.flatMap(pair),
    ...FOREARM_FIBRES.flatMap(pair),
    ...QUAD_FIBRES.flatMap(pair),
    ...SHIN_FIBRES.flatMap(pair),
  ],
  back: [
    ...TRAP_FIBRES.flatMap(pair),
    ...DELT_FIBRES.flatMap(pair),
    ...LAT_FIBRES.flatMap(pair),
    ...UPPER_ARM_FIBRES.flatMap(pair),
    ...FOREARM_FIBRES.flatMap(pair),
    ...LOWER_BACK_FIBRES.flatMap(pair),
    ...GLUTE_FIBRES.flatMap(pair),
    ...HAMSTRING_FIBRES.flatMap(pair),
    ...CALF_FIBRES.flatMap(pair),
  ],
};

export const MUSCLES: MuscleShape[] = [
  // front
  { slug: 'neck', side: 'front', d: pair(NECK_FRONT) },
  { slug: 'chest', side: 'front', d: [...pair(CHEST_UPPER), ...pair(CHEST_LOWER)] },
  { slug: 'front-delts', side: 'front', d: pair(FRONT_DELT) },
  { slug: 'side-delts', side: 'front', d: pair(SIDE_DELT) },
  { slug: 'biceps', side: 'front', d: pair(BICEPS) },
  { slug: 'forearms', side: 'front', d: pair(FOREARM_FRONT) },
  { slug: 'abs', side: 'front', d: ABS_SEGMENTS.flatMap(pair) },
  { slug: 'obliques', side: 'front', d: pair(OBLIQUES) },
  { slug: 'quads', side: 'front', d: [...pair(VASTUS_LATERALIS), ...pair(RECTUS_FEMORIS), ...pair(VASTUS_MEDIALIS)] },
  { slug: 'adductors', side: 'front', d: pair(ADDUCTORS) },
  { slug: 'abductors', side: 'front', d: pair(ABDUCTORS) },
  { slug: 'calves', side: 'front', d: pair(SHIN) },

  // back
  { slug: 'neck', side: 'back', d: pair(NECK_BACK) },
  { slug: 'traps', side: 'back', d: pair(TRAPS) },
  { slug: 'rear-delts', side: 'back', d: pair(REAR_DELT) },
  { slug: 'lats', side: 'back', d: pair(LATS) },
  { slug: 'triceps', side: 'back', d: pair(TRICEPS) },
  { slug: 'forearms', side: 'back', d: pair(FOREARM_BACK) },
  { slug: 'lower-back', side: 'back', d: pair(LOWER_BACK) },
  { slug: 'glutes', side: 'back', d: pair(GLUTES) },
  { slug: 'hamstrings', side: 'back', d: pair(HAMSTRINGS) },
  { slug: 'calves', side: 'back', d: [...pair(CALF_LATERAL), ...pair(CALF_MEDIAL)] },
];

export const MUSCLES_BY_SIDE: Record<BodySide, MuscleShape[]> = {
  front: MUSCLES.filter((m) => m.side === 'front'),
  back: MUSCLES.filter((m) => m.side === 'back'),
};

export { VIEW, mirror } from './landmarks';
