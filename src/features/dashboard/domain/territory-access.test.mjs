import assert from 'node:assert/strict';
import test from 'node:test';

import { tableBelongsToProvince } from './territory-access.ts';

const tableInProvince = {
  polling_places: { parishes: { cantons: { province_id: 17 } } },
};

test('una mesa solo es accesible si la provincia coincide', () => {
  assert.equal(tableBelongsToProvince(tableInProvince, 17), true);
  assert.equal(tableBelongsToProvince(tableInProvince, 18), false);
});

test('la falta de relación territorial no abre el acceso a todas las mesas', () => {
  assert.equal(tableBelongsToProvince({}, 17), false);
  assert.equal(
    tableBelongsToProvince({ polling_places: { parishes: null } }, 17),
    false,
  );
  assert.equal(tableBelongsToProvince(tableInProvince, null), false);
});
