"""
desk_rebuild_v1.py
GhPython / Rhino 8 Python Script component code.

Purpose:
- Rebuild an approximate Python/RhinoCommon version of desk(8).ghx with the same main RH_IN/RH_OUT names.
- Designed to be placed inside a Grasshopper Python Script component, then called by Rhino.Compute/Hops.

Expected GH inputs:
    length, width, frame_inset, leg_width, frame_edge_thickness, round,
    leg_height, leg_open, leg_tiptoe_degree, frame_thickness,
    lower_leg_depth, upper_leg_depth, leg_belly_depth

Expected GH outputs:
    desk, bounding_height, bounding_width, bounding_length,
    wood_volume, surface_area_total, errors

Notes:
- This is a reconstruction, not a byte-for-byte translation of the GHX graph.
- It preserves the same I/O idea and generates a parametrically similar table:
  rounded tabletop + inner frame + four tapered/slanted legs.
"""

import math
import json

import Rhino.Geometry as rg


# ----------------------------
# Defaults from the uploaded GHX sliders
# ----------------------------
DEFAULTS = {
    "length": 1014.0,
    "width": 1300.0,
    "frame_inset": 200.0,
    "leg_width": 26.0,
    "frame_edge_thickness": 25.0,
    "round": 10.0,
    "leg_height": 703.0,
    "leg_open": 92.0,
    "leg_tiptoe_degree": 1.0,
    "frame_thickness": 82.327,
    "lower_leg_depth": 0.389,
    "upper_leg_depth": 104.279,
    "leg_belly_depth": 110.809,
}


def _get(name):
    """Read a GH input if it exists; otherwise use default."""
    try:
        v = globals().get(name, None)
        if v is None:
            return DEFAULTS[name]
        return float(v)
    except Exception:
        return DEFAULTS[name]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def rounded_rectangle_curve(length, width, radius, z=0.0):
    """Create a planar rounded rectangle curve centered at origin."""
    L = float(length)
    W = float(width)
    r = clamp(float(radius), 0.0, min(L, W) * 0.49)
    x = L / 2.0
    y = W / 2.0

    if r <= 0.001:
        pts = [
            rg.Point3d(-x, -y, z), rg.Point3d(x, -y, z),
            rg.Point3d(x, y, z), rg.Point3d(-x, y, z),
            rg.Point3d(-x, -y, z)
        ]
        return rg.Polyline(pts).ToNurbsCurve()

    pc = rg.PolyCurve()

    # Start at bottom edge after bottom-left fillet, go clockwise.
    pts = {
        "b1": rg.Point3d(-x + r, -y, z),
        "b2": rg.Point3d(x - r, -y, z),
        "r1": rg.Point3d(x, -y + r, z),
        "r2": rg.Point3d(x, y - r, z),
        "t1": rg.Point3d(x - r, y, z),
        "t2": rg.Point3d(-x + r, y, z),
        "l1": rg.Point3d(-x, y - r, z),
        "l2": rg.Point3d(-x, -y + r, z),
    }

    def add_line(a, b):
        pc.Append(rg.Line(a, b).ToNurbsCurve())

    def add_arc(center, start_angle, end_angle):
        # Angles in radians on XY plane.
        p0 = rg.Point3d(center.X + r * math.cos(start_angle), center.Y + r * math.sin(start_angle), z)
        pm = rg.Point3d(center.X + r * math.cos((start_angle + end_angle) / 2.0),
                       center.Y + r * math.sin((start_angle + end_angle) / 2.0), z)
        p1 = rg.Point3d(center.X + r * math.cos(end_angle), center.Y + r * math.sin(end_angle), z)
        pc.Append(rg.Arc(p0, pm, p1).ToNurbsCurve())

    add_line(pts["b1"], pts["b2"])
    add_arc(rg.Point3d(x-r, -y+r, z), -math.pi/2.0, 0.0)
    add_line(pts["r1"], pts["r2"])
    add_arc(rg.Point3d(x-r, y-r, z), 0.0, math.pi/2.0)
    add_line(pts["t1"], pts["t2"])
    add_arc(rg.Point3d(-x+r, y-r, z), math.pi/2.0, math.pi)
    add_line(pts["l1"], pts["l2"])
    add_arc(rg.Point3d(-x+r, -y+r, z), math.pi, 3.0*math.pi/2.0)

    pc.MakeClosed(0.01)
    return pc


def extrude_curve_to_brep(profile, height):
    ext = rg.Extrusion.Create(profile, float(height), True)
    if ext:
        return ext.ToBrep()
    return None


def box_brep(center, sx, sy, sz):
    cx, cy, cz = center
    x = sx / 2.0
    y = sy / 2.0
    z = sz / 2.0
    bbox = rg.BoundingBox(
        rg.Point3d(cx - x, cy - y, cz - z),
        rg.Point3d(cx + x, cy + y, cz + z)
    )
    return rg.Brep.CreateFromBox(bbox)


def face_from_points(a, b, c, d, tol=0.01):
    return rg.Brep.CreateFromCornerPoints(a, b, c, d, tol)


def tapered_leg_brep(sx, sy, L, W, p):
    """
    Create one slanted tapered leg near one corner.
    sx/sy are signs: -1 or 1.
    """
    frame_inset = p["frame_inset"]
    leg_w = p["leg_width"]
    leg_h = p["leg_height"]
    leg_open = p["leg_open"]
    top_depth = max(p["upper_leg_depth"], leg_w)
    # lower_leg_depth in the GHX appears as a small ratio; convert to usable depth.
    bottom_depth = max(top_depth * clamp(p["lower_leg_depth"], 0.2, 1.0), leg_w * 0.8)
    bottom_w = max(leg_w * clamp(p["leg_tiptoe_degree"], 0.35, 1.0), 4.0)

    z0 = 0.0
    z1 = leg_h

    # Top center sits inward from tabletop corner. Bottom center opens outward.
    tx = sx * (L/2.0 - frame_inset)
    ty = sy * (W/2.0 - frame_inset)
    bx = tx + sx * leg_open
    by = ty + sy * leg_open

    # Local axes: X width, Y depth. This keeps all legs comparable.
    def rect_pts(cx, cy, z, rw, rd):
        return [
            rg.Point3d(cx - rw/2.0, cy - rd/2.0, z),
            rg.Point3d(cx + rw/2.0, cy - rd/2.0, z),
            rg.Point3d(cx + rw/2.0, cy + rd/2.0, z),
            rg.Point3d(cx - rw/2.0, cy + rd/2.0, z),
        ]

    b = rect_pts(bx, by, z0, bottom_w, bottom_depth)
    t = rect_pts(tx, ty, z1, leg_w, top_depth)

    faces = [
        face_from_points(b[0], b[1], b[2], b[3]),  # bottom
        face_from_points(t[3], t[2], t[1], t[0]),  # top
        face_from_points(b[0], t[0], t[1], b[1]),
        face_from_points(b[1], t[1], t[2], b[2]),
        face_from_points(b[2], t[2], t[3], b[3]),
        face_from_points(b[3], t[3], t[0], b[0]),
    ]
    faces = [f for f in faces if f]
    joined = rg.Brep.JoinBreps(faces, 0.01)
    if joined and len(joined) > 0:
        return joined[0]
    return faces[0] if faces else None


def create_table(params):
    L = params["length"]
    W = params["width"]
    leg_h = params["leg_height"]
    top_thk = max(params["frame_edge_thickness"], 10.0)
    frame_thk = max(params["frame_thickness"], 10.0)
    inset = clamp(params["frame_inset"], 0.0, min(L, W) * 0.45)
    edge = max(params["frame_edge_thickness"], 5.0)

    breps = []

    # Tabletop: rounded rectangle extruded upward, then shifted so bottom sits at leg_h.
    profile = rounded_rectangle_curve(L, W, params["round"], leg_h)
    tabletop = extrude_curve_to_brep(profile, top_thk)
    if tabletop:
        breps.append(tabletop)

    # Frame rails under tabletop.
    z_frame = leg_h - frame_thk / 2.0
    inner_L = max(L - 2.0 * inset, edge * 2.0)
    inner_W = max(W - 2.0 * inset, edge * 2.0)
    breps.append(box_brep((0,  W/2.0 - inset, z_frame), inner_L, edge, frame_thk))
    breps.append(box_brep((0, -W/2.0 + inset, z_frame), inner_L, edge, frame_thk))
    breps.append(box_brep(( L/2.0 - inset, 0, z_frame), edge, inner_W, frame_thk))
    breps.append(box_brep((-L/2.0 + inset, 0, z_frame), edge, inner_W, frame_thk))

    # Legs.
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = tapered_leg_brep(sx, sy, L, W, params)
            if leg:
                breps.append(leg)

    return breps


def mesh_from_breps(breps):
    meshes = []
    mp = rg.MeshingParameters.Default
    for b in breps:
        try:
            ms = rg.Mesh.CreateFromBrep(b, mp)
            if ms:
                for m in ms:
                    m.Normals.ComputeNormals()
                    m.Compact()
                    meshes.append(m)
        except Exception:
            pass
    return meshes


def compute_metrics(breps):
    bbox = rg.BoundingBox.Empty
    area_total = 0.0
    vol_total = 0.0

    for b in breps:
        try:
            bb = b.GetBoundingBox(True)
            bbox.Union(bb)
        except Exception:
            pass

        try:
            amp = rg.AreaMassProperties.Compute(b)
            if amp:
                area_total += amp.Area
        except Exception:
            pass

        try:
            vmp = rg.VolumeMassProperties.Compute(b)
            if vmp:
                vol_total += abs(vmp.Volume)
        except Exception:
            pass

    if bbox.IsValid:
        bounding_length = bbox.Max.X - bbox.Min.X
        bounding_width = bbox.Max.Y - bbox.Min.Y
        bounding_height = bbox.Max.Z - bbox.Min.Z
    else:
        bounding_length = bounding_width = bounding_height = 0.0

    return {
        "bounding_length": bounding_length,
        "bounding_width": bounding_width,
        "bounding_height": bounding_height,
        "wood_volume": vol_total,
        "surface_area_total": area_total,
        "part_count": len(breps),
    }


# ----------------------------
# Execute
# ----------------------------
errors = ""
try:
    params = {k: _get(k) for k in DEFAULTS.keys()}
    breps = create_table(params)
    meshes = mesh_from_breps(breps)
    metrics = compute_metrics(breps)

    # GH outputs
    desk = meshes
    bounding_height = metrics["bounding_height"]
    bounding_width = metrics["bounding_width"]
    bounding_length = metrics["bounding_length"]
    wood_volume = metrics["wood_volume"]
    surface_area_total = metrics["surface_area_total"]
    metrics_json = json.dumps(metrics, ensure_ascii=False)

except Exception as e:
    desk = []
    bounding_height = 0
    bounding_width = 0
    bounding_length = 0
    wood_volume = 0
    surface_area_total = 0
    metrics_json = "{}"
    errors = str(e)
