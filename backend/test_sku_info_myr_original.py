"""Unit tests for SKU_Info MYR-Original column mapping (no Google Sheets)."""
import unittest

from services.price_checker_logic import (
    ORIGINAL_TIER,
    resolve_sku_info_price_column,
    tier_lookup_keys,
    _item_price,
)
from services.public_catalog_logic import _sort_catalog_products, _tier_price_from_prices


class TestSkuInfoMyrOriginal(unittest.TestCase):
    def test_resolve_myr_original_column(self):
        normalized = {
            "sku": "SKU",
            "myr-original": "MYR-Original",
            "original": "Original",
            "idr-daily-discount": "IDR-Daily-Discount",
        }
        self.assertEqual(
            resolve_sku_info_price_column(normalized, currency="MYR", tier=ORIGINAL_TIER),
            "MYR-Original",
        )
        self.assertEqual(
            resolve_sku_info_price_column(normalized, currency="IDR", tier=ORIGINAL_TIER),
            "Original",
        )

    def test_resolve_myr_daily_discount_unchanged(self):
        normalized = {"myr-daily-discount": "MYR-Daily-Discount"}
        self.assertEqual(
            resolve_sku_info_price_column(normalized, currency="MYR", tier="Daily-Discount"),
            "MYR-Daily-Discount",
        )

    def test_tier_price_from_nested_myr_original(self):
        raw = {
            "IDR": {"Original": 199000, "Daily-Discount": 149000},
            "MYR": {"Original": 89.9, "Daily-Discount": 69.9},
            "stock": {},
        }
        self.assertEqual(_tier_price_from_prices(raw, ORIGINAL_TIER, currency="MYR"), 89.9)
        self.assertEqual(_tier_price_from_prices(raw, "Daily-Discount", currency="MYR"), 69.9)

    def test_tier_price_legacy_myr_original_key(self):
        raw = {
            "IDR": {"Original": 100},
            "MYR": {"MYR-Original": 55.5, "Daily-Discount": 49},
            "stock": {},
        }
        self.assertEqual(_tier_price_from_prices(raw, ORIGINAL_TIER, currency="MYR"), 55.5)

    def test_sort_catalog_products_price_first(self):
        items = [
            {"sku": "B", "has_price": False},
            {"sku": "A", "has_price": True},
            {"sku": "C", "has_price": True},
        ]
        sorted_items = _sort_catalog_products(items)
        self.assertEqual([p["sku"] for p in sorted_items], ["A", "C", "B"])

    def test_item_price_reads_myr_original(self):
        item = {
            "_currencies": {
                "IDR": {"Original": 100},
                "MYR": {"Original": 42},
            },
        }
        self.assertEqual(_item_price(item, ORIGINAL_TIER, "MYR"), 42)
        self.assertIn("MYR-Original", tier_lookup_keys(ORIGINAL_TIER, "MYR"))


if __name__ == "__main__":
    unittest.main()
