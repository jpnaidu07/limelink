from fastapi import FastAPI, Response

app = FastAPI(
    title="Control API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health")
async def health(response: Response) -> dict[str, str]:
    """Report process liveness without exposing host or session state."""
    response.headers["Cache-Control"] = "no-store"
    return {"status": "ok"}
