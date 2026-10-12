import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroQuality } from '../source/js/hero/quality.js';
import { createCharacterAnimator } from '../source/js/hero/character.js';

test('pixel budget and adaptive reductions do not alter viewport framing', () => {
  const desktop = createHeroQuality({ devicePixelRatio: 2 });
  assert.equal(desktop.resize(1280, 800), 1.5);
  const phone = createHeroQuality({ devicePixelRatio: 3, compact: true });
  assert.equal(phone.resize(390, 844), 1.25);
  for (let i = 0; i < 100; i++) assert.equal(desktop.sample(33, false), false);
  assert.equal(desktop.pixelRatio, 1.5, 'idle 30fps must not trigger a quality reduction');
  for (let i = 0; i < 90; i++) desktop.sample(33, true);
  assert.equal(desktop.pixelRatio, 1.275);
  for (let i = 0; i < 180; i++) desktop.sample(33, true);
  assert.equal(desktop.snapshot().reductions, 2, 'adaptation must be bounded');
  const standard = createHeroQuality({ devicePixelRatio: 1 });
  assert.equal(standard.resize(1280, 800), 1, 'standard density screens retain their native resolution');
});

test('static pose is applied once; interpolation and blink still update', () => {
  let writes = 0;
  const bone = { rotation: { set(...v) { this.value = v; writes++; } }, updateMatrix() {}, matrixAutoUpdate: true };
  const values = [0, 0];
  const actor = { boneMap: new Map([['hand', bone]]), restRot: new Map([['hand', { x: .1, y: 0, z: 0 }]]), morphMeshes: [{ morphTargetDictionary: { 'まばたき': 0, smile: 1 }, morphTargetInfluences: values }] };
  const animator = createCharacterAnimator(actor), pose = { hand: [10, 20, 30] };
  animator.pose(pose, pose, 0);
  for (let i = 0; i < 100; i++) animator.pose(pose, pose, i / 100);
  assert.equal(writes, 1);
  const next = { hand: [20, 40, 60] };
  animator.pose(pose, next, .5);
  assert.equal(writes, 2);
  assert.ok(Math.abs(bone.rotation.value[0] - (.1 + 15 * Math.PI / 180)) < 1e-12);
  animator.morph({ smile: .2 }, { smile: .8 }, .5, .7);
  assert.ok(Math.abs(values[1] - .5) < 1e-12);
  assert.equal(values[0], .7);
  animator.morph(undefined, undefined, 0, 0);
  assert.deepEqual(values, [0, 0], 'removed custom morph channels must reset');
  animator.freezeStaticBones([]);
  assert.equal(bone.matrixAutoUpdate, false);
  animator.pose(next, next, 0);
  assert.equal(writes, 3, 'debug pose changes must still work after local matrices are frozen');
});
