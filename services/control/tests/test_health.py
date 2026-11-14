from unittest import IsolatedAsyncioTestCase

from httpx import ASGITransport, AsyncClient

from control_api.main import app


class HealthTests(IsolatedAsyncioTestCase):
    async def test_liveness_reports_only_process_status(self) -> None:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://localhost"
        ) as client:
            response = await client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response.headers["cache-control"], "no-store")
