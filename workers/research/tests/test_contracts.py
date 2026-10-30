import pytest
from fleet_research.contracts import round_trip


def test_round_trips_cross_language_fixture():
    data = {
        "protocolVersion": 1,
        "counter": "9007199254740993",
        "result": {"status": "unknown", "usage": None},
    }
    assert round_trip(data) == data
    assert round_trip({**data, "counter": "0"})["counter"] == "0"


@pytest.mark.parametrize(
    "update",
    [
        {"protocolVersion": 2},
        {"counter": 9007199254740993},
        {"result": {"status": "invented"}},
    ],
)
def test_rejects_invalid(update):
    with pytest.raises(ValueError):
        round_trip({"protocolVersion": 1, "counter": "1", **update})


from hypothesis import given
from hypothesis import strategies as st


@given(st.integers(min_value=0, max_value=2**64 - 1))
def test_all_uint64_values_retain_decimal_identity(counter):
    data = {
        "protocolVersion": 1,
        "counter": str(counter),
        "result": {"status": "unknown", "usage": None},
    }
    assert round_trip(data) == data


@given(st.sampled_from(["complete", "partial", "unavailable", "withheld", "expired"]))
def test_coverage_enum_and_zero_are_preserved(status):
    data = {
        "protocolVersion": 1,
        "counter": "0",
        "coverage": {"status": status, "expected": "0", "recorded": "0", "reasons": []},
    }
    assert round_trip(data) == data
