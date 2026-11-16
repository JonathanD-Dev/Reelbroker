"""Trace partagée : une liste de dicts `{agent, step, tool, inputs, outputs, ms}` alimentée par les quatre agents."""
from __future__ import annotations

import time


def now() -> float:
    return time.perf_counter()


def record(trace: list | None, agent: str, step: str, tool: str | None = None, inputs: dict | None = None,
           outputs: dict | None = None, t0: float | None = None) -> None:
    if trace is None:
        return
    ms = round((time.perf_counter() - t0) * 1000, 2) if t0 is not None else 0.0
    trace.append({"agent": agent, "step": step, "tool": tool, "inputs": inputs or {}, "outputs": outputs or {}, "ms": ms})
