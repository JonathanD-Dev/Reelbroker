"""Délai maximal dur pour un appel (Bedrock) : exécuté dans un fil démon ; au dépassement, TimeoutError et le fil est abandonné."""
from __future__ import annotations

import threading

TIMEOUT_S = 45.0


def call_with_timeout(fn, *args, timeout: float | None = None, **kwargs):
    limit = TIMEOUT_S if timeout is None else timeout
    box: dict = {}

    def work():
        try:
            box["v"] = fn(*args, **kwargs)
        except BaseException as exc:  # noqa: BLE001
            box["e"] = exc

    t = threading.Thread(target=work, daemon=True)
    t.start()
    t.join(limit)
    if t.is_alive():
        raise TimeoutError(f"délai de {limit:g} s dépassé")
    if "e" in box:
        raise box["e"]
    return box["v"]
