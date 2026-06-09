import io
import re
import base64
import math
from datetime import datetime
from typing import Any, Dict, List, Tuple

import pandas as pd
import numpy as np

MODE_AGGREGATE = "Aggregate (Multi-Day)"
MODE_DAILY = "Daily (Per File Date)"

# ==========================================
# HELPERS
# ==========================================
def clean_numeric(val) -> float:
    """Safely convert any value to float. Returns 0.0 on failure."""
    try:
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            if pd.isna(val):
                return 0.0
            return float(val)
        val_str = str(val).replace(",", "").strip()
        if val_str == "" or val_str.lower() == "nan":
            return 0.0
        return float(val_str)
    except Exception:
        return 0.0


def _clean_numeric_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce").fillna(0.0)
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False).str.strip(),
        errors="coerce",
    ).fillna(0.0)


_NUMERIC_COLS = [
    "Cost",
    "SKU orders",
    "Gross revenue",
    "Product ad impressions",
    "Product ad clicks",
]


def extract_date_from_filename(filename: str) -> pd.Timestamp:
    matches = re.findall(r"\d{4}-\d{2}-\d{2}", filename or "")
    if matches:
        return pd.to_datetime(matches[-1], errors="coerce")
    return pd.NaT


def build_export_filename(mode_label: str, filenames: List[str]) -> str:
    today_label = datetime.now().strftime("%Y-%m-%d")
    export_mode = "Aggregate" if mode_label == MODE_AGGREGATE else "Daily"

    if mode_label != MODE_DAILY:
        return f"TikTok_Ads_{export_mode}_{today_label}.xlsx"

    detected_dates = []
    for name in filenames:
        dt = extract_date_from_filename(name)
        if not pd.isna(dt):
            detected_dates.append(dt.normalize())

    if not detected_dates:
        return f"TikTok_Ads_{export_mode}_{today_label}.xlsx"

    min_date = min(detected_dates)
    max_date = max(detected_dates)

    if min_date == max_date:
        date_label = min_date.strftime("%Y-%m-%d")
    else:
        date_label = f"{min_date.strftime('%Y-%m-%d')}_to_{max_date.strftime('%Y-%m-%d')}"

    return f"TikTok_Ads_{export_mode}_{date_label}.xlsx"


def calculate_metrics_vectorized(df: pd.DataFrame, group_cols: List[str]) -> pd.DataFrame:
    """Calculate all KPI metrics for a group. Fast vectorized implementation."""
    if df.empty:
        return pd.DataFrame(columns=group_cols + [
            "Gross Revenue", "Cost", "SKU Orders", "CPO", "ROAS", "ROI", "Impressions", "Clicks"
        ])

    agg_df = df.groupby(group_cols, as_index=False).agg({
        "Cost": "sum",
        "Gross revenue": "sum",
        "SKU orders": "sum",
        "Product ad impressions": "sum",
        "Product ad clicks": "sum"
    })

    # Calculations exactly matching user's calculate_metrics
    cost = np.ceil(agg_df["Cost"])
    revenue = np.ceil(agg_df["Gross revenue"])
    sku_orders = agg_df["SKU orders"]

    agg_df["Cost"] = cost.astype(int)
    agg_df["Gross Revenue"] = revenue.astype(int)
    agg_df["SKU Orders"] = sku_orders.astype(int)
    agg_df["Impressions"] = agg_df["Product ad impressions"].astype(int)
    agg_df["Clicks"] = agg_df["Product ad clicks"].astype(int)

    cpo = np.where(sku_orders > 0, cost / sku_orders, 0.0)
    roas = np.where(cost > 0, revenue / cost, 0.0)
    roi = np.where(cost > 0, (revenue - cost) / cost, 0.0)

    agg_df["CPO"] = np.round(cpo, 2)
    agg_df["ROAS"] = np.round(roas, 2)
    agg_df["ROI"] = np.round(roi, 2)

    desired_cols = group_cols + [
        "Gross Revenue", "Cost", "SKU Orders", "CPO", "ROAS", "ROI", "Impressions", "Clicks"
    ]
    return agg_df[desired_cols]


# Column name aliases for TikTok Ads export detection (lowercase, order = priority)
_TIKTOK_COL_ALIASES = [
    ("Product ID",               ["product id", "productid", "product_id"]),
    ("Creative type",            ["creative type", "creative_type", "ad type", "ad_type", "creativetype"]),
    ("Video ID",                 ["video id", "videoid", "video_id"]),
    ("TikTok account",           ["tiktok account", "tiktok_account", "account name", "account"]),
    ("Time posted",              ["time posted", "time_posted", "post time", "post_time", "posting time", "date"]),
    ("Status",                   ["status"]),
    ("Cost",                     ["cost", "spend", "total spend", "total_spend"]),
    ("SKU orders",               ["sku orders", "sku_orders", "orders", "product orders", "product_orders"]),
    ("Gross revenue",            ["gross revenue", "gross_revenue", "revenue", "gmv", "product revenue"]),
    ("Product ad impressions",   ["product ad impressions", "product_ad_impressions", "impressions"]),
    ("Product ad clicks",        ["product ad clicks", "product_ad_clicks", "clicks"]),
]

_FALLBACK_INDICES = [2, 3, 5, 6, 7, 8, 10, 11, 13, 15, 16]


def _detect_header_row(raw_df: pd.DataFrame) -> int:
    """Scan first 5 rows to find which row contains the actual column headers."""
    known = ["product id", "creative type", "cost", "status", "video id"]
    for i in range(min(5, len(raw_df))):
        row_vals = [str(v).lower().strip() for v in raw_df.iloc[i].values]
        if sum(1 for k in known if any(k in rv for rv in row_vals)) >= 3:
            return i
    return -1  # already has headers in row 0 via pandas


def _map_columns_by_name(raw_df: pd.DataFrame):
    """Try to map columns by name. Returns (indices, names) or (None, None)."""
    cols_lower = {str(c).lower().strip(): i for i, c in enumerate(raw_df.columns)}
    indices, names = [], []
    for target_name, aliases in _TIKTOK_COL_ALIASES:
        found = None
        for alias in aliases:
            if alias in cols_lower:
                found = cols_lower[alias]
                break
        if found is None:
            return None, None
        indices.append(found)
        names.append(target_name)
    return indices, names


def _map_columns_from_headers(headers: list) -> dict[str, str] | None:
    """Map canonical column name → source header label."""
    lower_to_src: dict[str, str] = {}
    for header in headers:
        key = str(header or "").strip().lower()
        if key:
            lower_to_src[key] = header

    out: dict[str, str] = {}
    for canonical, aliases in _TIKTOK_COL_ALIASES:
        found = None
        for alias in aliases:
            if alias in lower_to_src:
                found = lower_to_src[alias]
                break
        if not found:
            return None
        out[canonical] = found
    return out


def _load_raw_tiktok_export(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Load only required TikTok export columns (calamine for .xlsx)."""
    expected_cols = [name for name, _ in _TIKTOK_COL_ALIASES]
    bio = io.BytesIO(file_bytes)

    if filename.lower().endswith(".csv"):
        peek = pd.read_csv(io.BytesIO(file_bytes), nrows=5, header=None, dtype=str)
        header_row = _detect_header_row(peek)
        bio.seek(0)
        read_kwargs: dict = {"dtype": str}
        if header_row > 0:
            read_kwargs["skiprows"] = header_row
        raw_df = pd.read_csv(bio, **read_kwargs)
    else:
        sheet = "Data"
        try:
            peek = pd.read_excel(
                io.BytesIO(file_bytes),
                sheet_name=sheet,
                nrows=5,
                header=None,
                engine="calamine",
            )
        except (ValueError, KeyError):
            sheet = 0
            peek = pd.read_excel(
                io.BytesIO(file_bytes),
                sheet_name=sheet,
                nrows=5,
                header=None,
                engine="calamine",
            )

        header_row = _detect_header_row(peek)
        bio.seek(0)
        header_df = pd.read_excel(
            io.BytesIO(file_bytes),
            sheet_name=sheet,
            skiprows=header_row if header_row > 0 else None,
            nrows=0,
            engine="calamine",
        )
        headers = list(header_df.columns)
        col_map = _map_columns_from_headers(headers)

        read_kwargs = {
            "sheet_name": sheet,
            "engine": "calamine",
            "dtype": str,
        }
        if header_row > 0:
            read_kwargs["skiprows"] = header_row

        if col_map:
            read_kwargs["usecols"] = list(col_map.values())
            raw_df = pd.read_excel(bio, **read_kwargs)
            raw_df = raw_df.rename(columns={src: canon for canon, src in col_map.items()})
        else:
            if len(headers) <= max(_FALLBACK_INDICES):
                raise ValueError(
                    f"Column mapping failed for '{filename}'. "
                    f"Found {len(headers)} columns: {headers[:20]}. "
                    "Expected either named columns (Product ID, Creative type, Cost …) "
                    "or at least 17 positional columns."
                )
            read_kwargs["usecols"] = _FALLBACK_INDICES
            raw_df = pd.read_excel(bio, **read_kwargs)
            raw_df.columns = expected_cols

    return raw_df.dropna(how="all").reset_index(drop=True)


def _filter_meaningful_ads_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows where Cost and Gross revenue are both zero (same rule as Ads Monitor)."""
    if df.empty:
        return df
    return df.loc[(df["Cost"] != 0) | (df["Gross revenue"] != 0)].copy()


def read_and_transform_single_file(file_bytes: bytes, filename: str, mode_label: str) -> pd.DataFrame:
    df = _load_raw_tiktok_export(file_bytes, filename)

    # Drop summary/total rows that TikTok appends at the bottom
    _SKIP_IDS = {"", "-", "nan", "total", "grand total", "summary", "subtotal"}
    df = df[~df["Product ID"].fillna("").astype(str).str.strip().str.lower().isin(_SKIP_IDS)].copy()

    for col in _NUMERIC_COLS:
        df[col] = _clean_numeric_series(df[col])

    df = _filter_meaningful_ads_rows(df)

    df["Product ID"] = df["Product ID"].fillna("-").astype(str).str.replace(r"\.0$", "", regex=True)
    df["Video ID"] = df["Video ID"].fillna("-").astype(str).str.replace(r"\.0$", "", regex=True)
    df["TikTok account"] = df["TikTok account"].fillna("-").astype(str)
    df["Creative type"] = df["Creative type"].fillna("Unknown").astype(str).str.strip()
    df["Status"] = df["Status"].fillna("Unknown").astype(str).str.strip()
    df["Time posted"] = pd.to_datetime(df["Time posted"], errors="coerce")

    df["Source File"] = filename

    if mode_label == MODE_DAILY:
        file_date = extract_date_from_filename(filename)
        if pd.isna(file_date):
            raise ValueError(
                f"Could not detect file date from filename: {filename}. "
                "Daily mode requires YYYY-MM-DD in each filename."
            )
        df["Data Date"] = file_date

    return df.reset_index(drop=True)


def build_summary_sheet(df: pd.DataFrame, mode_label: str) -> pd.DataFrame:
    base_metrics = ["Gross Revenue", "Cost", "SKU Orders", "CPO", "ROAS", "ROI", "Impressions", "Clicks"]

    if mode_label == MODE_AGGREGATE:
        grouped = calculate_metrics_vectorized(df, ["Product ID", "Creative type"])
        if grouped.empty:
            return pd.DataFrame()

        pivot_df = grouped.pivot(index="Product ID", columns="Creative type").fillna(0)
        pivot_cols = []
        for col in pivot_df.columns:
            metric, ctype = col[0], col[1]
            pivot_cols.append(f"[{ctype}] {metric}" if ctype else metric)
        pivot_df.columns = pivot_cols

        overall = calculate_metrics_vectorized(df, ["Product ID"]).set_index("Product ID")
        overall.columns = [f"[Overall] {c}" for c in overall.columns]

        summary = pivot_df.join(overall).reset_index()

        for ct in ["Product card", "Video"]:
            for m in base_metrics:
                col_name = f"[{ct}] {m}"
                if col_name not in summary.columns:
                    summary[col_name] = 0.0

        ordered_cols = (
            ["Product ID"] +
            [f"[Product card] {m}" for m in base_metrics] +
            [f"[Video] {m}" for m in base_metrics] +
            [f"[Overall] {m}" for m in base_metrics]
        )
        summary = summary[[c for c in ordered_cols if c in summary.columns]]
        metric_cols = [c for c in summary.columns if c != "Product ID"]
        summary = summary.loc[(summary[metric_cols] != 0).any(axis=1)].copy()
        return summary

    grouped = calculate_metrics_vectorized(df, ["Data Date", "Product ID", "Creative type"])
    if grouped.empty:
        return pd.DataFrame()

    pivot_df = grouped.pivot(index=["Data Date", "Product ID"], columns="Creative type").fillna(0)
    pivot_cols = []
    for col in pivot_df.columns:
        metric, ctype = col[0], col[1]
        pivot_cols.append(f"[{ctype}] {metric}" if ctype else metric)
    pivot_df.columns = pivot_cols

    overall = calculate_metrics_vectorized(df, ["Data Date", "Product ID"]).set_index(["Data Date", "Product ID"])
    overall.columns = [f"[Overall] {c}" for c in overall.columns]

    summary = pivot_df.join(overall).reset_index()

    for ct in ["Product card", "Video"]:
        for m in base_metrics:
            col_name = f"[{ct}] {m}"
            if col_name not in summary.columns:
                summary[col_name] = 0.0

    ordered_cols = (
        ["Data Date", "Product ID"] +
        [f"[Product card] {m}" for m in base_metrics] +
        [f"[Video] {m}" for m in base_metrics] +
        [f"[Overall] {m}" for m in base_metrics]
    )
    summary = summary[[c for c in ordered_cols if c in summary.columns]]
    metric_cols = [c for c in summary.columns if c not in ["Data Date", "Product ID"]]
    summary = summary.loc[(summary[metric_cols] != 0).any(axis=1)].copy()
    summary["Data Date"] = pd.to_datetime(summary["Data Date"], errors="coerce").dt.strftime("%Y-%m-%d")
    return summary


def build_top10_sheet(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    df = df.copy()
    df["Creative type norm"] = df["Creative type"].astype(str).str.strip().str.lower()

    card_df = df[df["Creative type norm"] == "product card"]
    video_df = df[df["Creative type norm"] == "video"]

    if not card_df.empty:
        top_card = calculate_metrics_vectorized(card_df, ["Product ID"]).sort_values("Gross Revenue", ascending=False).head(10).reset_index(drop=True)
    else:
        top_card = pd.DataFrame(columns=["Product ID", "Gross Revenue", "Cost", "SKU Orders", "CPO", "ROAS", "ROI", "Impressions", "Clicks"])

    if not video_df.empty:
        top_video = calculate_metrics_vectorized(video_df, ["Product ID"]).sort_values("Gross Revenue", ascending=False).head(10).reset_index(drop=True)
    else:
        top_video = pd.DataFrame(columns=["Product ID", "Gross Revenue", "Cost", "SKU Orders", "CPO", "ROAS", "ROI", "Impressions", "Clicks"])

    top_overall = calculate_metrics_vectorized(df, ["Product ID"]).sort_values("Gross Revenue", ascending=False).head(10).reset_index(drop=True)

    return top_card, top_video, top_overall


def build_zero_revenue_sheets(df: pd.DataFrame, mode_label: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    df = df.copy()
    df["Creative type norm"] = df["Creative type"].astype(str).str.strip().str.lower()

    zero_rev_all = df[
        (df["Creative type norm"] == "video") &
        (df["Gross revenue"] == 0) &
        (df["Cost"] > 0)
    ].copy()

    if mode_label == MODE_AGGREGATE:
        cols = [
            "Product ID", "TikTok account", "Video ID",
            "Gross revenue", "Cost", "Time posted", "Posted Days Ago", "Status", "Source File"
        ]
    else:
        cols = [
            "Data Date", "Product ID", "TikTok account", "Video ID",
            "Gross revenue", "Cost", "Time posted", "Posted Days Ago", "Status", "Source File"
        ]

    if zero_rev_all.empty:
        empty_df = pd.DataFrame(columns=cols)
        return empty_df, empty_df.copy()

    current_time = pd.Timestamp.now()
    zero_rev_all["Posted Days Ago"] = ((current_time - zero_rev_all["Time posted"]).dt.days.fillna(0).astype(int))
    zero_rev_all["Time posted"] = zero_rev_all["Time posted"].dt.strftime("%Y-%m-%d %H:%M")
    zero_rev_all["Gross revenue"] = np.ceil(zero_rev_all["Gross revenue"]).astype(int)
    zero_rev_all["Cost"] = np.ceil(zero_rev_all["Cost"]).astype(int)

    if mode_label != MODE_AGGREGATE and "Data Date" in zero_rev_all.columns:
        zero_rev_all["Data Date"] = pd.to_datetime(zero_rev_all["Data Date"], errors="coerce").dt.strftime("%Y-%m-%d")

    active_zero = zero_rev_all[zero_rev_all["Status"].astype(str).str.strip().str.lower() != "excluded"][cols].sort_values(cols[:3])
    excluded_zero = zero_rev_all[zero_rev_all["Status"].astype(str).str.strip().str.lower() == "excluded"][cols].sort_values(cols[:3])

    return active_zero, excluded_zero


def auto_fit_columns(writer, dataframes_map):
    for sheet_name, df_sheet in dataframes_map.items():
        if sheet_name not in writer.sheets:
            continue
        ws = writer.sheets[sheet_name]
        for i, col in enumerate(df_sheet.columns):
            try:
                col_header_len = len(str(col))
                if df_sheet.empty or df_sheet[col].dropna().empty:
                    max_data_len = 0
                else:
                    max_data_len = df_sheet[col].astype(str).str.len().max()
                    if pd.isna(max_data_len):
                        max_data_len = 0
                    else:
                        max_data_len = int(max_data_len)
                final_width = min(max(col_header_len, max_data_len) + 2, 30)
            except Exception:
                final_width = 15
            ws.set_column(i, i, final_width)


def convert_ratio_cols_to_text_for_daily(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    ratio_keywords = ["CPO", "ROAS", "ROI"]
    target_cols = [c for c in out.columns if any(k in str(c) for k in ratio_keywords)]
    for col in target_cols:
        out[col] = out[col].apply(
            lambda x: f"{float(x):.2f}" if pd.notna(x) and str(x).strip() != "" else "0.00"
        )
    return out


def generate_excel_file(summary_df, top_card, top_video, top_overall, active_zero, excluded_zero, mode_label: str) -> bytes:
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book

        fmt_header_card = workbook.add_format({"bold": True, "bg_color": "#E2EFDA", "border": 1, "align": "center"})
        fmt_header_vid = workbook.add_format({"bold": True, "bg_color": "#BDD7EE", "border": 1, "align": "center"})
        fmt_header_ovr = workbook.add_format({"bold": True, "bg_color": "#F8CBAD", "border": 1, "align": "center"})
        fmt_header_base = workbook.add_format({"bold": True, "bg_color": "#F2F2F2", "border": 1, "align": "center"})
        fmt_section = workbook.add_format({"bold": True, "font_size": 12, "bg_color": "#D9E1F2", "border": 1})

        summary_sheet_name = "Summary by Product" if mode_label == MODE_AGGREGATE else "Daily Summary by Product"

        summary_df.to_excel(writer, sheet_name=summary_sheet_name, index=False)
        ws1 = writer.sheets[summary_sheet_name]

        for col_num, value in enumerate(summary_df.columns.values):
            value_str = str(value)
            if "[Product card]" in value_str:
                ws1.write(0, col_num, value, fmt_header_card)
            elif "[Video]" in value_str:
                ws1.write(0, col_num, value, fmt_header_vid)
            elif "[Overall]" in value_str:
                ws1.write(0, col_num, value, fmt_header_ovr)
            else:
                ws1.write(0, col_num, value, fmt_header_base)

        ws2 = workbook.add_worksheet("Top 10 Revenue")
        writer.sheets["Top 10 Revenue"] = ws2

        ws2.write_string(0, 0, "Top 10 by Product Card Revenue", fmt_section)
        top_card.to_excel(writer, sheet_name="Top 10 Revenue", startrow=1, index=False)

        row_offset_video = len(top_card) + 4
        ws2.write_string(row_offset_video - 1, 0, "Top 10 by Video Revenue", fmt_section)
        top_video.to_excel(writer, sheet_name="Top 10 Revenue", startrow=row_offset_video, index=False)

        row_offset_overall = row_offset_video + len(top_video) + 4
        ws2.write_string(row_offset_overall - 1, 0, "Top 10 by Overall Revenue", fmt_section)
        top_overall.to_excel(writer, sheet_name="Top 10 Revenue", startrow=row_offset_overall, index=False)

        active_zero.to_excel(writer, sheet_name="Active Zero Revenue", index=False)
        excluded_zero.to_excel(writer, sheet_name="Excluded Zero Revenue", index=False)

        auto_fit_columns(writer, {
            summary_sheet_name: summary_df,
            "Active Zero Revenue": active_zero,
            "Excluded Zero Revenue": excluded_zero
        })
        writer.sheets["Top 10 Revenue"].set_column("A:Z", 18)

    output.seek(0)
    return output.read()


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def process_tiktok_ads(files: List[Dict], mode_label: str = MODE_AGGREGATE) -> Dict:
    if mode_label not in [MODE_AGGREGATE, MODE_DAILY]:
        mode_label = MODE_AGGREGATE

    frames = []
    for f in files:
        raw_bytes = base64.b64decode(f["content_b64"])
        frames.append(read_and_transform_single_file(raw_bytes, f["filename"], mode_label))

    df = pd.concat(frames, ignore_index=True)

    summary_df = build_summary_sheet(df, mode_label)
    top_card, top_video, top_overall = build_top10_sheet(df)
    active_zero, excluded_zero = build_zero_revenue_sheets(df, mode_label)

    if mode_label == MODE_DAILY:
        summary_df_export = convert_ratio_cols_to_text_for_daily(summary_df)
        top_card_export = convert_ratio_cols_to_text_for_daily(top_card)
        top_video_export = convert_ratio_cols_to_text_for_daily(top_video)
        top_overall_export = convert_ratio_cols_to_text_for_daily(top_overall)
    else:
        summary_df_export = summary_df
        top_card_export = top_card
        top_video_export = top_video
        top_overall_export = top_overall

    excel_bytes = generate_excel_file(
        summary_df_export,
        top_card_export,
        top_video_export,
        top_overall_export,
        active_zero,
        excluded_zero,
        mode_label,
    )
    file_name = build_export_filename(mode_label, [f["filename"] for f in files])

    def to_preview(dfs: pd.DataFrame) -> dict:
        if dfs is None or dfs.empty:
            return {"columns": [], "rows": []}
        safe_df = dfs.copy()
        safe_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        safe_df.fillna("-", inplace=True)
        return {"columns": list(safe_df.columns), "rows": safe_df.astype(str).to_dict(orient="records")}

    return {
        "summary": to_preview(summary_df),
        "top_card": to_preview(top_card),
        "top_video": to_preview(top_video),
        "top_overall": to_preview(top_overall),
        "active_zero": to_preview(active_zero),
        "excluded_zero": to_preview(excluded_zero),
        "mode": mode_label,
        "file_name": file_name,
        "file_base64": _b64(excel_bytes),
        "rowsProcessed": int(len(df)),
    }
