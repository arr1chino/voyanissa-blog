// Cache animation bindings once; the standing pose normally never changes.
const EMPTY = Object.freeze({});
const RAD = Math.PI / 180;

export function createCharacterAnimator(actor) {
  let poseA, poseB, poseBindings = [], lastPoseT;
  let morphA, morphB, morphBindings = [];
  const channels = [];
  for (const mesh of actor.morphMeshes) {
    for (const name of Object.keys(mesh.morphTargetDictionary)) {
      channels.push({ name, values: mesh.morphTargetInfluences, index: mesh.morphTargetDictionary[name] });
    }
  }

  function pose(a = EMPTY, b = EMPTY, t = 0) {
    const changed = a !== poseA || b !== poseB;
    if (changed) {
      poseA = a; poseB = b; lastPoseT = undefined;
      poseBindings = [];
      for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const bone = actor.boneMap.get(name);
        if (!bone) continue;
        const rest = actor.restRot.get(name) || EMPTY;
        poseBindings.push({ bone, rest, a: a[name] || [0, 0, 0], b: b[name] || [0, 0, 0] });
      }
    }
    // Identical endpoints describe a static pose, regardless of camera progress.
    if (!changed && (a === b || t === lastPoseT)) return;
    for (const binding of poseBindings) {
      const { bone, rest, a: from, b: to } = binding;
      bone.rotation.set(
        (rest.x || 0) + (from[0] + (to[0] - from[0]) * t) * RAD,
        (rest.y || 0) + (from[1] + (to[1] - from[1]) * t) * RAD,
        (rest.z || 0) + (from[2] + (to[2] - from[2]) * t) * RAD
      );
      bone.updateMatrix();
    }
    lastPoseT = t;
  }

  function morph(a = EMPTY, b = EMPTY, t = 0, blink = 0) {
    if (a !== morphA || b !== morphB) {
      morphA = a; morphB = b;
      morphBindings = [];
      for (const channel of channels) {
        channel.values[channel.index] = 0;
        if (channel.name === 'まばたき' || channel.name in a || channel.name in b) {
          morphBindings.push({ ...channel, a: a[channel.name] || 0, b: b[channel.name] || 0 });
        }
      }
    }
    for (const channel of morphBindings) {
      let value = channel.a + (channel.b - channel.a) * t;
      if (channel.name === 'まばたき') value = Math.max(value, blink);
      if (channel.values[channel.index] !== value) channel.values[channel.index] = value;
    }
  }

  function freezeStaticBones(eyeNames) {
    for (const [name, bone] of actor.boneMap) {
      if (eyeNames.includes(name)) continue;
      bone.updateMatrix();
      // World matrices still follow the rotating model; only local transforms are fixed.
      bone.matrixAutoUpdate = false;
    }
  }

  return { pose, morph, freezeStaticBones };
}
