"""Convert a Microsoft Rocketbox avatar (MIT) to a web-ready GLB for doctor.ai.

    blender -b -P scripts/avatar/convert_rocketbox.py -- <avatar_dir> <name> <out.glb>

Relinks the TGA textures, keeps only the blendshapes the site drives (visemes, blinks, smile,
brows, eye looks, jaw), drops the bind-pose take, and exports a GLB with JPEG textures.
"""

import os
import re
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC_DIR, NAME, OUT = argv
KEEP = re.compile(
    r"^(Basis|AA_VI_|AK_(09|10)_EyeBlink|AK_25_JawOpen|AK_4[45]_MouthSmile|AK_0[1-5]_Brow|"
    r"AK_(1[1-8])_EyeLook|AK_(19|20)_EyeSquint|AK_(21|22)_EyeWide|AK_28|AK_29)"
)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC_DIR, "Export", f"{NAME}_facial.fbx"))

tex_dir = os.path.join(SRC_DIR, "Textures")
for img in bpy.data.images:
    base = os.path.basename(img.filepath.replace("\\", "/"))
    local = os.path.join(tex_dir, base)
    if os.path.exists(local):
        img.filepath = local
        img.reload()

# Principled setup: colour + normal; specular maps aren't glTF-native, so use a fixed roughness.
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    bsdf.inputs["Roughness"].default_value = 0.55 if "head" in mat.name else 0.7
    for link in list(nt.links):
        if link.to_node == bsdf and link.to_socket.name in ("Specular IOR Level", "Specular", "Roughness", "Metallic"):
            nt.links.remove(link)
    for n in nt.nodes:
        if n.type == "TEX_IMAGE" and n.image and n.image.name.endswith("_specular.tga"):
            nt.nodes.remove(n)

for o in bpy.context.scene.objects:
    if o.type == "MESH" and o.data.shape_keys:
        bpy.context.view_layer.objects.active = o
        keys = o.data.shape_keys.key_blocks
        for i in reversed(range(len(keys))):
            if not KEEP.match(keys[i].name):
                o.active_shape_key_index = i
                bpy.ops.object.shape_key_remove()
        print("kept shape keys", len(o.data.shape_keys.key_blocks))

for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
for o in bpy.context.scene.objects:
    if o.animation_data:
        o.animation_data_clear()

# Downsize textures to 2048 max (they are 2048 TGAs; JPEG export keeps them light).
for img in bpy.data.images:
    if img.size[0] > 2048:
        img.scale(2048, 2048)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_skins=True,
    export_morph=True,
    export_morph_normal=False,
    export_animations=False,
    export_image_format="JPEG",
    export_jpeg_quality=86,
    export_yup=True,
)
print("exported", OUT, os.path.getsize(OUT) // 1024, "KB")
