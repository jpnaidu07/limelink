const { app, BrowserWindow, desktopCapturer, ipcMain, powerMonitor, protocol, screen, session } = require('electron');
const { execFile } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { createCaptureGrants } = require('./capture-grants.cjs');

const PAGE = 'capture-host://local/index.html';
const assets = new Map([
  [PAGE, ['index.html', 'text/html; charset=utf-8']],
  ['capture-host://local/renderer.js', ['renderer.js', 'text/javascript; charset=utf-8']],
  ['capture-host://local/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const grants = createCaptureGrants();
const runFile = promisify(execFile);
let hostWindow;
let displayCatalog = new Map();
let catalogRevision = 0;
let suspended = false;
let locked = false;
let diagnosticsInFlight;

protocol.registerSchemesAsPrivileged([{ scheme: 'capture-host', privileges: { standard: true, secure: true } }]);

function trustedFrame(frame) {
  return !!hostWindow && !hostWindow.isDestroyed() && !!frame &&
    frame === hostWindow.webContents.mainFrame && frame.url === PAGE;
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedFrame(event.senderFrame)) throw new Error('Access denied.');
    return handler(event.senderFrame, ...args);
  });
}

function unavailable() {
  return suspended || locked;
}

function invalidateDisplays(reason) {
  grants.revoke();
  catalogRevision += 1;
  displayCatalog.clear();
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send('capture:invalidated', reason);
}

async function listDisplays() {
  if (unavailable()) throw new Error('Unlock the desktop before capturing.');
  const revision = catalogRevision;
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  if (revision !== catalogRevision || unavailable()) throw new Error('Display configuration changed. Refresh the list.');
  const primaryId = screen.getPrimaryDisplay().id;
  const displays = new Map(screen.getAllDisplays().map((display) => [String(display.id), display]));
  const items = sources.flatMap(({ id, display_id: displayId }) => {
    const display = displays.get(displayId);
    if (!display) return [];
    const isPrimary = display.id === primaryId;
    return [{ id, displayId, label: display.label || 'Display', isPrimary, width: display.size.width, height: display.size.height }];
  });
  displayCatalog = new Map(items.map((item) => [item.id, item]));
  return items;
}

async function probeDesktop() {
  if (process.platform !== 'win32') return { status: 'unavailable', message: 'The capture host currently targets Windows.' };
  const configured = process.env.CAPTURE_PYTHON;
  if (configured && !path.isAbsolute(configured)) {
    return { status: 'unavailable', message: 'CAPTURE_PYTHON must be an absolute path to python.exe.' };
  }
  const helper = path.join(__dirname, '..', 'python', 'desktop_probe.py');
  const args = [...(configured ? [] : ['-3']), '-I', helper];
  try {
    const { stdout } = await runFile(configured || 'py.exe', args, {
      timeout: 4000, maxBuffer: 8192, windowsHide: true, shell: false,
    });
    const result = JSON.parse(stdout);
    if (result.status !== 'ok' || !Number.isInteger(result.windowsSessionId) ||
        !['available', 'unavailable', 'unknown'].includes(result.inputDesktop) ||
        typeof result.remoteSession !== 'boolean') throw new Error('Unexpected Python reply');
    return { status: 'ok', windowsSessionId: result.windowsSessionId,
      inputDesktop: result.inputDesktop, remoteSession: result.remoteSession };
  } catch {
    return { status: 'unavailable', message: 'Python desktop probe unavailable. Install Python or set CAPTURE_PYTHON to the interpreter path.' };
  }
}

function initialize() {
  const captureSession = session.fromPartition('capture-host');
  captureSession.protocol.handle('capture-host', async (request) => {
    const asset = assets.get(request.url);
    if (!asset || request.method !== 'GET') return new Response(null, { status: 404 });
    const [file, mime] = asset;
    return new Response(await readFile(path.join(__dirname, 'ui', file)), {
      headers: {
        'Content-Type': mime,
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
  captureSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    return permission === 'display-capture' && details.requestingUrl === PAGE && details.isMainFrame && trustedFrame(contents?.mainFrame);
  });
  captureSession.setPermissionRequestHandler((contents, permission, done, details) => {
    done(permission === 'display-capture' && details.isMainFrame && details.requestingUrl === PAGE && trustedFrame(contents?.mainFrame));
  });
  captureSession.setDisplayMediaRequestHandler(async (request, done) => {
    const { frame } = request;
    if (unavailable() || !trustedFrame(frame) || !hostWindow.isFocused() || !request.userGesture || !request.videoRequested || request.audioRequested) {
      done(null);
      return;
    }
    const grant = grants.consume(frame);
    if (!grant) { done(null); return; }
    let video;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!unavailable() && trustedFrame(frame) && hostWindow.isFocused() && grants.isCurrent(grant)) {
        video = sources.find(({ id, display_id }) => id === grant.sourceId && display_id === grant.displayId);
      }
    } catch {
      // Fail closed if the display disappeared or Windows denied enumeration.
    }
    done(video ? { video } : null);
  }, { useSystemPicker: false });

  handle('capture:list', listDisplays);
  handle('capture:arm', (frame, id) => {
    const chosen = typeof id === 'string' && displayCatalog.get(id);
    if (unavailable() || !chosen || !hostWindow.isFocused()) throw new Error('Select an available display in the active window.');
    grants.revoke();
    grants.arm(frame, chosen.id, chosen.displayId);
  });
  handle('capture:revoke', () => grants.revoke());
  handle('capture:diagnostics', () => {
    diagnosticsInFlight ??= probeDesktop().finally(() => { diagnosticsInFlight = undefined; });
    return diagnosticsInFlight;
  });

  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(event, () => invalidateDisplays('Display configuration changed. Refresh and select a display again.'));
  }
  powerMonitor.on('lock-screen', () => { locked = true; invalidateDisplays('Windows locked. Capture stopped.'); });
  powerMonitor.on('suspend', () => { suspended = true; invalidateDisplays('Windows suspended. Capture stopped.'); });
  powerMonitor.on('resume', () => { suspended = false; invalidateDisplays('Windows resumed. Refresh before starting capture.'); });
  powerMonitor.on('unlock-screen', () => { locked = false; invalidateDisplays('Windows unlocked. Refresh before starting capture.'); });

  hostWindow = new BrowserWindow({
    width: 1180, height: 800, minWidth: 680, minHeight: 530,
    title: 'Desktop Capture Host', backgroundColor: '#101518', autoHideMenuBar: true,
    webPreferences: {
      session: captureSession, preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
    },
  });
  const contents = hostWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-redirect', 'will-attach-webview']) {
    contents.on(event, (navigation) => navigation.preventDefault());
  }
  contents.on('did-start-navigation', () => invalidateDisplays('Host window reloaded.'));
  contents.on('render-process-gone', () => invalidateDisplays('Capture window stopped.'));
  hostWindow.on('closed', () => { grants.revoke(); hostWindow = undefined; });
  return hostWindow.loadURL(PAGE);
}

if (process.platform !== 'win32' || !app.requestSingleInstanceLock()) {
  if (process.platform !== 'win32') console.error('Desktop Capture Host requires Windows.');
  app.quit();
} else {
  app.on('second-instance', () => { if (hostWindow && !hostWindow.isDestroyed()) { hostWindow.show(); hostWindow.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(initialize).catch((error) => { console.error('Could not start capture host:', error.message); app.exit(1); });
}
