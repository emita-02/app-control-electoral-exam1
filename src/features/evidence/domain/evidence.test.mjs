import assert from 'node:assert/strict';
import test from 'node:test';

import { captureBelongsToAct } from './evidence.ts';

test('una captura solo pertenece al acta para la que se tomó', () => {
  const capture = { actId: 7 };

  assert.equal(captureBelongsToAct(capture, 7), true);
  assert.equal(captureBelongsToAct(capture, 8), false);
});
