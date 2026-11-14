"""Report local Windows session diagnostics without reading screen contents."""

import ctypes
import json
import sys
from ctypes import wintypes


def probe():
    if sys.platform != "win32":
        return {"status": "unavailable"}

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32.GetCurrentProcessId.restype = wintypes.DWORD
    kernel32.ProcessIdToSessionId.argtypes = (wintypes.DWORD, ctypes.POINTER(wintypes.DWORD))
    kernel32.ProcessIdToSessionId.restype = wintypes.BOOL
    user32.GetSystemMetrics.argtypes = (ctypes.c_int,)
    user32.GetSystemMetrics.restype = ctypes.c_int
    user32.OpenInputDesktop.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    user32.OpenInputDesktop.restype = wintypes.HANDLE
    user32.GetUserObjectInformationW.argtypes = (
        wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
    )
    user32.GetUserObjectInformationW.restype = wintypes.BOOL
    user32.CloseDesktop.argtypes = (wintypes.HANDLE,)
    user32.CloseDesktop.restype = wintypes.BOOL

    session = wintypes.DWORD()
    if not kernel32.ProcessIdToSessionId(kernel32.GetCurrentProcessId(), ctypes.byref(session)):
        return {"status": "unavailable"}

    desktop_state = "unavailable"
    desktop = user32.OpenInputDesktop(0, False, 0x0001)  # DESKTOP_READOBJECTS
    if desktop:
        try:
            name = ctypes.create_unicode_buffer(128)
            needed = wintypes.DWORD()
            if user32.GetUserObjectInformationW(desktop, 2, name, ctypes.sizeof(name), ctypes.byref(needed)):
                desktop_state = "available" if name.value.casefold() == "default" else "unavailable"
            else:
                desktop_state = "unknown"
        finally:
            user32.CloseDesktop(desktop)

    return {
        "status": "ok",
        "windowsSessionId": session.value,
        "inputDesktop": desktop_state,
        "remoteSession": bool(user32.GetSystemMetrics(0x1000)),  # SM_REMOTESESSION
    }


if __name__ == "__main__":
    print(json.dumps(probe()))
