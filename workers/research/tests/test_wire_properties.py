"""Wire fuzzing stays offline; checkpoint CAS is authoritative in the TS kernel suite."""
import pytest
from hypothesis import given, settings, strategies as st
from fleet_research.contracts import round_trip

@settings(max_examples=2000, deadline=None)
@given(st.integers(min_value=0, max_value=2**64-1), st.text(min_size=1,max_size=100).filter(lambda x: not any(0xD800 <= ord(c) <= 0xDFFF for c in x)))
def test_large_decimal_null_and_unicode_are_lossless(n, text):
    value={"protocolVersion":1,"counter":str(n),"result":{"status":"unknown","commandId":text,"usage":None}}
    assert round_trip(value)==value

@settings(max_examples=2000, deadline=None)
@given(st.sampled_from(["completed","not_dispatched","pending","unknown"]),st.integers(min_value=0,max_value=2**64-1))
def test_enum_and_partial_usage(status,n):
    value={"protocolVersion":1,"counter":"0","result":{"status":status,"usage":{"inputTokens":str(n),"outputTokens":None}}}
    assert round_trip(value)==value

@given(st.one_of(st.none(),st.booleans(),st.integers().filter(lambda x:x!=1),st.text()))
def test_wire_mismatch_never_coerces_protocol(version):
    with pytest.raises((ValueError,TypeError)):
        round_trip({"protocolVersion":version,"counter":"0"})
