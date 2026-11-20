import unittest
import zipfile
from collections import Counter
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from science.market_data_pipeline import (
    _append_agripricebd_daily, _append_unverified_trend,
    _append_weekly_series, _xlsx_rows, parse_week_date, price_range,
)


class MarketDataPipelineTests(unittest.TestCase):
    def test_price_ranges_reject_reversed_and_zero_values(self):
        self.assertEqual(price_range("1,200.50--1,500"), (1200.5, 1500.0))
        self.assertEqual(price_range("45.5"), (45.5, 45.5))
        self.assertIsNone(price_range("14986.36--8404.55"))
        self.assertIsNone(price_range("0--0"))

    def test_week_bucket_is_disclosed_and_bounded_to_month(self):
        self.assertEqual(parse_week_date("2024", "February", "5").isoformat(), "2024-02-29")
        self.assertIsNone(parse_week_date("2024", "Smarch", "1"))

    def test_weekly_source_removes_only_exact_duplicate_and_converts_quintal(self):
        rows = [
            ["Year", "Month", "Week", "Product", "Retail unit", "Retail price", "Wholesale unit", "Wholesale price"],
            ["2024", "January", "1", "Rice", "Kilogram", "10--12", "Quintal", "1,000--1,100"],
            ["2024", "January", "1", "Rice", "Kilogram", "10--12", "Quintal", "1,000--1,100"],
            ["2024", "January", "2", "Rice", "Kilogram", "0--0", "Quintal", "1,200--1,300"],
        ]
        records = []
        audit = Counter()
        _append_weekly_series(records, audit, "rice.csv", rows)
        self.assertEqual(len(records), 3)
        self.assertEqual(audit["exactDuplicatesRemoved"], 1)
        self.assertEqual(audit["invalidPricesSkipped"], 1)
        wholesale = next(row for row in records if row["price_type"] == "wholesale")
        self.assertEqual(wholesale["unit"], "BDT/kg")
        self.assertEqual(wholesale["minimum_price"], 10.0)
        self.assertEqual(wholesale["maximum_price"], 11.0)
        self.assertEqual(wholesale["date_precision"], "week_of_month")

    def test_mislabeled_xlsx_is_read_as_workbook_not_text(self):
        workbook = BytesIO()
        with zipfile.ZipFile(workbook, "w") as archive:
            archive.writestr("xl/sharedStrings.xml", """<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Year</t></si><si><t>2024</t></si></sst>""")
            archive.writestr("xl/worksheets/sheet1.xml", """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>""")
        self.assertEqual(_xlsx_rows(workbook.getvalue()), [["Year"], ["2024"]])

    def test_agriprice_daily_ranges_keep_price_types_and_drop_outages(self):
        content = (
            "date,product name,measurement,wholesale price minimum,wholesale price maximum,retail price minimum,retail price maximum\n"
            "2024-01-01,Green Chili,kg,20,25,30,35\n"
            "2024-01-02,Green Chili,kg,0,0,0,0\n"
        )
        with TemporaryDirectory() as temp:
            archive_path = Path(temp) / "agri.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("green_chilli/green_chilli.csv", content)
            records, audit = [], Counter()
            _append_agripricebd_daily(records, audit, archive_path)
        self.assertEqual(len(records), 2)
        self.assertEqual({row["price_type"] for row in records}, {"retail", "wholesale"})
        self.assertEqual({row["crop_name_en"] for row in records}, {"Green chilli"})
        self.assertTrue(all(row["frequency"] == "daily" and row["quality_status"] == "review" for row in records))
        self.assertEqual(audit["invalidPricesSkipped"], 2)

    def test_undocumented_trend_rows_are_retained_as_unverified_only(self):
        content = "Date,Vegetable,Price_Tk_per_kg,Trend\n2025-01-24,Tomato,45,Increase\n"
        with TemporaryDirectory() as temp:
            archive_path = Path(temp) / "trend.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("BD_Price_Trend.csv", content)
            records, audit = [], Counter()
            _append_unverified_trend(records, audit, archive_path)
        self.assertEqual(audit["rowsOutput"], 1)
        self.assertEqual(records[0]["quality_status"], "review")
        self.assertEqual(records[0]["price_type"], "unspecified")
        self.assertEqual(records[0]["division"], "Unspecified")


if __name__ == "__main__":
    unittest.main()
