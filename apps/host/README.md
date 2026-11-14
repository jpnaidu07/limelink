# Windows desktop capture host

The Electron application captures one selected Windows display and previews the video locally. Use an unlocked, signed-in Windows 11 desktop with an active monitor. The app does not record, capture audio, accept remote input, start a server, or send frames over the network.

## Run on Windows

Install Node.js 22 or later. For session diagnostics, install Python 3 with the Windows Python launcher (`py -3`), or point `CAPTURE_PYTHON` to an installed interpreter. Python uses only its standard library; it is not required for the video path.

From the repository root in PowerShell:

```powershell
cd apps/host
npm.cmd ci
# Only if using a Python executable other than the Windows launcher:
# $env:CAPTURE_PYTHON = 'C:\path\to\python.exe'
npm.cmd start
```

The first launch may download the pinned Electron binary. Choose a display, set a 30 or 60 FPS limit, and select **Start capture**. The app reports the actual video size, negotiated track frame rate and observed preview frame rate. The frame rate limit is not a performance guarantee. Use **Stop**, **Esc**, or close the app to release the track. On a single display, seeing the preview window inside itself is normal. Locking, suspending Windows, a display change, or a paused/ended track stops the preview and requires a new start.

## What runs where

- **Electron main** enumerates Windows displays via `desktopCapturer`, matches stable display IDs, and grants a single use request from the focused trusted frame for the exact selected source. It re-enumerates before granting and rejects stale requests. The dedicated session denies all other permissions and only serves bundled assets from its internal protocol.
- **Sandboxed renderer** requests a video-only stream after the Start gesture, connects it to the local video element, and releases all tracks on stop or invalidation. The preload exposes only capture-specific operations.
- **Python helper** probes session ID, remote-session status, and availability of the Windows input desktop. This read-only diagnostic runs with a timeout. It neither reads pixels nor injects input; Chromium handles capture so frames do not cross a Python IPC boundary. Results describe only the current session and do not guarantee capture.

There are no credentials or secrets to configure. `CAPTURE_PYTHON` is an optional local executable path, not a network or app setting. The [control service](../../services/control/README.md) is independent and is not required to run the host.

## Verify

```powershell
npm.cmd test
# Run only in an unlocked interactive Windows test session with an active display:
npm.cmd run test:desktop
```

The unit tests cover source-grant expiry, single use and revocation. The desktop smoke launches the real Electron window, checks that an unsolicited request is denied, looks for live video frames, and verifies that Stop ends the video track. It does not save frames. For manual hardware coverage, repeat on each monitor, check the Python probe, and disconnect or resize a monitor during capture. Locked or headless sessions, RDP combinations, and protected content are not guaranteed capture targets.
