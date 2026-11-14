const get = (id) => document.getElementById(id);
const host = window.captureHost;
const display = get('display');
const fps = get('fps');
const preview = get('preview');
const start = get('start');
const stop = get('stop');
const refresh = get('refresh');
const probe = get('probe');
const status = get('status');
const metrics = get('metrics');
let stream;
let state = 'idle';
let refreshInFlight = false;
let generation = 0;
let catalogGeneration = 0;
let previousFrames;

function updateControls() {
  const busy = state !== 'idle';
  display.disabled = busy || refreshInFlight || !display.value;
  fps.disabled = busy;
  start.disabled = busy || refreshInFlight || !display.value;
  stop.disabled = !busy;
  refresh.disabled = busy || refreshInFlight;
  status.dataset.state = state;
  status.textContent = { idle: 'Idle', starting: 'Starting…', live: 'Capturing' }[state];
}

function stopCapture(message = 'Capture stopped.') {
  generation += 1;
  void host.revoke().catch(() => {});
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  preview.pause();
  preview.srcObject = null;
  preview.hidden = true;
  get('empty').hidden = false;
  metrics.textContent = 'No active capture';
  previousFrames = undefined;
  state = 'idle';
  get('message').textContent = message;
  updateControls();
}

async function refreshDisplays() {
  if (refreshInFlight || state !== 'idle') return;
  refreshInFlight = true;
  const generationAtStart = catalogGeneration;
  const selected = display.value;
  updateControls();
  try {
    const items = await host.list();
    if (generationAtStart !== catalogGeneration) return;
    display.replaceChildren(...items.map((item) => {
      const primary = item.isPrimary ? ' (primary)' : '';
      return new Option(`${item.label}${primary} · ${item.width} × ${item.height} logical px`, item.id);
    }));
    if (!items.length) display.add(new Option('No available displays', ''));
    if (items.some((item) => item.id === selected)) display.value = selected;
    else if (items.find((item) => item.isPrimary)) display.value = items.find((item) => item.isPrimary).id;
    get('message').textContent = items.length ? 'Ready. Start capture to preview the selected display.' : 'No capturable displays. Connect a monitor and refresh.';
  } catch {
    if (generationAtStart !== catalogGeneration) return;
    display.replaceChildren(new Option('Display list unavailable', ''));
    get('message').textContent = 'Unable to list displays. Unlock Windows or reconnect the display, then refresh.';
  } finally {
    refreshInFlight = false;
    updateControls();
  }
}

async function startCapture() {
  if (state !== 'idle' || refreshInFlight || !display.value) return;
  const ticket = ++generation;
  state = 'starting';
  updateControls();
  get('message').textContent = 'Opening the selected display…';
  const deadline = setTimeout(() => {
    if (ticket === generation) stopCapture('No preview arrived. Refresh the display list and try again.');
  }, 12000);
  try {
    await host.arm(display.value);
    if (ticket !== generation) return;
    const acquired = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: Number(fps.value), max: Number(fps.value) } }, audio: false,
    });
    if (ticket !== generation) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = acquired;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') throw new Error('No live display track');
    track.addEventListener('ended', () => {
      if (ticket === generation) stopCapture('The display stream ended. Refresh before starting again.');
    }, { once: true });
    track.addEventListener('mute', () => {
      if (ticket === generation) stopCapture('Windows paused the display feed. Start again when the desktop is available.');
    }, { once: true });
    preview.srcObject = stream;
    await preview.play();
    if (ticket !== generation) return;
    preview.hidden = false;
    get('empty').hidden = true;
    state = 'live';
    get('message').textContent = 'Capturing the selected display. Video stays in this window.';
    updateControls();
  } catch (error) {
    if (ticket !== generation) return;
    const message = error.name === 'NotAllowedError'
      ? 'Capture was denied or the display changed. Refresh the list, then try again.'
      : 'Unable to open the display. Refresh and retry from an unlocked Windows desktop.';
    stopCapture(message);
  } finally {
    clearTimeout(deadline);
  }
}

async function checkDesktop() {
  probe.disabled = true;
  const text = get('diagnostics');
  text.textContent = 'Checking…';
  try {
    const result = await host.diagnostics();
    text.textContent = result.status === 'ok'
      ? `Session ${result.windowsSessionId} · ${result.remoteSession ? 'Remote' : 'Local'} · Input desktop ${result.inputDesktop}`
      : result.message;
  } catch {
    text.textContent = 'Unable to check this Windows session.';
  } finally {
    probe.disabled = false;
  }
}

const statsTimer = setInterval(() => {
  if (state !== 'live' || !stream) return;
  const settings = stream.getVideoTracks()[0].getSettings();
  const now = performance.now();
  const quality = preview.getVideoPlaybackQuality();
  const frames = quality.totalVideoFrames - quality.droppedVideoFrames;
  const shownFps = previousFrames && frames >= previousFrames.frames
    ? ` · ${Math.round((frames - previousFrames.frames) * 1000 / (now - previousFrames.now))} preview FPS`
    : '';
  previousFrames = { now, frames };
  metrics.textContent = `${preview.videoWidth} × ${preview.videoHeight}${settings.frameRate ? ` · ${Math.round(settings.frameRate)} FPS track` : ''}${shownFps}`;
}, 1000);

refresh.addEventListener('click', refreshDisplays);
start.addEventListener('click', startCapture);
stop.addEventListener('click', () => stopCapture());
probe.addEventListener('click', checkDesktop);
const unsubscribe = host.onInvalidated((message) => {
  catalogGeneration += 1;
  display.replaceChildren(new Option('Refresh to list displays', ''));
  stopCapture(message);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state !== 'idle') stopCapture(); });
window.addEventListener('pagehide', () => { clearInterval(statsTimer); unsubscribe(); stopCapture(); }, { once: true });
void refreshDisplays();
void checkDesktop();
