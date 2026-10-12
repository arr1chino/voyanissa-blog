// Reuse sampling objects; camera framing is independent of render resolution.
export function createCameraTrack({ THREE, box, size, center }) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const frame = {};
  const shot = { pos: new THREE.Vector3(), base: new THREE.Vector3(), look: new THREE.Vector3() };

  function interpolate(a, b, t) {
    for (const field of ['fit', 'focus', 'side', 'fov', 'yaw', 'elev', 'lookX', 'lookZ']) {
      const from = a[field] || 0, to = b[field] || 0;
      frame[field] = from + (to - from) * t;
    }
    const from = a.fitN == null ? a.fit : a.fitN;
    const to = b.fitN == null ? b.fit : b.fitN;
    frame.fitN = from + (to - from) * t;
    return frame;
  }

  function sample(cam, pointer, aspect) {
    // Blend existing portrait and landscape framing through tablet widths.
    const portrait = clamp((1.25 - aspect) / (1.25 - .95), 0, 1);
    const fit = cam.fit + ((cam.fitN == null ? cam.fit : cam.fitN) - cam.fit) * portrait;
    const height = fit * size.y * 1.12;
    const distance = (height * .5) / Math.tan(THREE.MathUtils.degToRad(cam.fov) * .5);
    const focusY = box.min.y + size.y * cam.focus;
    const lateral = size.y * cam.side * .5 + pointer.x * height * aspect * .05;
    const up = pointer.y * height * .025;
    const yaw = cam.yaw || 0, elevation = (cam.elev || 0) * size.y;
    const look = shot.look.set(center.x + (cam.lookX || 0) * size.y, focusY, center.z + (cam.lookZ || 0) * size.y);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const x = look.x + sin * distance + lateral * cos;
    const z = look.z + cos * distance - lateral * sin;
    const y = look.y + elevation;
    shot.pos.set(x, y + up, z);
    shot.base.set(x, y, z);
    shot.fov = cam.fov;
    return shot;
  }

  return { interpolate, sample };
}
