import BrandLogo from "@/components/BrandLogo";
import PatientDirectory, { type PatientSummary } from "@/components/PatientDirectory";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  X,
  Brain,
  Heart,
  Link2,
  RefreshCw,
  Thermometer,
  Watch,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { axiosInstance as api } from "@/lib/axios";
import { useAuthStore } from "@/store/useAuthStore";
import ThemeToggle from "@/components/ThemeToggle";

type Patient = PatientSummary;
type Assignment = {
  _id: string;
  patientId: string;
  studyId: string;
  from: number;
  to: number | null;
};
type Device = {
  deviceId: string;
  label: string;
  lastSeen?: number;
  studyIds: string[];
  assignments: Assignment[];
};
type Payload = {
  session_id?: string;
  task?: string;
  accuracy?: number;
  median_rt_ms?: number | null;
  rt_sd_ms?: number | null;
  omissions?: number;
  commissions?: number;
  trials?: number;
  outcome?: string;
  prompt_id?: number;
  trial_index?: number;
  expected?: string;
  response?: string | null;
  correct?: boolean;
  rt_ms?: number | null;
};
type Event = {
  event_id: string;
  ts_ms: number;
  type: string;
  device_id: string;
  study_id: string;
  payload: Payload;
};
type Metric = {
  value: number;
  ts_ms: number;
  source: string;
  device_id: string;
};
type Prediction = {
  status: string;
  reason?: string;
  probability?: number;
  target?: string;
  horizon_hours?: number;
  model_version?: string;
};
type Assessment = {
  _id: string;
  ts_ms: number;
  instrument: string;
  score: number | null;
  delirium: string;
  notes: string;
};
type Overview = {
  as_of_ms: number;
  latest: Record<string, Metric>;
  series: Array<Record<string, number | null>>;
  truncated: boolean;
  features: {
    quality: {
      event_count: number;
      movement_coverage: number;
      heart_rate_minute_coverage: number;
      missing_features: string[];
    };
  };
  prediction: Prediction;
  assessments: Assessment[];
};
const date = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "Never");
const value = (n?: number | null, digits = 1) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";
const pct = (n?: number | null) =>
  typeof n === "number" ? `${(n * 100).toFixed(0)}%` : "—";
const errorMessage = (e: unknown) => {
  const error = e as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return error.response?.data?.message || error.message || "Request failed";
};
const input = "sam-input";
const button = "sam-button";
const secondary = "sam-secondary";
const panel = "rounded-md border bg-card p-5";
function localTime() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function Chart({
  data,
  metric,
  label,
  unit,
}: {
  data: Overview["series"];
  metric: string;
  label: string;
  unit: string;
}) {
  const populated = data.some(
    (row) => row[metric] !== null && row[metric] !== undefined,
  );
  return (
    <section className={panel}>
      <h3 className="mb-4 font-semibold">
        {label}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          5 minute means · {unit}
        </span>
      </h3>
      {populated ? (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="ts_ms"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(n) =>
                  new Date(n).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                minTickGap={45}
              />
              <YAxis domain={["auto", "auto"]} width={48} />
              <Tooltip
                labelFormatter={(n) => date(Number(n))}
                formatter={(n) => [value(Number(n), 2), unit]}
              />
              <Line
                type="linear"
                dataKey={metric}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          No recorded {label.toLowerCase()} in the past 24 hours
        </div>
      )}
    </section>
  );
}
export default function Index() {
  const { authUser, logout } = useAuthStore();
  const [patients, setPatients] = useState<Patient[]>([]),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [patientCount, setPatientCount] = useState(0);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]),
    [data, setData] = useState<Overview | null>(null),
    [cognition, setCognition] = useState<Event[]>([]),
    [cognitionTruncated, setCognitionTruncated] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [newPatient, setNewPatient] = useState(false),
    [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [age, setAge] = useState(""),
    [gender, setGender] = useState(""),
    [room, setRoom] = useState("");
  const [chosenDevice, setChosenDevice] = useState(""),
    [study, setStudy] = useState(""),
    [buffered, setBuffered] = useState(false),
    [deviceId, setDeviceId] = useState(""),
    [deviceLabel, setDeviceLabel] = useState(""),
    [token, setToken] = useState("");
  const [session, setSession] = useState(""),
    [trials, setTrials] = useState<Event[]>([]),
    [trialsLoading, setTrialsLoading] = useState(false),
    [trialsError, setTrialsError] = useState("");
  const [assessmentTime, setAssessmentTime] = useState(localTime()),
    [instrument, setInstrument] = useState("4AT"),
    [score, setScore] = useState(""),
    [clinicalState, setClinicalState] = useState("uncertain"),
    [notes, setNotes] = useState("");
  const patientRequest = useRef(0),
    trialRequest = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const loadPatients = useCallback(async () => {
    const request = ++patientRequest.current;
    setPatientsLoading(true);
    try {
      const response = await api.get("/patients", {
        params: { search, page, limit: 100 },
      });
      if (request !== patientRequest.current) return;
      setPatients(response.data.patients);
      setPatientCount(response.data.totalPatients);
      const lastPage = Math.max(1, response.data.totalPages || 1);
      setPages(lastPage);
      if (page > lastPage) setPage(lastPage);
    } finally {
      if (request === patientRequest.current) setPatientsLoading(false);
    }
  }, [search, page]);
  const invalidatePatientRequests = useCallback(() => {
    patientRequest.current++;
  }, []);
  useEffect(() => {
    setPatientsLoading(true);
    const timer = setTimeout(() => {
      loadPatients().catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => {
      clearTimeout(timer);
      invalidatePatientRequests();
    };
  }, [loadPatients, invalidatePatientRequests]);
  const refresh = useCallback(async () => {
    const id = selected;
    const response = await api.get("/research/devices");
    setDevices(response.data.devices);
    if (!id) return;
    const [overview, cognitive] = await Promise.all([
      api.get(`/research/patients/${id}/overview`),
      api.get(`/research/patients/${id}/cognition`),
    ]);
    if (selectedRef.current !== id) return;
    setData(overview.data);
    setCognition(cognitive.data.events);
    setCognitionTruncated(cognitive.data.truncated);
  }, [selected]);
  useEffect(() => {
    trialRequest.current++;
    setData(null);
    setCognition([]);
    setSession("");
    setTrials([]);
    setChosenDevice("");
    setBuffered(false);
    setToken("");
    setStudy("");
    setScore("");
    setNotes("");
    setClinicalState("uncertain");
    setAssessmentTime(localTime());
    let active = true,
      running = false;
    const poll = async () => {
      if (!active || running) return;
      running = true;
      try {
        await refresh();
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function savePatient(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      const body = {
        name,
        age: age === "" ? undefined : Number(age),
        gender: gender || undefined,
        room,
      };
      const response = editing
        ? await api.put(`/patients/${selected}`, body)
        : await api.post("/patients", body);
      patientRequest.current++;
      setActivePatient(response.data);
      setPatients((current) => [
        ...current.filter((p) => p._id !== response.data._id),
        response.data,
      ]);
      setSelected(response.data._id);
      setNewPatient(false);
      setEditing(false);
      setMessage(editing ? "Patient details updated." : "Patient created. Link a device to start collecting measurements.");
      void loadPatients().catch(() => setError("Patient saved, but the directory could not refresh. Try again."));
      window.scrollTo({ top: 0 });
    });
  }
  async function showTrials(row: Event) {
    const request = ++trialRequest.current;
    const id = selected,
      key = `${row.device_id}/${row.study_id}/${row.payload.session_id}`;
    setSession(key);
    setTrials([]);
    setTrialsError("");
    setTrialsLoading(true);
    try {
      const response = await api.get(
        `/research/patients/${id}/cognition/${encodeURIComponent(row.payload.session_id || "")}/trials`,
      );
      if (selectedRef.current !== id || trialRequest.current !== request)
        return;
      setTrials(
        response.data.events.filter(
          (e: Event) =>
            e.device_id === row.device_id && e.study_id === row.study_id,
        ),
      );
      if (response.data.truncated)
        setTrialsError(
          "Session exceeds the trial limit; use the event export for all trials.",
        );
    } catch (e) {
      if (trialRequest.current === request) setTrialsError(errorMessage(e));
    } finally {
      if (trialRequest.current === request) setTrialsLoading(false);
    }
  }
  function showHome() {
    if (busy) return;
    setSelected("");
    setActivePatient(null);
    setNewPatient(false);
    setEditing(false);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0 });
  }
  function openPatient(patient: Patient) {
    if (busy) return;
    setData(null);
    setCognition([]);
    setSelected(patient._id);
    setActivePatient(patient);
    setNewPatient(false);
    setEditing(false);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0 });
  }
  function createPatient() {
    if (busy) return;
    setSelected("");
    setActivePatient(null);
    setNewPatient(true);
    setEditing(false);
    setName("");
    setAge("");
    setRoom("");
    setGender("");
    setError("");
    setMessage("");
    window.scrollTo({ top: 0 });
  }
  const linked = devices.filter((d) =>
    d.assignments.some((a) => a.patientId === selected && a.to === null),
  );
  const summaries = cognition.filter((e) => e.type === "cognition_summary");
  const outcomes = cognition.filter(
    (e) => e.type === "cognition_prompt_outcome",
  );
  const now = Date.now(),
    exportUrl = `${api.defaults.baseURL}/research/patients/${selected}/export?from=${now - 7 * 86400000}&to=${now}`;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-1.5 sm:px-6">
        <button disabled={busy} onClick={showHome} aria-label="Patient home" className="flex items-center gap-2 text-left">
          <BrandLogo className="w-16 sm:w-20" />
          <div>
            <h1 className="text-base font-semibold">SAM</h1>
            <p className="text-xs text-muted-foreground">
              Patient monitoring
            </p>
          </div>
        </button>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{authUser?.fullName}</span>
          <ThemeToggle />
          <button className={secondary} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <div className={`mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8 ${activePatient && !newPatient ? "grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]" : ""}`}>
        {activePatient && !newPatient && (
          <aside className="h-fit lg:sticky lg:top-6">
            <button disabled={busy} className="sam-secondary w-full justify-start" onClick={showHome}>
              <ArrowLeft size={16} /> All patients
            </button>
            <div className="my-5 border-b pb-5">
              <p className="text-sm font-semibold">{activePatient.fullName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{activePatient.room ? `Room ${activePatient.room}` : "Room not recorded"}</p>
            </div>
            <nav aria-label="Patient sections" className="flex flex-wrap gap-1 lg:flex-col">
              {[
                ["overview", "Measurements"],
                ["devices", "Device links"],
                ["cognition", "Cognition tests"],
                ["assessments", "Clinical assessments"],
                ["export", "Export data"],
              ].map(([id, label]) => (
                <a key={id} href={`#${id}`} className="rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>
              ))}
            </nav>
          </aside>
        )}
        <main className="min-w-0 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-sm border-l-2 border-red-600 bg-card px-4 py-3 text-sm"
            >
              {error}{" "}
              <button
                className="ml-3 underline"
                onClick={() => void action(async () => { await loadPatients(); await refresh(); })}
              >
                Retry
              </button>
            </div>
          )}
          {message && (
            <div
              role="status"
              className="flex items-start justify-between gap-3 rounded-sm border-l-2 border-primary bg-card px-4 py-3 text-sm"
            >
              <span>{message}</span>
              <button aria-label="Dismiss message" onClick={() => setMessage("")}><X size={16} /></button>
            </div>
          )}
          {!activePatient && !newPatient && (
            <PatientDirectory
              patients={patients}
              total={patientCount}
              loading={patientsLoading}
              search={search}
              page={page}
              pages={pages}
              onSearch={(value) => { setSearch(value); setPage(1); }}
              onPage={setPage}
              onOpen={openPatient}
              onCreate={createPatient}
              deviceLabels={(id) => devices.filter((d) => d.assignments.some((a) => a.patientId === id && a.to === null)).map((d) => d.label || d.deviceId)}
            />
          )}
          {newPatient && (
            <section className="mx-auto max-w-3xl space-y-5">
              <button disabled={busy} className="sam-secondary" onClick={() => setNewPatient(false)}>
                <ArrowLeft size={16} /> {editing ? "Back to patient" : "All patients"}
              </button>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{editing ? "Edit patient" : "Add a patient"}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{editing ? "Update the details for this patient." : "Create the patient record first. You can link a watch from their workspace afterward."}</p>
              </div>
              <form onSubmit={savePatient} className={panel}>
              <h3 className="mb-5 border-b pb-3 text-sm font-medium">Patient details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Patient name
                  <input
                    required
                    autoFocus
                    autoComplete="off"
                    maxLength={200}
                    className={input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Age (optional)
                  <input
                    type="number"
                    min={0}
                    max={130}
                    className={input}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Gender
                  <select
                    className={input}
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Not recorded</option>
                    {["Other", "Female", "Male"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Room
                  <input
                    className={input}
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button disabled={busy} className={button}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Create patient"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={secondary}
                  onClick={() => setNewPatient(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
            </section>
          )}
          {activePatient && !newPatient && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {activePatient.fullName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activePatient.room ? `Room ${activePatient.room} · ` : ""}
                    {linked.length} linked device
                    {linked.length !== 1 ? "s" : ""} · Last 24 hours
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    className={secondary}
                    onClick={() => {
                      setEditing(true);
                      setNewPatient(true);
                      setName(activePatient.fullName);
                      setAge(String(activePatient.age ?? ""));
                      setRoom(activePatient.room || "");
                      setGender(activePatient.gender || "");
                    }}
                  >
                    Edit patient
                  </button>
                  <button
                    disabled={busy}
                    className={secondary}
                    onClick={() => void action(refresh)}
                  >
                    <RefreshCw size={16} className="inline mr-2" />
                    Refresh
                  </button>
                  <button disabled={busy} className={secondary} onClick={showHome}>
                    <X size={16} /> Close patient
                  </button>
                </div>
              </div>
              {!data && (
                <p id="overview" className="text-sm text-muted-foreground">
                  Loading recorded data…
                </p>
              )}
              {data && (
                <>
                  {data.truncated && (
                    <p
                      role="alert"
                      className="rounded-md border border-amber-500 p-3 text-sm"
                    >
                      The event limit was reached. This view is partial;
                      prediction is disabled. Export events for complete data.
                    </p>
                  )}
                  <div id="overview" className="grid gap-0 overflow-hidden rounded-md border bg-card sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        key: "heart_rate_bpm",
                        title: "Heart rate",
                        unit: "bpm",
                        icon: Heart,
                        digits: 0,
                      },
                      {
                        key: "skin_temperature_c",
                        title: "Skin temperature",
                        unit: "°C",
                        icon: Thermometer,
                        digits: 1,
                      },
                      {
                        key: "movement_rms_ms2",
                        title: "Movement RMS",
                        unit: "m/s²",
                        icon: Activity,
                        digits: 3,
                      },
                      {
                        key: "ppg_valid_fraction",
                        title: "PPG valid samples",
                        unit: "%",
                        icon: Watch,
                        digits: 0,
                      },
                    ].map((m) => {
                      const r = data.latest[m.key];
                      const stale = r && data.as_of_ms - r.ts_ms > 300000;
                      return (
                        <div key={m.key} className="border-b border-r p-5 last:border-r-0 xl:border-b-0">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            {m.title}
                            <m.icon size={18} />
                          </div>
                          <p className="my-3 text-2xl font-semibold tabular-nums">
                            {r
                              ? value(
                                  r.value *
                                    (m.key === "ppg_valid_fraction" ? 100 : 1),
                                  m.digits,
                                )
                              : "—"}{" "}
                            <span className="text-sm font-normal">
                              {r ? m.unit : "No data"}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r
                              ? `${stale ? "Older reading · " : ""}${date(r.ts_ms)}`
                              : "No valid reading in the past 24 hours"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Skin temperature is a peripheral measurement. SpO₂, ECG,
                    blood pressure and respiration are not supplied by this app.
                    Gaps in charts mean no valid samples; no values are filled
                    in.
                  </p>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Chart
                      data={data.series}
                      metric="heart_rate_bpm"
                      label="Heart rate"
                      unit="bpm"
                    />
                    <Chart
                      data={data.series}
                      metric="movement_rms_ms2"
                      label="Movement"
                      unit="m/s²"
                    />
                    <Chart
                      data={data.series}
                      metric="skin_temperature_c"
                      label="Skin temperature"
                      unit="°C"
                    />
                    <section className={panel}>
                      <h3 className="mb-4 font-semibold">
                        Delirium research model
                      </h3>
                      {data.prediction.status === "ok" ? (
                        <>
                          <p className="text-3xl font-semibold">
                            {pct(data.prediction.probability)}
                          </p>
                          <p className="mt-2 text-sm">
                            {data.prediction.target === "incident_delirium"
                              ? `Incident delirium within ${data.prediction.horizon_hours} hours`
                              : "Current delirium classification"}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Model: {data.prediction.model_version}. Research
                            estimate; not a diagnosis.
                          </p>
                        </>
                      ) : (
                        <p className="rounded-md bg-muted p-3 text-sm">
                          Prediction unavailable: {data.prediction.reason}
                        </p>
                      )}
                      <div className="mt-5 space-y-2 text-sm">
                        <p>
                          Recorded events:{" "}
                          {data.features.quality.event_count.toLocaleString()}
                        </p>
                        <p>
                          Movement coverage:{" "}
                          {pct(data.features.quality.movement_coverage)}
                        </p>
                        <p>
                          Heart rate minute coverage:{" "}
                          {pct(
                            data.features.quality.heart_rate_minute_coverage,
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Coverage is recording availability, not a clinical
                          score. The model receives a versioned feature set;
                          missing signals stay null.
                        </p>
                      </div>
                    </section>
                  </div>
                </>
              )}
              <section id="devices" className={panel}>
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <Link2 size={18} /> Patient–device link
                </h3>
                {linked.map((d) => (
                  <div
                    key={d.deviceId}
                    className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-3 text-sm"
                  >
                    <div>
                      <b>{d.label || "Watch"}</b> · <code>{d.deviceId}</code>
                      <br />
                      Study ID:{" "}
                      <code>
                        {d.assignments.find((a) => a.to === null)?.studyId}
                      </code>{" "}
                      · Last measurement: {date(d.lastSeen)}
                    </div>
                    <button
                      disabled={busy}
                      className={secondary}
                      onClick={() =>
                        void action(async () => {
                          await api.delete(
                            `/research/devices/${encodeURIComponent(d.deviceId)}/assignment`,
                          );
                          await refresh();
                          setMessage(
                            "Device unlinked. Historical measurements stay with this patient. Use a fresh study ID for the next patient.",
                          );
                        })
                      }
                    >
                      Unlink
                    </button>
                    <button
                      disabled={busy}
                      className={secondary}
                      onClick={() =>
                        void action(async () => {
                          const r = await api.post(
                            `/research/devices/${encodeURIComponent(d.deviceId)}/token`,
                          );
                          setToken(r.data.token);
                          setMessage(
                            `New upload token for device ${d.deviceId}. Copy it to the phone now; the previous device token is revoked.`,
                          );
                        })
                      }
                    >
                      Issue device token
                    </button>
                  </div>
                ))}
                <p className="mb-3 text-sm text-muted-foreground">
                  Select a watch and enter the same pseudonymous study ID
                  configured on the phone. Stop monitoring before a patient
                  handoff. Each assignment needs a fresh study ID.
                </p>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <select
                    aria-label="Device to link"
                    className={input}
                    value={chosenDevice}
                    onChange={(e) => setChosenDevice(e.target.value)}
                  >
                    <option value="">Select an unlinked device</option>
                    {devices
                      .filter((d) => !d.assignments.some((a) => a.to === null))
                      .map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || "Watch"} · {d.deviceId}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Assignment study ID"
                    className={input}
                    placeholder="Study ID, e.g. DW-001"
                    maxLength={100}
                    value={study}
                    onChange={(e) => setStudy(e.target.value)}
                  />
                  <button
                    disabled={busy || !chosenDevice || !study.trim()}
                    className={button}
                    onClick={() =>
                      void action(async () => {
                        const r = await api.put(
                          `/research/devices/${encodeURIComponent(chosenDevice)}/assignment`,
                          {
                            patientId: selected,
                            studyId: study.trim(),
                            includeBuffered: buffered,
                          },
                        );
                        setChosenDevice("");
                        setStudy("");
                        setBuffered(false);
                        await refresh();
                        setMessage(
                          `Device linked. ${r.data.backfilled} buffered events imported. On the phone, save this study ID and refresh the patient link.`,
                        );
                      })
                    }
                  >
                    Link device
                  </button>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={buffered}
                    onChange={(e) => setBuffered(e.target.checked)}
                  />
                  Also attach existing unassigned events from this device and
                  study ID (only if they belong to this patient)
                </label>
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Register a watch before its first upload
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <input
                      aria-label="Watch device ID"
                      className={input}
                      placeholder="Device ID shown on watch/phone"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                    />
                    <input
                      aria-label="Device label"
                      className={input}
                      placeholder="Optional label, e.g. Watch 1"
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                    />
                    <button
                      disabled={busy || !deviceId.trim()}
                      className={secondary}
                      onClick={() =>
                        void action(async () => {
                          const id = deviceId.trim();
                          await api.post("/research/devices", {
                            deviceId: id,
                            label: deviceLabel,
                          });
                          const r = await api.post(
                            `/research/devices/${encodeURIComponent(id)}/token`,
                          );
                          setToken(r.data.token);
                          await refresh();
                          setMessage(
                            `Device ${id} registered. Copy its token to the phone, then link it above.`,
                          );
                          setDeviceId("");
                          setDeviceLabel("");
                        })
                      }
                    >
                      Register + issue token
                    </button>
                  </div>
                </details>
                {token && (
                  <div className="mt-4 rounded-md border border-amber-500 p-3 text-sm">
                    <p className="mb-2">
                      Device token · shown once · paste into the phone API token
                      field
                    </p>
                    <input
                      aria-label="Issued device token"
                      readOnly
                      className={input + " font-mono"}
                      value={token}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      className="mt-2 underline"
                      onClick={() => setToken("")}
                    >
                      Hide token
                    </button>
                  </div>
                )}
              </section>
              <section id="cognition" className={panel}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Brain size={18} /> Cognition tests
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Attention and one-back task summaries are uploaded
                  automatically. Each row is one task from a session; omissions,
                  incorrect responses and missing reaction times remain
                  distinct.
                </p>
                {cognitionTruncated && (
                  <p className="mb-3 text-sm text-amber-600">
                    Showing the latest 500 summaries/outcomes. Export events for
                    full history.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        {[
                          "Recorded",
                          "Task / session",
                          "Accuracy",
                          "Median RT",
                          "RT SD",
                          "Omissions",
                          "Commissions",
                          "Trials",
                          "",
                        ].map((t, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap p-2 font-medium"
                          >
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((e) => (
                        <tr key={e.event_id} className="border-b">
                          <td className="whitespace-nowrap p-2">
                            {date(e.ts_ms)}
                          </td>
                          <td className="p-2">
                            {e.payload.task === "attention"
                              ? "Attention"
                              : "One-back"}
                            <p className="text-xs text-muted-foreground">
                              {e.device_id} ·{" "}
                              {e.payload.session_id?.slice(0, 8)}
                            </p>
                          </td>
                          <td className="p-2">{pct(e.payload.accuracy)}</td>
                          <td className="p-2">
                            {value(e.payload.median_rt_ms, 0)} ms
                          </td>
                          <td className="p-2">
                            {value(e.payload.rt_sd_ms, 0)} ms
                          </td>
                          <td className="p-2">{e.payload.omissions ?? "—"}</td>
                          <td className="p-2">
                            {e.payload.commissions ?? "—"}
                          </td>
                          <td className="p-2">{e.payload.trials}</td>
                          <td className="p-2">
                            <button
                              className="underline"
                              onClick={() => void showTrials(e)}
                            >
                              View trials
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!summaries.length && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No completed task summaries recorded for this patient.
                    </p>
                  )}
                </div>
                {session && (
                  <div className="mt-4 rounded-md border p-3">
                    <div className="flex justify-between text-sm">
                      <h4 className="font-semibold">
                        Session trials · {session}
                      </h4>
                      <button
                        onClick={() => {
                          trialRequest.current++;
                          setSession("");
                        }}
                      >
                        Close
                      </button>
                    </div>
                    {trialsLoading && (
                      <p className="py-3 text-sm">Loading trials…</p>
                    )}
                    {trialsError && (
                      <p role="alert" className="py-3 text-sm text-red-600">
                        {trialsError}
                      </p>
                    )}
                    <div className="max-h-80 overflow-auto">
                      <table className="mt-3 w-full text-left text-xs">
                        <thead>
                          <tr>
                            {[
                              "Task",
                              "Trial",
                              "Expected",
                              "Response",
                              "Correct",
                              "RT (ms)",
                            ].map((t) => (
                              <th className="p-2" key={t}>
                                {t}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trials.map((e) => (
                            <tr key={e.event_id} className="border-t">
                              <td className="p-2">{e.payload.task}</td>
                              <td className="p-2">{e.payload.trial_index}</td>
                              <td className="p-2">{e.payload.expected}</td>
                              <td className="p-2">
                                {e.payload.response ?? "No response"}
                              </td>
                              <td className="p-2">
                                {e.payload.correct ? "Yes" : "No"}
                              </td>
                              <td className="p-2">
                                {value(e.payload.rt_ms, 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer">
                    Prompt and session outcomes ({outcomes.length})
                  </summary>
                  <div className="mt-3 max-h-64 overflow-auto">
                    {outcomes.map((e) => (
                      <p key={e.event_id} className="border-b py-2">
                        {date(e.ts_ms)} ·{" "}
                        <b>{e.payload.outcome?.replace(/_/g, " ")}</b> ·{" "}
                        {e.device_id} ·{" "}
                        {e.payload.session_id?.slice(0, 8) ||
                          `prompt ${e.payload.prompt_id}`}
                      </p>
                    ))}
                    {!outcomes.length && <p>No prompt outcomes recorded.</p>}
                  </div>
                </details>
              </section>
              <section id="assessments" className={panel}>
                <h3 className="mb-2 font-semibold">
                  Clinical assessments and research labels
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Record an assessment performed by a clinician. Watch cognition
                  tasks are research tasks and do not replace these assessments.
                  A screening score does not automatically set the delirium
                  label.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await api.post(
                        `/research/patients/${selected}/assessments`,
                        {
                          ts_ms: new Date(assessmentTime).getTime(),
                          instrument,
                          score: score.trim() === "" ? null : Number(score),
                          delirium: clinicalState,
                          notes,
                        },
                      );
                      setScore("");
                      setNotes("");
                      await refresh();
                      setMessage("Clinical assessment recorded.");
                    });
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="text-sm">
                      Assessment time
                      <input
                        required
                        type="datetime-local"
                        className={input}
                        value={assessmentTime}
                        onChange={(e) => setAssessmentTime(e.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Instrument
                      <select
                        className={input}
                        value={instrument}
                        onChange={(e) => {
                          setInstrument(e.target.value);
                          setScore("");
                        }}
                      >
                        {["4AT", "CAM", "CAM-ICU", "clinical"].map((i) => (
                          <option key={i}>{i}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Score (optional)
                      <input
                        type="number"
                        min={instrument === "4AT" ? 0 : undefined}
                        max={instrument === "4AT" ? 12 : undefined}
                        step={1}
                        className={input}
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Clinician delirium assessment
                      <select
                        className={input}
                        value={clinicalState}
                        onChange={(e) => setClinicalState(e.target.value)}
                      >
                        {["uncertain", "absent", "present"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-3 block text-sm">
                    Notes
                    <textarea
                      maxLength={2000}
                      className={input}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <button disabled={busy} className={button + " mt-3"}>
                    Record assessment
                  </button>
                </form>
                <div className="mt-4 max-h-64 overflow-auto text-sm">
                  {data?.assessments.map((a) => (
                    <div key={a._id} className="border-t py-3">
                      <b>{date(a.ts_ms)}</b> · {a.instrument}
                      {a.score !== null ? ` ${a.score}` : ""} · Delirium{" "}
                      {a.delirium}
                      <p className="text-muted-foreground">{a.notes}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section
                id="export"
                className={
                  panel + " flex flex-wrap items-center justify-between gap-3"
                }
              >
                <div>
                  <h3 className="font-semibold">Research export</h3>
                  <p className="text-sm text-muted-foreground">
                    Last 7 days · raw events, cognition trials and clinical
                    assessments · NDJSON
                  </p>
                </div>
                <a className={secondary} href={exportUrl}>
                  Download data
                </a>
              </section>
            </>
          )}
          <footer className="py-4 text-xs text-muted-foreground">
            Recorded research data only · Auto-refresh every 15 seconds · No
            clinical thresholds are inferred from watch measurements.
          </footer>
        </main>
      </div>
    </div>
  );
}

