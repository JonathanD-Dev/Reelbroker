"""ReelBroker datathon toolkit: data -> metrics -> profile -> allocation -> explanation."""
from . import metrics
from .allocate import allocate, compare, expected_returns
from .data import starter_metadata, load_macro, load_prices, load_starter, load_universe, make_synthetic, quality_report, read_any
from .explain import explain
from .profile import InvestorProfile

__all__ = ["metrics", "allocate", "compare", "expected_returns", "load_prices", "make_synthetic",
           "quality_report", "read_any", "load_starter", "load_universe", "load_macro", "explain", "InvestorProfile"]
from . import agents, data, decide, learn, questionnaire  # noqa: E402
