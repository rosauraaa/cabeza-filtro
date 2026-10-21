"""Genera la mascara "Cabeza Cubo" (GLB con shape keys y animaciones) y un render de vista previa.

Uso (desde la raiz del repo):
    blender -b -P blender/build_mask.py

Unidades: 1.0 = ancho de la cara (distancia entre los landmarks 234 y 454 de MediaPipe).
El frente de la mascara mira hacia -Y en Blender (= +Z en glTF / three.js, hacia la camara).

Shape keys (se controlan en vivo con los blendshapes de MediaPipe):
    BlinkL, BlinkR, BrowsUp, MouthOpen
Animaciones (acciones de Blender exportadas al GLB):
    PropellerSpin  - la helice gira en loop
    CapBob         - el gorro rebota suavemente
"""
import math
import os

import bpy
import bmesh

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "models", "mask.glb")
DOCS = os.path.join(ROOT, "docs")

HEAD = dict(w=1.42, d=1.3, h=1.5, cz=0.12, cy=-0.02)   # cubo de la cabeza
FRONT = HEAD["cy"] - HEAD["d"] / 2                      # y del frente (negativo)

_mats = {}


def hexc(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def mat(name, hexcolor, rough=0.5):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*hexc(hexcolor), 1)
    bsdf.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*hexc(hexcolor), 1)
    _mats[name] = m
    return m


def part(size, loc, material, group=None, bevel=0.02, rot=(0, 0, 0)):
    """Caja biselada; si lleva grupo, sus vertices se pueden mover en un shape key."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)  # todo en coords de mundo
    o.data.materials.append(material)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 3
        bpy.ops.object.modifier_apply(modifier=m.name)
    if group:
        vg = o.vertex_groups.new(name=group)
        vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = o.data.name = name
    return o


def shape_key(obj, name, fn):
    """Crea un shape key aplicando fn(group, co) -> co a los vertices de cada grupo."""
    key = obj.shape_key_add(name=name, from_mix=False)
    groups = {g.index: g.name for g in obj.vertex_groups}
    for v in obj.data.vertices:
        for g in v.groups:
            new = fn(groups[g.group], v.co.copy())
            if new is not None:
                key.data[v.index].co = new
                break
    return key


def build_head():
    yellow = mat("cubo_amarillo", "#ffd23f", 0.45)
    ink = mat("tinta", "#1b1b24", 0.3)
    shine = mat("brillo", "#ffffff", 0.2)
    brow = mat("ceja", "#5a3215", 0.6)
    mouth = mat("boca", "#5b1a2a", 0.6)
    tongue = mat("lengua", "#ff6b8b", 0.5)
    teeth = mat("dientes", "#ffffff", 0.3)
    blush = mat("rubor", "#ff8fb1", 0.7)

    f = FRONT - 0.02
    parts = [part((HEAD["w"], HEAD["d"], HEAD["h"]), (0, HEAD["cy"], HEAD["cz"]), yellow, bevel=0.12)]
    for side, g in ((1, "eyeL"), (-1, "eyeR")):   # +X = ojo izquierdo de la persona (derecha de la imagen)
        x = 0.3 * side
        parts.append(part((0.2, 0.06, 0.3), (x, f, 0.2), ink, g, bevel=0.05))
        parts.append(part((0.06, 0.03, 0.08), (x + 0.04, f - 0.03, 0.27), shine, g, bevel=0.015))
        parts.append(part((0.3, 0.06, 0.07), (x, f, 0.47), brow, "brows", bevel=0.025, rot=(0, -0.12 * side, 0)))
        parts.append(part((0.2, 0.04, 0.1), (x * 1.55, f + 0.005, -0.12), blush, None, bevel=0.03))
    parts.append(part((0.5, 0.05, 0.1), (0, f, -0.33), mouth, "mouth", bevel=0.04))
    parts.append(part((0.4, 0.035, 0.04), (0, f - 0.02, -0.3), teeth, "teeth", bevel=0.012))
    parts.append(part((0.26, 0.04, 0.05), (0, f - 0.015, -0.37), tongue, "tongue", bevel=0.02))
    head = join(parts, "Head")

    head.shape_key_add(name="Basis", from_mix=False)
    eye_c = 0.2

    def blink(target):
        def fn(g, co):
            if g != target:
                return None
            co.z = eye_c + (co.z - eye_c) * 0.1
            return co
        return fn

    shape_key(head, "BlinkL", blink("eyeL"))
    shape_key(head, "BlinkR", blink("eyeR"))

    def brows_up(g, co):
        if g != "brows":
            return None
        co.z += 0.14
        return co

    shape_key(head, "BrowsUp", brows_up)

    def mouth_open(g, co):
        if g == "mouth":
            if co.z < -0.33:
                co.z -= 0.26           # la boca se estira hacia abajo
                co.x *= 0.8
            else:
                co.x *= 0.85
            return co
        if g == "tongue":
            co.z -= 0.26
            return co
        if g == "teeth":
            co.x *= 0.85
            return co
        return None

    shape_key(head, "MouthOpen", mouth_open)
    bpy.ops.object.shade_flat()
    return head


def build_cap():
    red = mat("gorro_rojo", "#ff3b3b", 0.45)
    blue = mat("gorro_azul", "#2f80ff", 0.45)
    yellow = mat("gorro_amarillo", "#ffc93c", 0.45)
    green = mat("gorro_verde", "#4cd964", 0.45)
    top = HEAD["cz"] + HEAD["h"] / 2

    # domo de 4 gajos de colores
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.55)
    for v in [v for v in bm.verts if v.co.z < -0.01]:
        bm.verts.remove(v)
    me = bpy.data.meshes.new("Cap")
    bm.to_mesh(me)
    bm.free()
    cap = bpy.data.objects.new("Cap", me)
    bpy.context.collection.objects.link(cap)
    for m in (red, blue, yellow, green):
        me.materials.append(m)
    for p in me.polygons:
        ang = math.atan2(p.center.y, p.center.x) % (2 * math.pi)
        p.material_index = int(ang / (math.pi / 2)) % 4
    cap.scale = (1, 1, 0.62)
    cap.location = (0, HEAD["cy"], top - 0.04)
    bpy.context.view_layer.objects.active = cap
    cap.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()

    # visera y boton (se unen al gorro)
    visor = part((0.62, 0.42, 0.05), (0, HEAD["cy"] - 0.62, top - 0.02), blue, bevel=0.02)
    knob = part((0.1, 0.1, 0.12), (0, HEAD["cy"], top + 0.32), yellow, bevel=0.02)
    cap = join([cap, visor, knob], "Cap")
    # origen en la base del gorro (sirve como pivote del rebote)
    bpy.context.scene.cursor.location = (0, HEAD["cy"], top - 0.04)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

    # helice: hijo del gorro, gira sobre su eje
    blade_a = part((0.7, 0.1, 0.02), (0, 0, 0), green, bevel=0.01, rot=(0.25, 0, 0))
    blade_b = part((0.1, 0.7, 0.02), (0, 0, 0), red, bevel=0.01, rot=(0, 0.25, 0))
    hub = part((0.08, 0.08, 0.08), (0, 0, 0), yellow, bevel=0.02)
    prop = join([blade_a, blade_b, hub], "Propeller")
    prop.location = (0, 0, 0.44)
    prop.parent = cap
    return cap, prop


def animate(cap, prop):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    scene = bpy.context.scene
    scene.render.fps = 24

    # PropellerSpin: una vuelta completa en 12 frames (0.5 s); en three.js se repite en loop
    prop.animation_data_create()
    prop.animation_data.action = bpy.data.actions.new("PropellerSpin")
    for frame, ang in ((1, 0), (13, 2 * math.pi)):
        prop.rotation_euler = (0, 0, ang)
        prop.keyframe_insert("rotation_euler", frame=frame)

    # CapBob: rebote y balanceo suave del gorro (loop de 1 s)
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "BEZIER"
    cap.animation_data_create()
    cap.animation_data.action = bpy.data.actions.new("CapBob")
    base = cap.location.copy()
    for frame, dz, tilt in ((1, 0, 0), (7, 0.045, 0.06), (13, 0, 0), (19, 0.03, -0.06), (25, 0, 0)):
        cap.location = (base.x, base.y, base.z + dz)
        cap.rotation_euler = (0, tilt, 0)
        cap.keyframe_insert("location", frame=frame)
        cap.keyframe_insert("rotation_euler", frame=frame)
    cap.location = base
    cap.rotation_euler = (0, 0, 0)
    scene.frame_set(1)


def export():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format="GLB", use_selection=True,
        export_animations=True, export_morph=True, export_apply=False,
        export_animation_mode="ACTIONS", export_force_sampling=True,
    )
    print("OK", OUT, os.path.getsize(OUT), "bytes")


def render_previews(head):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = False
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    scene.render.film_transparent = True
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (2.1, -4.6, 1.4)
    cam.rotation_euler = (math.radians(80), 0, math.radians(24))
    cam_data.lens = 50
    scene.camera = cam
    keys = head.data.shape_keys.key_blocks
    for name, values in (("normal", {}), ("gestos", {"MouthOpen": 1, "BrowsUp": 1, "BlinkL": 1})):
        for k in keys[1:]:
            k.value = values.get(k.name, 0)
        scene.render.filepath = os.path.join(DOCS, f"preview-{name}.png")
        bpy.ops.render.render(write_still=True)
        print("OK", scene.render.filepath)
    for k in keys[1:]:
        k.value = 0


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    head = build_head()
    cap, prop = build_cap()
    animate(cap, prop)
    export()
    render_previews(head)
