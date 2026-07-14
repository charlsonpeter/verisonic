"""Unit tests for billing period day counts and duration allocation."""
import datetime

from app.services.billing_period import (
    billing_cycle_days,
    subtract_calendar_month,
    subtract_calendar_year,
)
from app.services.daily_settlement_service import allocate_by_duration
from app.services.subscription_service import add_calendar_month, add_calendar_year


def test_billing_cycle_days_jul_to_aug():
    assert billing_cycle_days(datetime.date(2025, 7, 15), datetime.date(2025, 8, 15)) == 31


def test_billing_cycle_days_feb_non_leap():
    start = datetime.date(2025, 2, 10)
    end = datetime.date(2025, 3, 10)
    assert billing_cycle_days(start, end) == 28


def test_billing_cycle_days_feb_leap():
    start = datetime.date(2024, 2, 10)
    end = datetime.date(2024, 3, 10)
    assert billing_cycle_days(start, end) == 29


def test_billing_cycle_days_yearly_non_leap():
    start = datetime.date(2025, 3, 1)
    end = datetime.date(2026, 3, 1)
    assert billing_cycle_days(start, end) == 365


def test_billing_cycle_days_yearly_leap():
    start = datetime.date(2024, 3, 1)
    end = datetime.date(2025, 3, 1)
    assert billing_cycle_days(start, end) == 365  # Mar1→Mar1 across leap day = 365


def test_billing_cycle_days_yearly_includes_feb29():
    start = datetime.date(2024, 1, 1)
    end = datetime.date(2025, 1, 1)
    assert billing_cycle_days(start, end) == 366


def test_add_subtract_calendar_month_roundtrip():
    base = datetime.datetime(2025, 1, 31, 12, 0, 0)
    forward = add_calendar_month(base)
    assert forward == datetime.datetime(2025, 2, 28, 12, 0, 0)
    back = subtract_calendar_month(forward)
    assert back.month == 1
    assert back.day == 28


def test_add_subtract_calendar_year_leap():
    base = datetime.datetime(2024, 2, 29, 10, 0, 0)
    forward = add_calendar_year(base)
    assert forward == datetime.datetime(2025, 2, 28, 10, 0, 0)
    back = subtract_calendar_year(forward)
    assert back.year == 2024
    assert back.month == 2


def test_allocate_by_duration_60_30_10():
    pool = 1000
    seconds = {1: 3600.0, 2: 1800.0, 3: 600.0}
    shares = allocate_by_duration(pool, seconds)
    assert shares[1] == 600
    assert shares[2] == 300
    assert shares[3] == 100
    assert sum(shares.values()) == pool


def test_allocate_by_duration_remainder_to_largest():
    pool = 100
    seconds = {10: 1.0, 20: 1.0, 30: 1.0}
    shares = allocate_by_duration(pool, seconds)
    assert sum(shares.values()) == 100
    # floors are 33 each (99), remainder 1 goes to lowest owner id among tied seconds
    assert shares[10] == 34
    assert shares[20] == 33
    assert shares[30] == 33


def test_allocate_empty_or_zero():
    assert allocate_by_duration(100, {}) == {}
    assert allocate_by_duration(0, {1: 10.0}) == {}
    assert allocate_by_duration(100, {1: 0.0}) == {}
