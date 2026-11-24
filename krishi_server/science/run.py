#!/usr/bin/env python3
"""
Krishi Mama — Python Scientific CLI.

Usage:
  python run.py summarize --district chattogram --input input.json [--output output.json]
  python run.py summarize --district chattogram --parameter PRECTOTCORR --input input.json
"""
import argparse
import json
import sys
from pathlib import Path

# Add current dir to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

def get_crop_management_guide(payload):
    """Return source-linked crop guidance from the shared backend reference file.

    This is deterministic retrieval, not a learned model or a recommendation
    calculator. Missing or soil-test-dependent values remain unavailable.
    """
    data_path = Path(__file__).resolve().parent.parent / "data" / "crops" / "crop_management.json"
    with data_path.open("r", encoding="utf-8") as source_file:
        reference = json.load(source_file)
    catalog_path = data_path.parent / "crop_catalog.json"
    with catalog_path.open("r", encoding="utf-8") as source_file:
        catalog = json.load(source_file)
    knowledge_path = data_path.parent / "crop_knowledge.json"
    with knowledge_path.open("r", encoding="utf-8") as source_file:
        knowledge = json.load(source_file)
    calendar_path = data_path.parent / "official_crop_calendars.json"
    with calendar_path.open("r", encoding="utf-8") as source_file:
        calendar_data = json.load(source_file)

    crop_id = str(payload.get("cropId") or payload.get("crop") or "").strip().lower()
    crop = next((item for item in catalog.get("crops", []) if crop_id in {
        str(item.get("code", "")).strip().lower(),
        str(item.get("nameEn", "")).strip().lower(),
        str(item.get("nameBn", "")).strip().lower(),
        *[str(alias).strip().lower() for alias in item.get("aliasesEn", [])],
        *[str(alias).strip().lower() for alias in item.get("aliasesBn", [])],
    }), None)
    if crop is None:
        return {"success": False, "status": "UNKNOWN_CROP", "cropId": crop_id or None}
    crop_id = crop["code"]
    record = reference.get("crops", {}).get(crop_id, {})
    knowledge_record = next((item for item in knowledge.get("crops", []) if item.get("cropId") == crop_id), {})
    calendar_record = next((item for item in calendar_data.get("crops", []) if item.get("cropId") == crop_id), None)

    fields = record.get("fields", {})
    expected_fields = ("lifecycle", "timing", "water", "fertilizer", "compost")
    normalized_fields = {
        name: fields.get(name, {"status": "not_verified", "value": None, "sourceIds": []})
        for name in expected_fields
    }
    district_calendars = {}
    if calendar_record:
        for district_id, district_data in calendar_record.get("districts", {}).items():
            district_calendars[district_id] = {
                "districtName": district_data.get("districtName"),
                "totalDurationDays": district_data.get("totalDurationDays"),
                "sowingPeriod": district_data.get("sowingPeriod"),
                "transplantingPeriod": district_data.get("transplantingPeriod"),
                "harvestingPeriod": district_data.get("harvestingPeriod"),
                "waterRequirementMmTotal": district_data.get("waterRequirementMmTotal"),
                "stages": district_data.get("stages", []),
                "sourcePublisher": district_data.get("sourcePublisher"),
                "sourceDocumentTitle": district_data.get("sourceDocumentTitle"),
                "sourceDocumentUrl": district_data.get("sourceDocumentUrl"),
            }
        calendar_sources = [
            {
                "organization": district_data.get("sourcePublisher"),
                "title": district_data.get("sourceDocumentTitle"),
                "url": district_data.get("sourceDocumentUrl"),
            }
            for district_data in calendar_record.get("districts", {}).values()
        ]
    else:
        calendar_sources = []
    district_names = ", ".join(item.get("districtName", key) for key, item in district_calendars.items())
    if district_calendars:
        normalized_fields["lifecycle"] = {
            "status": "verified_limited",
            "value": f"Official crop calendars list crop duration by district: {district_names}. See districtCalendars for dates and stage details.",
            "unit": "days; selected districts only",
            "sourceIds": ["official_crop_calendar"],
        }
        normalized_fields["timing"] = {
            "status": "verified_limited",
            "value": f"Official dates exist only for these districts: {district_names}; use the matching district calendar below.",
            "sourceIds": ["official_crop_calendar"],
        }
        normalized_fields["water"] = {
            "status": "verified_limited",
            "value": f"Seasonal, stage-based water requirement is available only for these district calendars: {district_names}; see districtCalendars. This is not a field irrigation prescription.",
            "unit": "mm per crop cycle; selected district calendar",
            "sourceIds": ["official_crop_calendar"],
        }
    verified = [name for name, item in normalized_fields.items() if item.get("status", "").startswith("verified")]
    pending = [name for name, item in normalized_fields.items() if not item.get("status", "").startswith("verified")]
    has_verified_data = bool(verified)
    return {
        "success": True,
        "status": "PARTIALLY_VERIFIED" if has_verified_data else "NOT_VERIFIED",
        "cropId": crop_id,
        "nameEn": crop.get("nameEn"),
        "nameBn": crop.get("nameBn"),
        "fields": normalized_fields,
        "districtCalendars": district_calendars,
        "generalGuide": knowledge_record.get("generalGuide"),
        "identityNote": record.get("identityNote") or knowledge_record.get("verificationNote"),
        "sources": (record.get("sources") or knowledge_record.get("sources", [])) + calendar_sources,
        "metadata": reference.get("metadata", {}),
        "verifiedFields": verified,
        "pendingFields": pending,
        "disclosure": "Source-linked reference only. Do not infer missing quantities, convert area units, or treat general rates as personalized advice. Check soil test, AEZ, variety, season and local DAE guidance.",
    }


def main():
    parser = argparse.ArgumentParser(description="Krishi Mama Scientific Analysis CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    summarize_parser = subparsers.add_parser("summarize", help="Generate climate statistical summaries")
    summarize_parser.add_argument("--district", required=True, help="District code (chattogram or cumilla)")
    summarize_parser.add_argument("--parameter", default=None, help="Optional parameter filter (e.g. PRECTOTCORR, T2M)")
    summarize_parser.add_argument("--input", required=True, help="Path to input JSON snapshot (or - for stdin)")
    summarize_parser.add_argument("--output", default=None, help="Path to output JSON file (default stdout)")

    handoff_parser = subparsers.add_parser("handoff", help="Analyze crop transition handoff planning & climate shifts")
    handoff_parser.add_argument("--district", required=True, help="District code (chattogram or cumilla)")
    handoff_parser.add_argument("--crop-transition", default="aman-mustard", help="Crop transition pair (default: aman-mustard)")
    handoff_parser.add_argument("--input", required=True, help="Path to input JSON snapshot (or - for stdin)")
    handoff_parser.add_argument("--output", default=None, help="Path to output JSON file (default stdout)")

    farm_parser = subparsers.add_parser("farm-report", help="Combine validated NASA environmental evidence")
    farm_parser.add_argument("--input", required=True, help="Path to report JSON (or - for stdin)")
    farm_parser.add_argument("--output", default=None, help="Path to output JSON file (default stdout)")

    market_parser = subparsers.add_parser("market-forecast", help="Train and backtest a short-range market price model")
    market_parser.add_argument("--input", required=True, help="Path to JSON input (or - for stdin)")
    market_parser.add_argument("--output", default=None, help="Path to output JSON file (default stdout)")

    crop_guide_parser = subparsers.add_parser("crop-guide", help="Retrieve source-linked Bangladesh crop management data")
    crop_guide_parser.add_argument("--input", required=True, help="Path to JSON input (or - for stdin)")
    crop_guide_parser.add_argument("--output", default=None, help="Path to output JSON file (default stdout)")

    args = parser.parse_args()

    # Read input
    if args.input == "-":
        raw_text = sys.stdin.read()
    else:
        with open(args.input, "r", encoding="utf-8") as f:
            raw_text = f.read()

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Error parsing JSON input: {e}\n")
        sys.exit(1)

    if args.command == "farm-report":
        from farm_report import build_farm_environment_report

        report = build_farm_environment_report(payload)
        output_json = json.dumps(report, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_json)
        else:
            print(output_json)
        if not report.get("success"):
            sys.exit(1)
        return

    if args.command == "market-forecast":
        from market_forecast import forecast_market_prices

        result = forecast_market_prices(payload)
        output_json = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_json)
        else:
            print(output_json)
        if not result.get("success"):
            sys.exit(2)
        return

    if args.command == "crop-guide":
        result = get_crop_management_guide(payload)
        output_json = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_json)
        else:
            print(output_json)
        if not result.get("success"):
            sys.exit(2)
        return

    from contract import build_output_envelope, validate_input_snapshot
    from stats import (
        summarize_parameter,
        summarize_rainfall,
        summarize_temperature,
        summarize_handoff,
        sowing_window_rainfall_coverage,
    )

    errors = validate_input_snapshot(payload)
    if errors:
        sys.stderr.write(f"Validation error: {'; '.join(errors)}\n")
        sys.exit(1)

    district = args.district.lower()
    observations = payload.get("observations", [])

    # Group observations by parameter
    by_param = {}
    for obs in observations:
        p = obs.get("parameter")
        if not p:
            continue
        if p not in by_param:
            by_param[p] = []
        by_param[p].append(obs)

    if args.command == "handoff":
        crop_trans = getattr(args, "crop_transition", "aman-mustard")
        rain_obs = by_param.get("PRECTOTCORR", [])
        tmin_obs = by_param.get("T2M_MIN", [])
        t2m_obs = by_param.get("T2M", [])

        handoff_result = summarize_handoff(
            rainfall_obs=rain_obs,
            t2m_min_obs=tmin_obs,
            t2m_obs=t2m_obs,
            crop_transition=crop_trans,
        )

        # Rainfall sowing-window coverage only. Temperature is not folded into this percentage.
        rainfall_coverage = sowing_window_rainfall_coverage(rain_obs, crop_trans)
        meta_extra = {
            "total_observations": rainfall_coverage["expected_observations"],
            "valid_observations": rainfall_coverage["valid_observations"],
            "missing_observations": rainfall_coverage["missing_observations"],
            "years_used": handoff_result.get("years_used", 0),
            "coverage_percent": rainfall_coverage["coverage_percent"],
            "coverage_basis": rainfall_coverage["coverage_basis"],
            "coverage_parameter": "PRECTOTCORR",
            "formula_version": "v1.0.0-phase3",
        }
        envelope = build_output_envelope(
            district,
            f"HANDOFF_{crop_trans.upper()}",
            "composite",
            {**handoff_result, **meta_extra},
        )
    else:
        target_param = args.parameter

        if target_param:
            param_obs = by_param.get(target_param, [])
            if target_param == "PRECTOTCORR":
                result = summarize_rainfall(param_obs)
                unit = "mm/day"
            elif target_param == "T2M":
                result = summarize_temperature(
                    t2m_obs=param_obs,
                    t2m_max_obs=by_param.get("T2M_MAX"),
                    t2m_min_obs=by_param.get("T2M_MIN"),
                )
                unit = "C"
            elif target_param in ("T2M_MAX", "T2M_MIN"):
                unit = "C"
                result = summarize_parameter(param_obs, target_param, unit)
            elif target_param == "RH2M":
                unit = "%"
                result = summarize_parameter(param_obs, target_param, unit)
            elif target_param == "ALLSKY_SFC_SW_DWN":
                unit = "MJ/m^2/day"
                result = summarize_parameter(param_obs, target_param, unit)
            else:
                sys.stderr.write(f"Unknown or unsupported parameter: {target_param}\n")
                sys.exit(1)

            envelope = build_output_envelope(district, target_param, unit, result)
        else:
            # Full multi-parameter summary
            summaries = {}
            if "PRECTOTCORR" in by_param:
                summaries["rainfall"] = summarize_rainfall(by_param["PRECTOTCORR"])

            if "T2M" in by_param:
                summaries["temperature"] = summarize_temperature(
                    t2m_obs=by_param["T2M"],
                    t2m_max_obs=by_param.get("T2M_MAX"),
                    t2m_min_obs=by_param.get("T2M_MIN"),
                )

            for p, unit in [("RH2M", "%"), ("ALLSKY_SFC_SW_DWN", "MJ/m^2/day")]:
                if p in by_param:
                    summaries[p.lower()] = summarize_parameter(by_param[p], p, unit)

            total_obs = sum(s.get("total_observations", 0) for s in summaries.values())
            valid_obs = sum(s.get("valid_observations", 0) for s in summaries.values())
            missing_obs = sum(s.get("missing_observations", 0) for s in summaries.values())
            years_used = max((s.get("years_used", 0) for s in summaries.values()), default=0)
            cov_pct = round((valid_obs / total_obs * 100), 2) if total_obs > 0 else 0.0

            meta_stats = {
                "total_observations": total_obs,
                "valid_observations": valid_obs,
                "missing_observations": missing_obs,
                "years_used": years_used,
                "coverage_percent": cov_pct,
                "formula_version": "v1.0.0-phase3",
            }

            envelope = build_output_envelope(district, "ALL", "mixed", {**summaries, **meta_stats})

    output_json = json.dumps(envelope, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
