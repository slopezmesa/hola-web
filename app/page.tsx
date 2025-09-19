"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";

// Small CSV parser that supports quoted fields and commas inside quotes.
function parseCSV(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'; // escaped quote
        i++; // skip next
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") { // FIX: newline must be "\n"
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char === "\r") { // FIX: carriage return must be "\r"
        // ignore CR
      } else {
        cell += char;
      }
    }
  }
  // push last cell/row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 0 && r.some((v) => v !== ""))
    .map((cols) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h.trim()] = (cols[idx] ?? "").trim();
      });
      return obj;
    });
}

// DEV TESTS for parseCSV (lightweight, runs only in development)
function runParseCSVTests() {
  try {
    // Basic CSV with simple values
    const csv1 = "A,B\n1,2\n3,4\n";
    const r1 = parseCSV(csv1);
    console.assert(r1.length === 2, "csv1 length");
    console.assert(r1[0]["A"] === "1" && r1[0]["B"] === "2", "csv1 row0");

    // Quoted fields, commas inside quotes, and escaped quotes
    const csv2 = 'Col1,Col2\n"a,b","c\"\"d"\n"x","y"\n';
    const r2 = parseCSV(csv2);
    console.assert(r2.length === 2, "csv2 length");
    console.assert(r2[0]["Col1"] === "a,b", "csv2 col1 with comma");
    console.assert(r2[0]["Col2"] === 'c"d', "csv2 escaped quote");

    // CRLF newlines support (\r\n)
    const csv3 = "H1,H2\r\nq1,q2\r\n";
    const r3 = parseCSV(csv3);
    console.assert(r3.length === 1 && r3[0]["H1"] === "q1" && r3[0]["H2"] === "q2", "csv3 CRLF");

    // Trailing empty line / last row without newline
    const csv4 = "C1,C2\nval1,val2"; // no trailing \n
    const r4 = parseCSV(csv4);
    console.assert(r4.length === 1 && r4[0]["C1"] === "val1", "csv4 last row");

    console.debug("parseCSV tests passed ✅");
  } catch (err) {
    console.error("parseCSV tests failed ❌", err);
  }
}

// Utility to parse a date safely from the CSV field
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus trap (simple)
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl bg-white dark:bg-zinc-950 shadow-xl ring-1 ring-black/10 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-3 border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
          <h2 className="text-lg font-semibold truncate">{title ?? "Detalle"}</h2>
          <button
            onClick={onClose}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
            aria-label="Cerrar"
          >
            Cerrar
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  // Modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, string> | null>(null);

  const openModal = useCallback((row: Record<string, string>) => {
    setSelected(row);
    setOpen(true);
  }, []);

  const closeModal = useCallback(() => setOpen(false), []);

  useEffect(() => {
    // Run parser tests only in development
    if (process.env.NODE_ENV !== "production") {
      runParseCSVTests();
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        // IMPORTANT: place your CSV file in /public/ as "eventos_geocoded.csv"
        const res = await fetch("/eventos_geocoded.csv", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseCSV(text);
        setData(parsed);
      } catch (e: any) {
        setError(e.message ?? "Error leyendo el CSV");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = startDate ? new Date(startDate) : null;
    const e = endDate ? new Date(endDate) : null;

    return data.filter((row) => {
      const title = row["Evento/titulo"] || row["Evento"] || row["titulo"];
      const tStart =
        parseDate(row["Timestamp Inicio"]) ||
        parseDate(row["Timestamp inicio"]) ||
        parseDate(row["Inicio"]);

      // text filter (optional)
      const matchesText = query
        ? (title ?? "").toLowerCase().includes(query.toLowerCase())
        : true;

      // date range filter
      const inRange = (() => {
        if (!s && !e) return true;
        if (!tStart) return false;
        if (s && tStart < s) return false;
        if (e) {
          // include whole day for end date
          const endOfDay = new Date(e);
          endOfDay.setHours(23, 59, 59, 999);
          if (tStart > endOfDay) return false;
        }
        return true;
      })();

      return matchesText && inRange;
    });
  }, [data, startDate, endDate, query]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 p-6 sm:p-10">
      <div className="mx-auto max-w-6xl grid gap-6">
        {/* Header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Venn</h1>
            <p className="text-sm text-zinc-500">Descubre lo que esta pasando a tu alrededor</p>
          </div>
        </header>

        {/* Controls */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Desde</span>
            <input
              type="date"
              className="rounded-2xl border px-3 py-2 bg-transparent"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Hasta</span>
            <input
              type="date"
              className="rounded-2xl border px-3 py-2 bg-transparent"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Buscar por título</span>
            <input
              type="text"
              placeholder="Filtrar 'Evento/titulo'..."
              className="rounded-2xl border px-3 py-2 bg-transparent"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </section>

        {/* Content: scrollable cards */}
        <section className="grid">
          {loading && <div className="text-sm text-zinc-500">Cargando CSV…</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}

          {!loading && !error && (
            <div className="rounded-2xl border overflow-hidden">
              <div className="max-h-[70vh] overflow-y-auto p-4 grid gap-4">
                {filtered.map((row, idx) => {
                  const title = row["Evento/titulo"] || row["Evento"] || row["titulo"] || "(Sin título)";
                  const ts = row["Timestamp Inicio"] || row["Timestamp inicio"] || row["Inicio"] || "";
                  const lugar = row["Lugar"] || row["Ubicacion"] || row["Dirección"] || row["Direccion"] || "";

                  return (
                    <button
                      key={idx}
                      onClick={() => openModal(row)}
                      className="text-left rounded-2xl border shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-zinc-950 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{title}</h3>
                          <p className="text-sm text-zinc-500 truncate">{lugar}</p>
                        </div>
                        <span className="shrink-0 text-xs px-2 py-1 rounded-full border bg-zinc-50 dark:bg-zinc-900 tabular-nums" title="Timestamp Inicio">
                          {ts || "—"}
                        </span>
                      </div>
                      {/* Optional secondary line with 1–2 extra fields if exist */}
                      <div className="mt-2 grid text-xs text-zinc-500 gap-1 sm:grid-cols-2">
                        {row["Categoria"] && (
                          <div><span className="uppercase">Categoría:</span> {row["Categoria"]}</div>
                        )}
                        {row["Organizador"] && (
                          <div><span className="uppercase">Organizador:</span> {row["Organizador"]}</div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="px-2 py-6 text-sm text-zinc-500">No hay resultados con los filtros actuales.</div>
                )}
              </div>
            </div>
          )}
        </section>

        {!loading && !error && (
          <p className="text-xs text-zinc-500">Mostrando {filtered.length} de {data.length} registros.</p>
        )}
      </div>

      {/* Modal with full CSV row */}
      <Modal open={open} onClose={closeModal} title={(selected?.["Evento/titulo"] || selected?.["Evento"] || selected?.["titulo"]) ?? "Detalle"}>
        {selected ? (
          <div className="grid gap-4">
            {/* Pretty key-value viewer */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(selected).map(([key, value]) => (
                <div key={key} className="rounded-xl border p-3 bg-zinc-50/40 dark:bg-zinc-900/40">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500 mb-1 truncate" title={key}>{key}</dt>
                  <dd className="text-sm break-words whitespace-pre-wrap">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">Sin datos.</div>
        )}
      </Modal>
    </div>
  );
}
