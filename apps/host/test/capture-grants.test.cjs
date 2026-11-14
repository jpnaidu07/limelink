const assert = require('node:assert/strict');
const test = require('node:test');
const { createCaptureGrants } = require('../src/capture-grants.cjs');

test('capture grants are single-use and bound to the selected frame and display', () => {
  const grants = createCaptureGrants(() => 100);
  const frame = {};
  grants.arm(frame, 'source', 'display');
  assert.equal(grants.consume({}), undefined);
  const grant = grants.consume(frame);
  assert.equal(grant.sourceId, 'source');
  assert.equal(grant.displayId, 'display');
  assert.equal(grants.consume(frame), undefined);
});

test('expiry and revocation reject late captures, including a grant already being resolved', () => {
  let now = 0;
  const grants = createCaptureGrants(() => now);
  const frame = {};
  grants.arm(frame, 'source', 'display');
  now = 5000;
  assert.equal(grants.consume(frame), undefined);
  grants.arm(frame, 'source', 'display');
  const inFlight = grants.consume(frame);
  assert.equal(grants.isCurrent(inFlight), true);
  grants.revoke();
  assert.equal(grants.isCurrent(inFlight), false);
});
