# Signaling boundary

The future authenticated WebSocket handler for `/api/v1/signal` belongs in this package. The starter registers no WebSocket route. Add session authorization, exact Origin checks, and single-use binding grants before mounting that handler. See the [control and signaling design](../../../../docs/design/04-control-and-signaling.md).
