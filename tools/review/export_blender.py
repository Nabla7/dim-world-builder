"""Export the currently loaded saved .blend, without saving or changing its source.

Run with Blender --background FILE --disable-autoexec --python this.py -- --out DIR.
World-space image mappings are recorded explicitly, rather than lost in glTF.
The preview retains albedo photographs; procedural bump and Cycles lighting remain
in the source and are not claimed to be reproduced by the browser.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument('--out', required=True)
p.add_argument('--revision', default='V11', help='Unique name for a derived scene revision')
p.add_argument('--lighting', type=Path, help='Completed static lighting bake metadata')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
(out / 'textures').mkdir(exist_ok=True)
source = Path(bpy.data.filepath)
start = time.monotonic()
images = {}
warnings = []


def value(s):
    v = s.default_value
    return list(v) if hasattr(v, '__len__') else float(v)


def coordinates(s):
    """An affine 3x4 mapping of project metres, or native authored UVs."""
    if not s.is_linked:
        return {'kind': 'uv'}
    link = s.links[0]
    n = link.from_node
    if n.type == 'NEW_GEOMETRY' and link.from_socket.name == 'Position':
        return {'kind': 'world', 'matrix': np.eye(4)[:3].tolist()}
    if n.type == 'TEX_COORD' and link.from_socket.name == 'UV' or n.type == 'UVMAP':
        return {'kind': 'uv'}
    if n.type == 'VECT_MATH':
        v = coordinates(n.inputs[0])
        if v['kind'] != 'world':
            raise ValueError('non-world vector operation')
        m = np.array(v['matrix'])
        b = np.array(value(n.inputs[1]))
        if n.operation == 'MULTIPLY': m *= b[:, None]
        elif n.operation == 'ADD': m[:, 3] += b
        elif n.operation == 'SUBTRACT': m[:, 3] -= b
        elif n.operation == 'SCALE': m *= float(n.inputs['Scale'].default_value)
        else: raise ValueError(n.operation)
        return {'kind': 'world', 'matrix': m.tolist()}
    if n.type == 'COMBXYZ':
        rows = []
        for s2 in n.inputs:
            if not s2.is_linked:
                rows.append([0, 0, 0, float(s2.default_value)])
            else:
                l2 = s2.links[0]
                if l2.from_node.type != 'SEPXYZ': raise ValueError('unsupported coordinate channel')
                upstream = coordinates(l2.from_node.inputs[0])
                rows.append(upstream['matrix']['XYZ'.index(l2.from_socket.name)])
        return {'kind': 'world', 'matrix': rows}
    raise ValueError(f'unsupported coordinates {n.type}')


def color(s):
    if not s.is_linked:
        return {'kind': 'constant', 'value': value(s)}
    l = s.links[0]
    n = l.from_node
    if n.type == 'TEX_IMAGE' and n.image:
        image = n.image
        key = hashlib.sha256(image.name.encode()).hexdigest()[:16]
        if key not in images:
            path = out / 'textures' / f'{key}.png'
            image.filepath_raw = str(path)
            image.file_format = 'PNG'
            image.save()
            images[key] = {'file': f'textures/{key}.png', 'source': image.name, 'size': list(image.size)}
        return {'kind': 'image', 'image': key, 'alpha': l.from_socket.name == 'Alpha',
                'coordinates': coordinates(n.inputs['Vector']), 'extension': n.extension,
                'projection': n.projection, 'projection_blend': n.projection_blend}
    if n.type == 'MIX_RGB' and n.blend_type == 'MIX':
        return {'kind': 'mix', 'factor': color(n.inputs[0]), 'a': color(n.inputs[1]), 'b': color(n.inputs[2])}
    raise ValueError(f'unsupported color node {n.type}')


materials = {}
for mat in list(bpy.data.materials):
    if not mat.node_tree: continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        warnings.append(f'{mat.name}: non-Principled shader remains approximate')
        continue
    entry = {}
    for channel in ['Base Color', 'Alpha']:
        try: entry[channel] = color(bsdf.inputs[channel])
        except ValueError as e:
            warnings.append(f'{mat.name}/{channel}: {e}')
            entry[channel] = {'kind': 'constant', 'value': value(bsdf.inputs[channel])}
    entry['roughness'] = float(bsdf.inputs['Roughness'].default_value)
    entry['metallic'] = float(bsdf.inputs['Metallic'].default_value)
    entry['transparent'] = bsdf.inputs['Alpha'].is_linked or float(bsdf.inputs['Alpha'].default_value) < .99
    materials[mat.name] = entry
    # The browser reconstructs the recorded albedo graph from this sidecar. Avoid
    # glTF silently misinterpreting unsupported world-coordinate Blender nodes.
    for name in ['Base Color', 'Alpha', 'Normal']:
        for link in list(bsdf.inputs[name].links): mat.node_tree.links.remove(link)
    bsdf.inputs['Alpha'].default_value = 1
    if 'Transmission Weight' in bsdf.inputs:
        # Browser transmission through 12k layered objects is expensive. Keep
        # windows translucent; exact glass remains in the Blender source.
        if bsdf.inputs['Transmission Weight'].default_value > .1:
            entry['glass'] = True
        bsdf.inputs['Transmission Weight'].default_value = 0

scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()
objects = [o for o in scene.objects if o.type in {'MESH', 'CURVE', 'FONT', 'SURFACE'} and not o.hide_render]
records = []
export_scene = bpy.data.scenes.new('Browser export temporary')
for i, obj in enumerate(objects):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    if not mesh or not len(mesh.polygons): continue
    copy = bpy.data.objects.new(f'export_{i}', mesh)
    export_scene.collection.objects.link(copy)
    copy.matrix_world = obj.matrix_world
    copy['review_id'] = obj.get('review_id', obj.name)
    copy['source_collection'] = obj.get('source_collection', obj.users_collection[0].name if obj.users_collection else '')
    bounds = [obj.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
    records.append({'id':copy['review_id'], 'collection':copy['source_collection'],
                    'normal_to_object':[list(row) for row in obj.matrix_world.to_3x3().transposed()],
                    'min':[min(v[j] for v in bounds) for j in range(3)],
                    'max':[max(v[j] for v in bounds) for j in range(3)]})
    if i % 2000 == 0: print('PREPARE', i, len(objects), flush=True)
bpy.context.window.scene = export_scene
bpy.ops.export_scene.gltf(filepath=str(out/'scene.glb'), export_format='GLB', export_yup=True,
    use_active_scene=True,
    export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
    export_apply=False, export_texcoords=True, export_normals=True, export_materials='EXPORT')
manifest = {'format':'scene-review.bundle.v1', 'id':'sf555-v11', 'title':'SF555 / Office', 'revision':a.revision,
    'units':'metres', 'up':'Z', 'source_blend':str(source), 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'geometry':'scene.glb', 'objects':records, 'materials':materials, 'images':images,
    'limitations':['Interactive PBR preview; Cycles illumination and procedural bump are not baked.',
                   'Navigation is a free camera, not a collision or robot traversal test.',
                   'Source observations and inferred geometry retain the baseline reconstruction uncertainty.'],
    'warnings':warnings, 'export_seconds':round(time.monotonic()-start,2)}
if a.lighting:
    manifest['lighting'] = json.loads(a.lighting.read_text())
    manifest['limitations'][0] = 'Static Cycles diffuse lighting; glass and view-dependent reflections remain approximate. Re-bake after scene or lighting changes.'
(out/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('EXPORT_COMPLETE', len(records),len(images),len(warnings),manifest['export_seconds'], flush=True)
