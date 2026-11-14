const { performance } = require('node:perf_hooks');

function createCaptureGrants(now = () => performance.now()) {
  let pending;
  let generation = 0;

  return {
    arm(frame, sourceId, displayId) {
      pending = { frame, sourceId, displayId, generation, expiresAt: now() + 5000 };
    },
    consume(frame) {
      if (pending?.frame !== frame) return undefined;
      const grant = pending;
      pending = undefined;
      return this.isCurrent(grant) ? grant : undefined;
    },
    isCurrent(grant) {
      return grant.generation === generation && now() < grant.expiresAt;
    },
    revoke() {
      pending = undefined;
      generation += 1;
    },
  };
}

module.exports = { createCaptureGrants };
