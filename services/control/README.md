# Control API starter

A Python 3.12 FastAPI service served by Uvicorn. `GET /health` returns HTTP 200 and `{"status":"ok"}` with `Cache-Control: no-store`. It means the process is answering HTTP requests. It says nothing about authentication, streaming readiness, Windows sessions, GPUs, or TURN.

From the repository root on Windows, in PowerShell with Python 3.12 installed:

```powershell
cd services/control
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn control_api.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers --ws none
```

In a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

On macOS/Linux, use `.venv/bin/python` in the same commands after creating the venv. Use `Ctrl+C` to stop Uvicorn. This is a local development server; HTTPS termination and cross-device access are outside this first step.

To run tests from `services/control` on Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Interactive API documentation, the OpenAPI HTTP route, and signaling are disabled in this starter. The next slice is local enrollment and session authentication, then authenticated WebSocket binding. See the [design](../../docs/design/04-control-and-signaling.md).
