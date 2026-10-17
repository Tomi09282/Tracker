"""Panel segmentation of the neutral renders: a seeded watershed on the render's own grooves.

Every panel of the render (muscle or not) gets a seed; the watershed floods outward from all
seeds at once over the groove response (dark, thin lines = high), so two neighbouring panels
meet ON the groove between them, and where a groove has a gap the two floods meet in the gap
instead of one panel leaking into the next (what a plain flood fill does on these renders).

Seeds are canvas coordinates (597 x 1261) on the viewer's LEFT half and are mirrored (x' = MX - x)
unless listed under MID. Names starting with `x.` are panels that belong to no muscle.
"""
from __future__ import annotations

from common import *  # noqa: F401,F403

RIM = 4.0  # canvas px of silhouette rim kept out of the flooding
#: the ridge cut needs less: the ridge map walls the rim light off by itself, and the lateral
#: thigh strip at the back is hardly wider than 4 px of rim
RIM_RIDGE = 2.0
#: the ridge strength (luminance units) that counts as a full groove wall
RIDGE_FULL = 10.0
MX = 595.0  # mirror axis x 297.5 (the renders' body centre, measured on the silhouettes)

#: The seeds of the first cut (mode "groove", stage 1): the local-mean groove response only.
SEEDS_GROOVE = {
    'front': {
        'x.head': [(297, 120), (297, 175)],
        'neck': [(278, 222), (297, 240)],
        'chest': [(250, 320)],
        'cap': [(178, 315)],
        'biceps': [(152, 405)],
        'x.uparm-lat': [(131, 410)],
        'forearms': [(118, 520), (150, 495), (100, 560)],
        'x.hand': [(95, 640)],
        'abs': [(272, 400), (272, 436), (272, 478), (275, 540)],
        'obliques': [(236, 470)],
        'x.side': [(220, 405)],
        'x.hip': [(212, 565)],
        'x.groin': [(297, 600)],
        'quads': [(238, 700)],
        'x.thigh-lat': [(200, 680)],
        'x.thigh-med': [(268, 680), (262, 790)],
        'x.knee': [(235, 862)],
        'x.knee-lat': [(205, 850)],
        'calves': [(243, 960)],
        'x.shin': [(207, 960)],
        'x.foot': [(240, 1150)],
    },
    'back': {
        'x.head': [(297, 120)],
        'neck': [(297, 215)],
        'traps': [(265, 215), (240, 250), (275, 330)],
        'x.scap': [(222, 300), (210, 340)],
        'rear-delts': [(170, 300)],
        'triceps': [(148, 400), (128, 420), (165, 360)],
        'forearms': [(118, 520), (140, 500), (100, 560)],
        'x.hand': [(95, 640)],
        'lats': [(252, 445)],
        'lower-back': [(285, 480)],
        'glutes': [(245, 605), (218, 535)],
        'hamstrings': [(205, 745), (215, 745), (250, 745)],
        'x.thigh-med': [(280, 720)],
        'x.knee': [(240, 845)],
        'calves': [(214, 930), (248, 930)],
        'x.achilles': [(232, 1060)],
        'x.foot': [(240, 1150)],
    },
}
#: The seeds of the second cut (mode "ridge", fix round 1): every panel the arms, the back and
#: the back of the legs have gets a seed of its own, so no flood has to cross a groove to fill a
#: panel nobody claimed (the old cut let the forearm run up the triceps' inner strip and the glute
#: run down the inner thigh).
SEEDS_RIDGE = {
    'front': {
        'x.head': [(297, 120), (297, 175)],
        'neck': [(278, 222), (297, 240)],
        'chest': [(250, 320)],
        'cap': [(178, 315)],
        'biceps': [(152, 405)],
        'x.uparm-lat': [(131, 410)],
        'forearms': [(118, 520), (150, 495), (100, 560)],
        'x.hand': [(95, 640)],
        'abs': [(272, 400), (272, 436), (272, 478), (275, 540)],
        'obliques': [(236, 470)],
        'x.side': [(220, 405)],
        'x.hip': [(212, 565)],
        'x.groin': [(297, 600)],
        'quads': [(238, 700)],
        'x.thigh-lat': [(200, 680)],
        'x.thigh-med': [(268, 680), (262, 790)],
        'x.knee': [(235, 862)],
        'x.knee-lat': [(205, 850)],
        'calves': [(243, 960)],
        'x.shin': [(207, 960)],
        'x.foot': [(240, 1150)],
    },
    'back': {
        'x.head': [(297, 120)],
        'neck': [(297, 215)],
        'traps': [(265, 215), (240, 250), (275, 330)],
        'x.scap': [(222, 300), (210, 340)],
        'rear-delts': [(170, 300), (155, 320)],
        'triceps': [(148, 380), (140, 420), (178, 360), (172, 420), (152, 440), (182, 395)],
        'x.uparm-lat': [(128, 390)],
        'x.elbow': [(137, 472)],
        'forearms': [(118, 540), (140, 530), (100, 570), (150, 500), (125, 500)],
        'x.hand': [(95, 640)],
        'lats': [(252, 445)],
        'lower-back': [(285, 480)],
        'glutes': [(245, 605), (228, 550), (265, 540), (270, 640), (255, 655), (230, 650)],
        'x.hip': [(197, 600), (202, 545)],
        'hamstrings': [(225, 690), (255, 690), (222, 740), (254, 740), (219, 790), (250, 805), (258, 830)],
        'x.thigh-lat': [(196, 690), (195, 730), (194, 770), (193, 810), (192, 840)],
        'x.thigh-med': [(280, 720), (284, 690), (283, 760)],
        'x.flank': [(205, 440), (212, 495), (224, 507)],
        'x.knee': [(231, 830)],
        'calves': [(214, 930), (248, 930)],
        'x.achilles': [(232, 1060)],
        'x.foot': [(240, 1150)],
    },
}
SEEDS = {"groove": SEEDS_GROOVE, "ridge": SEEDS_RIDGE}

MID = {
    'front': {'x.head', 'x.groin'},
    'back': {'x.head', 'neck'},
}


def groove_response(side: str):
    """Work-resolution luminance, body mask and groove response (local mean minus pixel)."""
    lum = up(luminance(load_rgb(NEUTRAL[side])))
    body = ndi.binary_fill_holes(lum > 14)
    body = ndi.binary_opening(body, disk(1.5 * S))
    th = ndi.gaussian_filter(lum, 2.5 * S) - lum
    return lum, body, th


def ridge_response(lum: np.ndarray, sigma: float = 1.0) -> np.ndarray:
    """Dark-line (valley) strength: the larger Hessian eigenvalue of the luminance at `sigma`
    canvas px, scale-normalised. A groove of the render is a thin dark line, so it answers
    strongly and continuously, while a broad shadow (a dark panel, the side of the torso) does
    not, which the local-mean difference above cannot tell apart."""
    s = sigma * S
    hxx = ndi.gaussian_filter(lum, s, order=(0, 2))
    hyy = ndi.gaussian_filter(lum, s, order=(2, 0))
    hxy = ndi.gaussian_filter(lum, s, order=(1, 1))
    l1 = (hxx + hyy) / 2 + np.sqrt(((hxx - hyy) / 2) ** 2 + hxy ** 2)
    return np.clip(l1, 0, None) * s * s


def segment(side: str, mode: str = "groove", seeds=None, mid=None):
    """Returns (labels, names, lum, body): labels 1..n index `names`, 0 = background.

    mode "groove": the stage 1 cut, unchanged. mode "ridge": the elevation also takes the Hessian
    ridge, the background is everything outside the silhouette, and a label keeps only the pieces
    that hold one of its seeds."""
    ridge = mode == "ridge"
    seeds = seeds or SEEDS[mode][side]
    mid = mid if mid is not None else MID[side]
    lum, body, th = groove_response(side)
    names = list(seeds)
    markers = np.zeros(body.shape, np.int16)
    if ridge:
        # background: everything outside the silhouette, so no panel's flood can run round the
        # body along the band just outside it
        markers[~body] = -1
    else:
        markers[~ndi.binary_dilation(body, disk(2 * S))] = -1  # background floods from outside
    r = 2 * S
    for i, name in enumerate(names, start=1):
        pts = list(seeds[name])
        if name not in mid:
            pts += [(MX - x, y) for x, y in seeds[name]]
        for x, y in pts:
            yy, xx = int(round(y * S)), int(round(x * S))
            sl = (slice(max(0, yy - r), yy + r + 1), slice(max(0, xx - r), xx + r + 1))
            patch = disk(r)[: sl[0].stop - sl[0].start, : sl[1].stop - sl[1].start]
            markers[sl][patch] = i
    # Elevation: grooves high, panel interiors low. Two answers to "is this a groove", and the
    # higher one counts: the local-mean difference (dark against the panel around it; finds the
    # faint, wide lines of the thighs) and the Hessian ridge (thin dark lines; continuous along
    # the arms' and the back's grooves, where the first one has gaps a flood runs through).
    elev = np.clip(ndi.gaussian_filter(th, 0.7 * S) + 8, 0, 60) / 60
    if ridge:
        rr = ndi.gaussian_filter(ridge_response(lum), 0.3 * S)
        elev = np.maximum(elev, np.clip(rr / RIDGE_FULL, 0, 1))
    elev = elev * 65535
    # The silhouette's rim light is one continuous bright channel around the whole body: left in,
    # it is a highway along which one seed floods every panel it touches. It takes no part in
    # the flooding and goes to the nearest panel afterwards.
    rim = body & (ndi.distance_transform_edt(body) < (RIM_RIDGE if ridge else RIM) * S)
    elev[~body | rim] = 65535
    markers[rim & (markers > 0)] = 0
    labels = ndi.watershed_ift(elev.astype(np.uint16), markers)
    labels[labels < 0] = 0
    labels[rim] = 0
    # A flood that crossed a full groove wall (or the rim) to reach a panel without a seed of its
    # own leaves a piece of its label far from its seeds: only the pieces that hold a seed stay.
    seeded = markers > 0
    for i in range(1, len(names) + 1 if ridge else 1):
        lab, n = ndi.label(labels == i)
        if n > 1:
            keep = np.unique(lab[seeded & (lab > 0)])
            labels[(lab > 0) & ~np.isin(lab, keep)] = 0
    hole = body & (labels == 0)
    if hole.any():
        _, (iy, ix) = ndi.distance_transform_edt(labels == 0, return_indices=True)
        labels[hole] = labels[iy[hole], ix[hole]]
    labels[~body] = 0
    return labels, names, lum, body
