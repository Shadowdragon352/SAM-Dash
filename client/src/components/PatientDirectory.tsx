import { useEffect, useState } from "react";
import { ArrowRight, Heart, LayoutGrid, List, Plus, Search, Thermometer, Activity, Users, Watch } from "lucide-react";
import { axiosInstance as api } from "@/lib/axios";
import { patientStatus, type PatientPrediction } from "@/components/patientStatus";
export type PatientSummary = { _id: string; fullName: string; age?: number; gender?: string; room?: string; condition?: string };
type Snapshot = { latest: Record<string, { value: number; ts_ms: number }>; as_of_ms: number; prediction: PatientPrediction };
type Result = { snapshot?: Snapshot; failed?: boolean };
type Props = {
  patients: PatientSummary[]; total: number; loading: boolean; search: string; page: number; pages: number;
  onSearch: (value: string) => void; onPage: (page: number) => void;
  onOpen: (patient: PatientSummary) => void; onCreate: () => void; deviceLabels: (patientId: string) => string[];
};
const dots: Record<string, string> = { green: "bg-emerald-600", yellow: "bg-amber-500", red: "bg-red-600", grey: "bg-slate-400" };
const rails: Record<string, string> = { green: "border-t-emerald-600", yellow: "border-t-amber-500", red: "border-t-red-600", grey: "border-t-slate-300" };
const metrics = [
  { key: "heart_rate_bpm", label: "Heart rate", unit: "bpm", digits: 0, icon: Heart },
  { key: "skin_temperature_c", label: "Skin temp", unit: "°C", digits: 1, icon: Thermometer },
  { key: "movement_rms_ms2", label: "Movement", unit: "m/s²", digits: 2, icon: Activity },
];
export default function PatientDirectory({ patients, total, loading, search, page, pages, onSearch, onPage, onOpen, onCreate, deviceLabels }: Props) {
  const [mode, setMode] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("sam-patient-view") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const [results, setResults] = useState<Record<string, Result>>({});
  const ids = patients.map((patient) => patient._id).join(",");
  useEffect(() => {
    const controller = new AbortController();
    const patientIds = ids ? ids.split(",") : [];
    let running = false;
    const refresh = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      let next = 0;
      const worker = async () => {
        while (next < patientIds.length && !controller.signal.aborted) {
          const id = patientIds[next++];
          try {
            const response = await api.get(`/research/patients/${id}/overview`, { signal: controller.signal, timeout: 15000 });
            if (!controller.signal.aborted) setResults((current) => ({ ...current, [id]: { snapshot: response.data } }));
          } catch {
            if (!controller.signal.aborted) setResults((current) => ({ ...current, [id]: { snapshot: current[id]?.snapshot, failed: true } }));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, patientIds.length) }, worker));
      running = false;
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [ids]);
  function changeMode(value: "grid" | "list") {
    setMode(value);
    try { localStorage.setItem("sam-patient-view", value); } catch { /* Keep working without storage. */ }
  }
  return <section aria-labelledby="patients-title" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 id="patients-title" className="text-3xl font-semibold tracking-tight">Patients</h2><p className="mt-2 text-sm text-muted-foreground">Your patients, latest measurements and model status in one place.</p></div>
      <button onClick={onCreate} className="sam-button"><Plus size={16} /> Add patient</button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="relative block w-full sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input aria-label="Search patients" type="search" className="sam-input pl-9" placeholder="Search patients by name" value={search} onChange={(e) => onSearch(e.target.value)} /></label>
      <div className="flex items-center gap-4"><p aria-live="polite" className="text-sm text-muted-foreground">{loading ? "Loading…" : `${total} ${search ? "matching " : ""}patient${total === 1 ? "" : "s"}`}</p>
        <div className="inline-flex gap-1 rounded-md border bg-card p-1" role="group" aria-label="Patient view">
          <button className={`rounded-sm p-2 ${mode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted"}`} aria-label="Grid view" aria-pressed={mode === "grid"} onClick={() => changeMode("grid")}><LayoutGrid size={17} /></button>
          <button className={`rounded-sm p-2 ${mode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted"}`} aria-label="List view" aria-pressed={mode === "list"} onClick={() => changeMode("list")}><List size={17} /></button>
        </div>
      </div>
    </div>
    <div aria-busy={loading} className={mode === "grid" ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
      {patients.map((patient) => {
        const result = results[patient._id], snapshot = result?.snapshot;
        const status = patientStatus(snapshot?.prediction, result?.failed), labels = deviceLabels(patient._id);
        const latestTime = snapshot ? Math.max(0, ...Object.values(snapshot.latest).map((metric) => metric.ts_ms)) : 0;
        const initials = patient.fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
        return <button key={patient._id} type="button" aria-label={`Open ${patient.fullName}`} onClick={() => onOpen(patient)} className={`w-full rounded-lg border border-t-[3px] bg-card text-left shadow-sm transition-colors hover:border-x-primary/40 hover:border-b-primary/40 ${rails[status.colour]} ${mode === "grid" ? "p-5" : "flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6"}`}>
          <div className={mode === "list" ? "min-w-0 lg:w-64 lg:shrink-0" : ""}>
            <div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{initials}</span><div className="min-w-0"><h3 className="break-words font-semibold">{patient.fullName}</h3><p className="mt-1 text-xs text-muted-foreground">{patient.room ? `Room ${patient.room}` : "Room not recorded"}{patient.age != null ? ` · ${patient.age} years` : ""}</p></div></div>
            <div title={status.detail} className="mt-3 flex items-center gap-2 text-xs font-medium"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dots[status.colour]}`} />{status.label}</div>
          </div>
          <div className={`grid grid-cols-3 gap-3 ${mode === "grid" ? "my-5 border-y py-4" : "w-full lg:min-w-0 lg:flex-1"}`}>
            {metrics.map((item) => {
              const metric = snapshot?.latest[item.key];
              const valid = metric && Number.isFinite(metric.value), older = valid && Date.now() - metric.ts_ms > 300000;
              return <div key={item.key}><p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><item.icon size={13} />{item.label}</p><p className="text-lg font-semibold tabular-nums">{valid ? metric.value.toFixed(item.digits) : "—"} <span className="text-[11px] font-normal text-muted-foreground">{valid ? item.unit : ""}</span></p><p className="mt-1 text-[10px] text-muted-foreground">{valid ? older ? "Older reading" : "Recent reading" : result?.failed && !snapshot ? "Unavailable" : result ? "No reading" : "Loading…"}</p></div>;
            })}
          </div>
          <div className={`flex items-center justify-between gap-3 ${mode === "list" ? "lg:w-52 lg:shrink-0" : ""}`}><div className="min-w-0 text-xs text-muted-foreground"><p className="flex items-center gap-1.5"><Watch size={13} /><span className="truncate">{labels.length ? labels.join(", ") : "No device linked"}</span></p><p className="mt-1.5">{latestTime ? `Last reading ${new Date(latestTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : result?.failed ? "Summary unavailable" : snapshot ? "No measurements yet" : "Loading measurements…"}</p></div><ArrowRight size={17} className="shrink-0 text-muted-foreground" /></div>
        </button>;
      })}
    </div>
    {!patients.length && <div className="rounded-lg border border-dashed px-6 py-16 text-center"><Users size={28} className="mx-auto mb-4 text-muted-foreground" /><h3 className="font-medium">{loading ? "Loading your patients" : search ? "No matching patients" : "No patients yet"}</h3>{!loading && <><p className="mt-2 text-sm text-muted-foreground">{search ? "Try another name or clear the search." : "Add your first patient, then link their watch."}</p><button className="sam-secondary mt-5" onClick={search ? () => onSearch("") : onCreate}>{search ? "Clear search" : "Add patient"}</button></>}</div>}
    {pages > 1 && <div className="flex items-center justify-between text-sm"><button className="sam-secondary" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span className="text-muted-foreground">Page {page} of {pages}</span><button className="sam-secondary" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Next</button></div>}
    <p className="text-xs text-muted-foreground">Latest recorded readings · Refreshes every 30 seconds · Green without a model is a display default, not an assessment.</p>
  </section>;
}
