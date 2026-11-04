"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { importBatch } from "@/lib/actions/import";
import { guessMapping, IMPORT_FIELDS, mapRow, parseCsv, type ColumnMapping, type ImportFieldKey } from "@/lib/csv";
import { localDate, money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/types";

const BATCH_SIZE = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function ImportView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(null);
    if (file.size > MAX_FILE_BYTES) return setError("That file is larger than 10 MB.");
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setError("That file needs a header row and at least one data row.");
    setFileName(file.name);
    setHeaders(parsed[0].map((h) => h.trim()));
    setRows(parsed.slice(1));
    setMapping(guessMapping(parsed[0]));
  }

  const results = useMemo(() => {
    const today = localDate();
    return rows.map((cells, index) => ({ line: index + 2, result: mapRow(cells, mapping, today) }));
  }, [rows, mapping]);

  const valid = results.flatMap((r) => (r.result.ok ? [r.result.row] : []));
  const invalid = results.flatMap((r) => (r.result.ok ? [] : [{ line: r.line, errors: r.result.errors }]));
  const requiredMapped = mapping.brand !== undefined && mapping.name !== undefined;

  function setField(key: ImportFieldKey, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === "") delete next[key];
      else next[key] = Number(value);
      return next;
    });
  }

  function reset() {
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
  }

  function runImport() {
    setError(null);
    start(async () => {
      let done = 0;
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const res = await importBatch(valid.slice(i, i + BATCH_SIZE));
        if (!res.ok) {
          setError(`Stopped after ${done} of ${valid.length} rows: ${res.error}. The rows already imported remain, so remove them from the file before retrying.`);
          return;
        }
        done += res.data.count;
        setProgress(`Imported ${done} of ${valid.length}…`);
      }
      setProgress(`Imported ${done} ${done === 1 ? "item" : "items"}.${invalid.length ? ` ${invalid.length} skipped.` : ""}`);
      reset();
    });
  }

  if (!fileName) {
    return (
      <div className="flex flex-col gap-2">
        <input ref={inputRef} type="file" accept=".csv,.tsv,text/csv" className="hidden" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>Choose CSV file</Button>
        <p className="text-xs text-muted-foreground">You&apos;ll match columns next and see a preview before anything is saved. An Items export can be imported as it is.</p>
        {progress && <p role="status" className="text-sm">{progress}</p>}
        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm"><span className="font-medium">{fileName}</span> · <span className="num">{rows.length}</span> rows</p>

      <div>
        <h3 className="mb-2 text-sm font-medium">Match your columns</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <li key={field.key} className="flex flex-col gap-1">
              <label htmlFor={`map-${field.key}`} className="text-xs">
                {field.label}{"required" in field && field.required ? " (required)" : ""}
              </label>
              <select id={`map-${field.key}`} className="field text-sm" value={mapping[field.key] ?? ""} onChange={(e) => setField(field.key, e.target.value)}>
                <option value="">Don&apos;t import</option>
                {headers.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>

      {requiredMapped && valid.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Preview</h3>
          <div className="-mx-4 overflow-x-auto md:mx-0">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="eyebrow border-b text-left">
                  <th className="p-2 pl-4 font-normal md:pl-2">Brand</th>
                  <th className="p-2 font-normal">Name</th>
                  <th className="p-2 font-normal">Status</th>
                  <th className="p-2 text-right font-normal">Cost, CHF</th>
                  <th className="p-2 text-right font-normal">Sold for</th>
                </tr>
              </thead>
              <tbody>
                {valid.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 pl-4 md:pl-2">{row.brand}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{STATUS_LABEL[row.status]}</td>
                    <td className="num p-2 text-right">{money(row.buy_price_chf)}</td>
                    <td className="num p-2 text-right">{row.sale ? money(row.sale.sale_price) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {requiredMapped && invalid.length > 0 && (
        <div className="border border-foreground p-3 text-sm">
          <p className="font-medium"><span className="num">{invalid.length}</span> {invalid.length === 1 ? "row" : "rows"} will be skipped</p>
          <ul className="num mt-2 max-h-48 overflow-y-auto text-xs">
            {invalid.slice(0, 50).map((row) => <li key={row.line}>Line {row.line}: {row.errors.join("; ")}</li>)}
          </ul>
        </div>
      )}

      {progress && <p role="status" className="text-sm">{progress}</p>}
      {error && <p role="alert" className="text-sm font-medium">{error}</p>}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button type="button" size="lg" disabled={pending || !requiredMapped || valid.length === 0} onClick={runImport}>
          {pending ? "Importing…" : `Import ${valid.length} ${valid.length === 1 ? "item" : "items"}`}
        </Button>
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={reset}>Cancel</Button>
      </div>
    </div>
  );
}
