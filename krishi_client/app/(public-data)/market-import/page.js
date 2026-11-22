"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, FileSpreadsheet, FileText, ShieldCheck, UploadCloud } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext.js";
import { commitMarketPriceImport, fetchMarketPriceDataStatus, previewMarketCsvUpload, previewMarketPdfUpload } from "@/services/api.js";

const OFFICIAL_REPORT = "https://market.dam.gov.bd/market_daily_price_report/?L=E";
const CSV_TEMPLATE = "date,commodity,division,district,upazila,market,priceType,frequency,unit,priceMin,priceMax\n";
const CSV_TEMPLATE_URL = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

export default function MarketImportPage() {
  const { user, isLoading } = useAuth();
  const [csvFile, setCsvFile] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfSource, setPdfSource] = useState(OFFICIAL_REPORT);
  const [source, setSource] = useState("DAM official daily report");
  const [frequency, setFrequency] = useState("daily");
  const [preview, setPreview] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [humanVerified, setHumanVerified] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError("");
    try {
      const result = await fetchMarketPriceDataStatus();
      if (result.success) setStatus(result.data);
      else setStatusError("Import history is unavailable. Retry to check the server.");
    } catch {
      setStatusError("Import history is unavailable. Check the connection and retry.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") return undefined;
    const timer = window.setTimeout(() => { void loadStatus(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus, user?.role]);

  const handlePdfPreview = async () => {
    if (!pdfFile) return;
    setBusy(true); setError(""); setNotice("");
    const result = await previewMarketPdfUpload(pdfFile, pdfSource);
    if (result.success) { setEvidence(result.data); setNotice(`PDF text extracted: ${result.data.pageCount} page(s). Check its report date and rows, then upload a structured CSV to import.`); }
    else setError(result.error?.message || "Could not read this PDF report.");
    setBusy(false);
  };

  const handleCsvPreview = async () => {
    if (!csvFile) return;
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    const result = await previewMarketCsvUpload(csvFile);
    if (result.success) { setPreview(result.data); setFrequency(result.data.frequency); setNotice(`${result.data.previewCount} rows parsed. Values remain review-only until you verify them.`); }
    else setError(result.error?.message || "Could not parse this CSV.");
    setBusy(false);
  };

  const handleImport = async () => {
    if (!preview?.records?.length || !humanVerified || busy) return;
    setBusy(true); setError(""); setNotice("");
    const result = await commitMarketPriceImport({
      records: preview.records.map((row) => ({ ...row, frequency })),
      source, sourceUrl: pdfSource, sourceDocumentId: evidence?.documentId || null,
      humanVerified,
    });
    if (result.success) {
      setNotice(`${result.data.submittedRecords} ${result.data.frequency} records imported as ${result.data.qualityStatus}. Last successful sync: ${new Date(result.data.lastSuccessfulSyncAt).toLocaleString()}.`);
      setPreview(null); setCsvFile(null); setHumanVerified(false);
      await loadStatus();
    } else setError(result.error?.message || "Could not import these records.");
    setBusy(false);
  };

  if (isLoading) return <main className="mx-auto max-w-5xl px-4 py-12 text-sm text-muted">Loading administrator permissions…</main>;
  if (user?.role !== "admin") return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-3xl border border-line bg-surface p-8"><h1 className="text-2xl font-bold text-content">Administrator access required</h1><p className="mt-3 text-muted">This page is for authorized market-data administrators. Sign in with an administrator account to import official reports.</p></div></main>;

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
    <header className="rounded-3xl bg-[#eee7d8] p-6 text-[#173B2A] sm:p-9">
      <div className="flex items-center gap-2 text-sm font-bold text-[#9a6226]"><ShieldCheck size={17}/> KrishiBondhu · Admin</div>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Import official market data</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526761]">DAM publishes a filterable daily report with print/PDF controls, but no documented public data API was found. Upload an official report as evidence, then import its structured CSV rows. The app will not scrape the report page or invent missing locations.</p>
      <a className="mt-4 inline-flex items-center gap-1 text-sm font-bold underline" href={OFFICIAL_REPORT} target="_blank" rel="noreferrer">Open official DAM report <ArrowUpRight size={15}/></a>
    </header>

    <section aria-labelledby="imports-heading" className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="imports-heading" className="font-bold text-content">Last successful imports</h2><button type="button" onClick={loadStatus} disabled={statusLoading} className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-content hover:bg-surface-2 disabled:opacity-60">{statusLoading ? "Checking…" : "Refresh history"}</button></div>
      {statusError ? <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/25 dark:text-amber-200">{statusError}</p> : statusLoading && !status ? <p role="status" className="mt-3 text-sm text-muted">Loading verified import history…</p> : status?.syncs?.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{status.syncs.map((item) => <div className="rounded-xl bg-canvas px-4 py-3 text-sm" key={`${item.frequency}-${item.lastSuccessfulSyncAt}`}><strong className="text-content">{item.frequency}</strong><p className="mt-1 text-muted">{new Date(item.lastSuccessfulSyncAt).toLocaleString()} · {item.verifiedRecords} verified / {item.importedRecords} submitted</p></div>)}</div> : <p className="mt-3 text-sm text-muted">No successful DAM admin import has been recorded yet.</p>}
    </section>

    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[#247A4B]"><FileText size={19}/><h2 className="text-lg font-bold text-content">1. Attach official PDF evidence</h2></div>
        <p className="mt-2 text-sm leading-6 text-muted">PDF text is extracted for review and stored with the import. Table rows still need a structured CSV so market, date, commodity, price type, unit, and range stay explicit.</p>
        <label className="mt-4 block text-sm font-semibold text-content">Official source URL<input value={pdfSource} onChange={(event) => setPdfSource(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal"/></label>
        <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-[#b9cbbf] bg-canvas p-4 text-sm"><span className="flex items-center gap-2 font-semibold text-content"><UploadCloud size={17}/>{pdfFile?.name || "Choose DAM report PDF (12 MiB max)"}</span><input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => { setPdfFile(event.target.files?.[0] || null); setEvidence(null); }}/></label>
        <button type="button" disabled={!pdfFile || busy} onClick={handlePdfPreview} className="mt-3 rounded-xl bg-[#247A4B] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Extract PDF text</button>
        {evidence ? <details className="mt-4 rounded-xl bg-canvas p-3"><summary className="cursor-pointer text-sm font-semibold text-content">Review extracted text · {evidence.reportDate ? new Date(evidence.reportDate).toLocaleDateString() : "report date not detected"}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted">{evidence.extractedText}</pre></details> : null}
      </article>

      <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[#247A4B]"><FileSpreadsheet size={19}/><h2 className="text-lg font-bold text-content">2. Preview structured CSV rows</h2></div>
        <p className="mt-2 text-sm leading-6 text-muted">Required headers: date, commodity, division, district, market, priceType, unit, priceMin, priceMax. One row per market, date, crop, and price type. If the PDF has no selectable table, transcribe it into the template before importing.</p>
        <a href={CSV_TEMPLATE_URL} download="dam-market-import-template.csv" className="mt-3 inline-flex rounded-lg border border-[#b9cbbf] px-3 py-2 text-xs font-bold text-[#247A4B]">Download blank CSV template</a>
        <label className="mt-4 block text-sm font-semibold text-content">Source name<input value={source} onChange={(event) => setSource(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal"/></label>
        <label className="mt-4 block text-sm font-semibold text-content">Dataset frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-[#b9cbbf] bg-canvas p-4 text-sm"><span className="flex items-center gap-2 font-semibold text-content"><UploadCloud size={17}/>{csvFile?.name || "Choose structured CSV"}</span><input className="sr-only" type="file" accept="text/csv,.csv" onChange={(event) => { setCsvFile(event.target.files?.[0] || null); setPreview(null); }}/></label>
        <button type="button" disabled={!csvFile || busy} onClick={handleCsvPreview} className="mt-3 rounded-xl border border-[#0d6865] px-4 py-2.5 text-sm font-bold text-[#247A4B] disabled:opacity-50">Preview CSV</button>
        {preview ? <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-xs"><thead className="bg-canvas text-muted"><tr>{["Date", "Crop", "Division", "Market", "Type", "Range"].map((heading) => <th className="p-2" key={heading}>{heading}</th>)}</tr></thead><tbody>{preview.records.slice(0, 8).map((row, index) => <tr className="border-t border-line text-content" key={`${row.date}-${row.commodity}-${index}`}><td className="p-2">{row.date}</td><td className="p-2">{row.commodity}</td><td className="p-2">{row.division}</td><td className="p-2">{row.market || "—"}</td><td className="p-2">{row.priceType}</td><td className="p-2">{row.priceMin}–{row.priceMax} {row.unit}</td></tr>)}</tbody></table><p className="p-2 text-xs text-muted">{preview.previewCount} total rows · {frequency}</p></div> : null}
        {preview ? <label className="mt-4 flex items-start gap-2 text-sm text-content"><input type="checkbox" checked={humanVerified} onChange={(event) => setHumanVerified(event.target.checked)} className="mt-1 accent-[#247A4B]"/><span>I checked each row against the official DAM report, including date, market, crop, type, unit, and price range. Verified rows become visible to farmers and forecasting.</span></label> : null}
        {preview ? <button type="button" disabled={busy || !humanVerified} onClick={handleImport} className="mt-4 min-h-11 rounded-xl bg-[#247A4B] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Importing…" : `Import ${preview.previewCount} ${frequency} rows`}</button> : null}
      </article>
    </section>
    {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p> : null}
  </main>;
}
