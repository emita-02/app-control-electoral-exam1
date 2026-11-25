import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isApprovedActStatus,
  PENDING_REVIEW_ACT_STATUS,
} from './act-approval.ts';

test('solo el estado aprobada alimenta resultados oficiales', () => {
  assert.equal(isApprovedActStatus('aprobada'), true);
  assert.equal(isApprovedActStatus(' Aprobada '), true);
  assert.equal(isApprovedActStatus(PENDING_REVIEW_ACT_STATUS), false);
  assert.equal(isApprovedActStatus('borrador'), false);
  assert.equal(isApprovedActStatus('pendiente_sincronizacion'), false);
});
