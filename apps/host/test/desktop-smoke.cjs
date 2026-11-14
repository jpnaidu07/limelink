// Run only on a dedicated unlocked test desktop: this starts and stops live capture.
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { setTimeout: delay } = require('node:timers/promises');
require('../src/main.cjs');

async function until(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(120);
  }
  throw new Error(message);
}

async function smoke() {
  await app.whenReady();
  let window;
  await until(() => {
    [window] = BrowserWindow.getAllWindows();
    return window?.webContents.getURL() === 'capture-host://local/index.html';
  }, 'Host window did not load');
  const contents = window.webContents;
  const evaluate = (source, gesture = false) => contents.executeJavaScript(source, gesture);
  window.focus();
  await until(() => evaluate('Boolean(document.querySelector("#start")?.disabled === false)'), 'No available display');
  assert.ok(await evaluate('window.isSecureContext && typeof window.require === "undefined"'));
  if (process.env.CAPTURE_PYTHON) {
    await until(() => evaluate('document.querySelector("#diagnostics")?.textContent.startsWith("Session ")'), 'The configured Python probe did not report its Windows session');
  }
  assert.equal(await evaluate(`(async () => {
    try {
      const unsolicited = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false});
      unsolicited.getTracks().forEach(track => track.stop());
      return 'accepted';
    } catch { return 'denied'; }
  })()`, true), 'denied', 'Capture without explicit start must be denied');
  await evaluate('document.querySelector("#start").click(); true', true);
  try {
    await until(() => evaluate(`document.querySelector('#status').dataset.state === 'live' &&
      document.querySelector('#preview').getVideoPlaybackQuality().totalVideoFrames > 0`), 'Live capture did not present a frame');
  } catch (error) {
    throw new Error(`${error.message}: ${await evaluate('document.querySelector("#message").textContent')}`);
  }
  assert.equal(await evaluate(`(() => {
    const video = document.querySelector('#preview');
    const track = video.srcObject.getVideoTracks()[0];
    if (video.srcObject.getAudioTracks().length > 0) return 'unexpected audio';
    document.querySelector('#stop').click();
    return video.srcObject === null ? track.readyState : 'still attached';
  })()`), 'ended');
  console.log('Electron smoke: display listed, unsolicited capture denied, live frames presented, Stop ended the track.');
}

smoke().then(() => app.exit(0), (error) => { console.error(error); app.exit(1); });
