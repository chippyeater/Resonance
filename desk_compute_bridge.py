import json
import math
import os
import sys
from typing import Dict, Iterable, List, Tuple

import compute_rhino3d.AreaMassProperties as compute_area
import compute_rhino3d.Brep as compute_brep
import compute_rhino3d.Mesh as compute_mesh
import compute_rhino3d.Util
import compute_rhino3d.VolumeMassProperties as compute_volume
import rhino3dm


DEFAULTS = {
    "length": 1400.0,
    "width": 650.0,
    "round": 10.0,
    "leg_width": 40.0,
    "frame_edge_thickness": 19.549,
    "leg_height": 730.0,
    "leg_open": 0.0,
    "leg_tiptoe_degree": 0.0,
    "frame_thickness": 40.0,
    "lower_leg_depth": 0.362,
    "upper_leg_depth": 76.161,
    "leg_belly_depth": 0.0,
    "frame_inset": 12.262,
}

LIMITS = {
    "length": (600.0, 2200.0),
    "width": (600.0, 1400.0),
    "round": (1.0, 500.0),
    "leg_width": (10.0, 200.0),
    "frame_edge_thickness": (2.0, 25.0),
    "leg_height": (500.0, 750.0),
    "leg_open": (0.0, 220.0),
    "leg_tiptoe_degree": (0.0, 1.0),
    "frame_thickness": (10.0, 100.0),
    "lower_leg_depth": (0.0, 1.0),
    "upper_leg_depth": (4.0, 200.0),
    "leg_belly_depth": (0.0, 190.0),
    "frame_inset": (0.0, 200.0),
}

TOLERANCE = 0.01


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def set_compute_url() -> None:
    url = os.environ.get("RHINO_COMPUTE_URL", "http://localhost:5000/grasshopper").strip()
    if url.endswith("/grasshopper"):
        url = url[: -len("/grasshopper")]
    if not url.endswith("/"):
        url = url + "/"
    compute_rhino3d.Util.url = url


def decode_gh_value_payload(payload: Dict[str, object]) -> Dict[str, float]:
    values = payload.get("values")
    if not isinstance(values, list):
        return {}

    decoded: Dict[str, float] = {}
    for item in values:
        if not isinstance(item, dict):
            continue
        param_name = item.get("ParamName")
        if not isinstance(param_name, str):
            continue
        key = param_name.split("RH_IN:", 1)[1] if param_name.startswith("RH_IN:") else param_name
        tree = item.get("InnerTree")
        if not isinstance(tree, dict):
            continue
        for branch_items in tree.values():
            if not isinstance(branch_items, list):
                continue
            for branch_item in branch_items:
                if not isinstance(branch_item, dict):
                    continue
                data = branch_item.get("data")
                try:
                    decoded[key] = float(data)
                    break
                except (TypeError, ValueError):
                    continue
            if key in decoded:
                break
    return decoded


def read_input() -> Tuple[Dict[str, float], List[str]]:
    raw = sys.stdin.read().strip()
    payload = {}
    if raw:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Input payload must be a JSON object.")

    gh_values = decode_gh_value_payload(payload)
    warnings: List[str] = []
    params: Dict[str, float] = {}

    for key, default in DEFAULTS.items():
        raw_value = gh_values.get(key, payload.get(key, default))
        try:
            numeric = float(raw_value)
        except (TypeError, ValueError):
            numeric = default
            warnings.append(f"{key} is invalid and was reset to default {default}.")

        minimum, maximum = LIMITS[key]
        clamped = clamp(numeric, minimum, maximum)
        if clamped != numeric:
            warnings.append(f"{key} was clamped to {clamped}.")
        params[key] = clamped

    return params, warnings


def rounded_rectangle_points(length: float, width: float, radius: float, segments: int = 10) -> List[rhino3dm.Point3d]:
    half_length = length / 2.0
    half_width = width / 2.0
    radius = clamp(radius, 0.0, min(length, width) * 0.49)

    if radius <= 0.001:
        return [
            rhino3dm.Point3d(-half_length, -half_width, 0.0),
            rhino3dm.Point3d(half_length, -half_width, 0.0),
            rhino3dm.Point3d(half_length, half_width, 0.0),
            rhino3dm.Point3d(-half_length, half_width, 0.0),
            rhino3dm.Point3d(-half_length, -half_width, 0.0),
        ]

    points: List[rhino3dm.Point3d] = []
    corner_centers = [
        (half_length - radius, -half_width + radius, -math.pi / 2.0, 0.0),
        (half_length - radius, half_width - radius, 0.0, math.pi / 2.0),
        (-half_length + radius, half_width - radius, math.pi / 2.0, math.pi),
        (-half_length + radius, -half_width + radius, math.pi, math.pi * 1.5),
    ]

    for cx, cy, start_angle, end_angle in corner_centers:
        for index in range(segments + 1):
            if points and index == 0:
                continue
            angle = start_angle + (end_angle - start_angle) * (index / segments)
            x = cx + radius * math.cos(angle)
            y = cy + radius * math.sin(angle)
            points.append(rhino3dm.Point3d(x, y, 0.0))

    points.append(points[0])
    return points


def make_polyline_curve(points: Iterable[rhino3dm.Point3d]) -> rhino3dm.PolylineCurve:
    polyline = rhino3dm.Polyline(list(points))
    return rhino3dm.PolylineCurve(polyline)


def move_brep(brep: rhino3dm.Brep, x: float, y: float, z: float) -> rhino3dm.Brep:
    translated = brep.Duplicate()
    translated.Translate(rhino3dm.Vector3d(x, y, z))
    return translated


def create_box_brep(center: Tuple[float, float, float], sx: float, sy: float, sz: float) -> rhino3dm.Brep:
    cx, cy, cz = center
    bounding_box = rhino3dm.BoundingBox(
        rhino3dm.Point3d(cx - sx / 2.0, cy - sy / 2.0, cz - sz / 2.0),
        rhino3dm.Point3d(cx + sx / 2.0, cy + sy / 2.0, cz + sz / 2.0),
    )
    return rhino3dm.Brep.CreateFromBox(rhino3dm.Box(bounding_box))


def create_quad_face(a: rhino3dm.Point3d, b: rhino3dm.Point3d, c: rhino3dm.Point3d, d: rhino3dm.Point3d) -> rhino3dm.Brep:
    face = compute_brep.CreateFromCornerPoints1(a, b, c, d, TOLERANCE)
    if face is None:
        raise RuntimeError("compute-rhino3d failed to create a quad face.")
    return face


def insert_items(items, insertions):
    """
    Grasshopper Insert Items 的简化等价：
    insertions: [(index, value), ...]
    """
    result = list(items)
    for index, value in sorted(insertions, key=lambda x: x[0]):
        index = max(0, min(index, len(result)))
        result.insert(index, value)
    return result


def explode_tree(tree):
    """
    Grasshopper Explode Tree 的简化等价。
    Python 里 tree 可以直接用 list[list[...]] 表示。
    """
    return list(tree)


def make_closed_polyline(points):
    pts = list(points)
    if pts[0].DistanceTo(pts[-1]) > TOLERANCE:
        pts.append(pts[0])
    return make_polyline_curve(pts)


def loft_curves(curves):
    """
    Grasshopper Loft 的等价。
    具体函数名在 compute_rhino3d 版本中可能是 CreateFromLoft / CreateFromLoft1 / CreateFromLoft2。
    如果你的版本报函数名错误，就 print(dir(compute_brep)) 查一下。
    """
    lofts = compute_brep.CreateFromLoft(
        curves,
        rhino3dm.Point3d.Unset,
        rhino3dm.Point3d.Unset,
        0,      # LoftType.Normal
        False   # closed
    )
    if not lofts:
        raise RuntimeError("compute-rhino3d failed to loft curves.")
    return lofts[0]


def ruled_surface(curve_a, curve_b):
    """
    Grasshopper Ruled Surface 的等价。
    本质上是两条曲线之间 loft，且只有两条 profile。
    """
    return loft_curves([curve_a, curve_b])


def join_breps(breps: List[rhino3dm.Brep]) -> rhino3dm.Brep:
    joined = compute_brep.JoinBreps(breps, TOLERANCE)
    if not joined:
        raise RuntimeError("compute-rhino3d failed to join breps.")
    return joined[0]


def create_leg_section_curve(
    cx: float,
    cy: float,
    z: float,
    rw: float,
    rd: float,
) -> rhino3dm.PolylineCurve:
    points = [
        rhino3dm.Point3d(cx - rw / 2.0, cy - rd / 2.0, z),
        rhino3dm.Point3d(cx + rw / 2.0, cy - rd / 2.0, z),
        rhino3dm.Point3d(cx + rw / 2.0, cy + rd / 2.0, z),
        rhino3dm.Point3d(cx - rw / 2.0, cy + rd / 2.0, z),
    ]
    return make_closed_polyline(points)


def create_tapered_leg_brep(sx: float, sy: float, params: Dict[str, float]) -> rhino3dm.Brep:
    length = params["length"]
    width = params["width"]

    frame_inset = params["frame_inset"]
    leg_width = params["leg_width"]
    leg_height = params["leg_height"]
    leg_open = params["leg_open"]

    upper_depth = max(params["upper_leg_depth"], leg_width)
    lower_ratio = clamp(params["lower_leg_depth"], 0.0, 1.0)
    belly_depth = params["leg_belly_depth"]
    tiptoe = clamp(params["leg_tiptoe_degree"], 0.0, 1.0)

    # GHX 里有“腿脚最小宽度”这一类逻辑，Python 这里固定成 4
    foot_min_width = 4.0

    # frame_inset 作为外边界 inset，而不是中心线 inset
    top_cx = sx * (length / 2.0 - frame_inset - leg_width / 2.0)
    top_cy = sy * (width / 2.0 - frame_inset - upper_depth / 2.0)

    # 底部根据 leg_open 向外张开
    bottom_cx = top_cx + sx * leg_open
    bottom_cy = top_cy + sy * leg_open

    # 脚尖宽度
    bottom_width = foot_min_width + (leg_width - foot_min_width) * tiptoe
    bottom_depth = max(upper_depth * lower_ratio, foot_min_width)

    # 中间腿肚子，不是简单线性 taper
    belly_width = max(leg_width * 0.75, bottom_width)
    belly_real_depth = max(upper_depth - belly_depth, bottom_depth)

    z0 = 0.0
    z1 = leg_height * 0.35
    z2 = leg_height * 0.72
    z3 = leg_height

    # 中间截面中心位置沿着底部到顶部插值
    def lerp(a, b, t):
        return a + (b - a) * t

    c0x, c0y = bottom_cx, bottom_cy
    c1x, c1y = lerp(bottom_cx, top_cx, 0.35), lerp(bottom_cy, top_cy, 0.35)
    c2x, c2y = lerp(bottom_cx, top_cx, 0.72), lerp(bottom_cy, top_cy, 0.72)
    c3x, c3y = top_cx, top_cy

    sections = [
        create_leg_section_curve(c0x, c0y, z0, bottom_width, bottom_depth),
        create_leg_section_curve(c1x, c1y, z1, belly_width, belly_real_depth),
        create_leg_section_curve(c2x, c2y, z2, leg_width, upper_depth),
        create_leg_section_curve(c3x, c3y, z3, leg_width, upper_depth),
    ]

    leg = loft_curves(sections)

    # 补上下盖面，不然 volume / mesh 可能不稳定
    bottom_cap = create_quad_face(
        rhino3dm.Point3d(c0x - bottom_width / 2.0, c0y - bottom_depth / 2.0, z0),
        rhino3dm.Point3d(c0x + bottom_width / 2.0, c0y - bottom_depth / 2.0, z0),
        rhino3dm.Point3d(c0x + bottom_width / 2.0, c0y + bottom_depth / 2.0, z0),
        rhino3dm.Point3d(c0x - bottom_width / 2.0, c0y + bottom_depth / 2.0, z0),
    )

    top_cap = create_quad_face(
        rhino3dm.Point3d(c3x - leg_width / 2.0, c3y - upper_depth / 2.0, z3),
        rhino3dm.Point3d(c3x + leg_width / 2.0, c3y - upper_depth / 2.0, z3),
        rhino3dm.Point3d(c3x + leg_width / 2.0, c3y + upper_depth / 2.0, z3),
        rhino3dm.Point3d(c3x - leg_width / 2.0, c3y + upper_depth / 2.0, z3),
    )

    return join_breps([leg, bottom_cap, top_cap])


def create_frame_rail_brep(
    center_x: float,
    center_y: float,
    sx: float,
    sy: float,
    sz: float,
    z: float,
) -> rhino3dm.Brep:
    """
    用上下两条矩形截面曲线 loft 出一条 rail。
    比 create_box_brep 更接近 GHX 的曲线/面生成逻辑。
    """
    bottom = make_closed_polyline([
        rhino3dm.Point3d(center_x - sx / 2.0, center_y - sy / 2.0, z - sz / 2.0),
        rhino3dm.Point3d(center_x + sx / 2.0, center_y - sy / 2.0, z - sz / 2.0),
        rhino3dm.Point3d(center_x + sx / 2.0, center_y + sy / 2.0, z - sz / 2.0),
        rhino3dm.Point3d(center_x - sx / 2.0, center_y + sy / 2.0, z - sz / 2.0),
    ])

    top = make_closed_polyline([
        rhino3dm.Point3d(center_x - sx / 2.0, center_y - sy / 2.0, z + sz / 2.0),
        rhino3dm.Point3d(center_x + sx / 2.0, center_y - sy / 2.0, z + sz / 2.0),
        rhino3dm.Point3d(center_x + sx / 2.0, center_y + sy / 2.0, z + sz / 2.0),
        rhino3dm.Point3d(center_x - sx / 2.0, center_y + sy / 2.0, z + sz / 2.0),
    ])

    rail = loft_curves([bottom, top])

    # 补盖面
    bottom_pts = list(bottom.ToPolyline())
    top_pts = list(top.ToPolyline())

    bottom_cap = create_quad_face(bottom_pts[0], bottom_pts[1], bottom_pts[2], bottom_pts[3])
    top_cap = create_quad_face(top_pts[3], top_pts[2], top_pts[1], top_pts[0])

    return join_breps([rail, bottom_cap, top_cap])


def create_table_breps(params: Dict[str, float]) -> List[rhino3dm.Brep]:
    length = params["length"]
    width = params["width"]
    leg_height = params["leg_height"]
    top_thickness = max(params["frame_edge_thickness"], 10.0)
    frame_thickness = max(params["frame_thickness"], 10.0)
    inset = clamp(params["frame_inset"], 0.0, min(length, width) * 0.45)
    edge = max(params["frame_edge_thickness"], 5.0)

    profile_points = rounded_rectangle_points(length, width, params["round"])
    profile_curve = make_polyline_curve(profile_points)
    tabletop_extrusion = rhino3dm.Extrusion.Create(profile_curve, top_thickness, True)
    if tabletop_extrusion is None:
        raise RuntimeError("Failed to create tabletop extrusion.")
    tabletop = move_brep(tabletop_extrusion.ToBrep(True), 0.0, 0.0, leg_height)

    z_frame = leg_height - frame_thickness / 2.0

    # frame_inset 表示 frame 外边缘距离桌面外边缘的距离
    # 所以 frame 的中心点需要再往里缩 edge / 2
    frame_center_inset = inset + edge / 2.0

    inner_length = max(length - 2.0 * frame_center_inset, edge * 2.0)
    inner_width = max(width - 2.0 * frame_center_inset, edge * 2.0)

    breps = [
        tabletop,

        create_frame_rail_brep(
            0.0,
            width / 2.0 - frame_center_inset,
            inner_length,
            edge,
            frame_thickness,
            z_frame,
        ),
        create_frame_rail_brep(
            0.0,
            -width / 2.0 + frame_center_inset,
            inner_length,
            edge,
            frame_thickness,
            z_frame,
        ),
        create_frame_rail_brep(
            length / 2.0 - frame_center_inset,
            0.0,
            edge,
            inner_width,
            frame_thickness,
            z_frame,
        ),
        create_frame_rail_brep(
            -length / 2.0 + frame_center_inset,
            0.0,
            edge,
            inner_width,
            frame_thickness,
            z_frame,
        ),
    ]

    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            breps.append(create_tapered_leg_brep(sx, sy, params))

    return breps


def mesh_brep(brep: rhino3dm.Brep) -> List[rhino3dm.Mesh]:
    # Do not pass rhino3dm.MeshingParameters here.
    # Some Rhino.Compute / rhino3dm version combinations fail while
    # deserializing MeshingParameters with errors such as:
    # "Member 'DoublePrecision' was not found."
    # The no-parameter overload lets Rhino.Compute use its default meshing
    # settings and avoids that serialization path.
    meshes = compute_mesh.CreateFromBrep(brep)
    if meshes is None:
        raise RuntimeError("compute-rhino3d failed to mesh brep.")
    return list(meshes)


def mesh_to_json(mesh: rhino3dm.Mesh) -> Dict[str, List[float]]:
    vertices: List[float] = []
    faces: List[int] = []

    for index in range(len(mesh.Vertices)):
        vertex = mesh.Vertices[index]
        vertices.extend([
            round(vertex.X, 6),
            round(vertex.Y, 6),
            round(vertex.Z, 6),
        ])

    for index in range(mesh.Faces.Count):
        face = mesh.Faces[index]

        # rhino3dm Python 里 face 通常是 tuple/list-like，不一定有 A/B/C/D 属性
        ids = [int(i) for i in face]

        # 常见情况：
        # 三角面: [a, b, c]
        # 四边面: [a, b, c, d]
        # 有些三角面可能表现为 [a, b, c, c]
        if len(ids) < 3:
            continue

        a, b, c = ids[0], ids[1], ids[2]
        faces.extend([a, b, c])

        if len(ids) >= 4:
            d = ids[3]
            if d != c:
                faces.extend([a, c, d])

    return {
        "vertices": vertices,
        "faces": faces,
    }


def get_mass_property_value(props, key: str):
    if props is None:
        return None

    if isinstance(props, dict):
        value = props.get(key)
        if value is None:
            value = props.get(key.lower())
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    value = getattr(props, key, None)
    if value is None:
        value = getattr(props, key.lower(), None)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compute_metrics(breps: List[rhino3dm.Brep]) -> Dict[str, float]:
    bbox = None
    area_total = 0.0
    volume_total = 0.0

    for brep in breps:
        brep_box = brep.GetBoundingBox()

        if bbox is None:
            bbox = brep_box
        else:
            minimum = rhino3dm.Point3d(
                min(bbox.Min.X, brep_box.Min.X),
                min(bbox.Min.Y, brep_box.Min.Y),
                min(bbox.Min.Z, brep_box.Min.Z),
            )
            maximum = rhino3dm.Point3d(
                max(bbox.Max.X, brep_box.Max.X),
                max(bbox.Max.Y, brep_box.Max.Y),
                max(bbox.Max.Z, brep_box.Max.Z),
            )
            bbox = rhino3dm.BoundingBox(minimum, maximum)

        area_props = compute_area.Compute5(brep)
        area_value = get_mass_property_value(area_props, "Area")
        if area_value is not None:
            area_total += area_value

        volume_props = compute_volume.Compute2(brep)
        volume_value = get_mass_property_value(volume_props, "Volume")
        if volume_value is not None:
            volume_total += abs(volume_value)

    if bbox is not None and bbox.IsValid:
        bounding_length = bbox.Max.X - bbox.Min.X
        bounding_width = bbox.Max.Y - bbox.Min.Y
        bounding_height = bbox.Max.Z - bbox.Min.Z
    else:
        bounding_length = 0.0
        bounding_width = 0.0
        bounding_height = 0.0

    return {
        "bounding_length": round(bounding_length, 6),
        "bounding_width": round(bounding_width, 6),
        "bounding_height": round(bounding_height, 6),
        "wood_volume": round(volume_total, 6),
        "surface_area_total": round(area_total, 6),
    }


def branch_value(param_name: str, data, value_type: str) -> Dict[str, object]:
    return {
        "ParamName": param_name,
        "InnerTree": {
            "0": [
                {
                    "type": value_type,
                    "data": data,
                }
            ]
        },
    }


def build_response(params: Dict[str, float], warnings: List[str]) -> Dict[str, object]:
    set_compute_url()

    breps = create_table_breps(params)
    mesh_branches = {}
    mesh_count = 0
    for brep_index, brep in enumerate(breps):
        brep_meshes = mesh_brep(brep)
        for mesh in brep_meshes:
            mesh_branches[str(mesh_count)] = [
                {
                    "type": "mesh_data",
                    "data": mesh_to_json(mesh),
                }
            ]
            mesh_count += 1

    metrics = compute_metrics(breps)
    values = [
        {
            "ParamName": "RH_OUT:desk",
            "InnerTree": mesh_branches,
        },
        branch_value("RH_OUT:bounding_height", metrics["bounding_height"], "System.Double"),
        branch_value("RH_OUT:bounding_width", metrics["bounding_width"], "System.Double"),
        branch_value("RH_OUT:bounding_length", metrics["bounding_length"], "System.Double"),
        branch_value("RH_OUT:wood_volume", metrics["wood_volume"], "System.Double"),
        branch_value("RH_OUT:surface_area_total", metrics["surface_area_total"], "System.Double"),
        branch_value("RH_OUT:errors", "", "System.String"),
    ]

    return {
        "success": True,
        "modelunits": "Millimeters",
        "warnings": warnings,
        "values": values,
        "metadata": {
            "engine": "rhino3dm+compute-rhino3d",
            "computeUrl": compute_rhino3d.Util.url,
            "part_count": len(breps),
            "mesh_count": mesh_count,
            "input_names": [f"RH_IN:{key}" for key in DEFAULTS.keys()],
        },
    }


def main() -> None:
    try:
        params, warnings = read_input()
        response = build_response(params, warnings)
    except Exception as error:
        response = {
            "success": False,
            "error": str(error),
            "warnings": [],
            "modelunits": "Millimeters",
            "values": [],
        }

    sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
