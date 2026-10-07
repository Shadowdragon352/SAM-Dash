import BrandLogo from "@/components/BrandLogo";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Brain,
  Heart,
  Link2,
  Plus,
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

type Patient = {
  _id: string;
  fullName: string;
  age?: number;
  gender?: string;
  room?: string;
  condition?: string;
};
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
const input = "w-full rounded-md border bg-background px-3 py-2 text-sm";
const button =
  "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const secondary =
  "rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50";
const panel = "rounded-xl border bg-card p-5 shadow-sm";
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
                stroke="#168c98"
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
  const activePatient = patients.find((p) => p._id === selected);
  const loadPatients = useCallback(async () => {
    const request = ++patientRequest.current;
    const response = await api.get("/patients", {
      params: { search, page, limit: 100 },
    });
    if (request !== patientRequest.current) return;
    setPatients(response.data.patients);
    setPages(response.data.totalPages || 1);
    setSelected((current) =>
      response.data.patients.some((p: Patient) => p._id === current)
        ? current
        : response.data.patients[0]?._id || "",
    );
  }, [search, page]);
  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients().catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [loadPatients]);
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
    setToken("");
    setStudy("");
    setError("");
    let active = true,
      running = false;
    const poll = async () => {
      if (running) return;
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
      setSearch(response.data.fullName);
      setPage(1);
      setPatients((current) => [
        ...current.filter((p) => p._id !== response.data._id),
        response.data,
      ]);
      setSelected(response.data._id);
      setNewPatient(false);
      setEditing(false);
      setMessage(
        "Patient saved. Measurements appear after a device is linked and sends data.",
      );
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
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <BrandLogo className="w-28 sm:w-32" />
          <div>
            <h1 className="text-xl font-semibold">SAM</h1>
            <p className="text-xs text-muted-foreground">
              Patient monitoring · Research workspace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>{authUser?.fullName}</span>
          <ThemeToggle />
          <button className={secondary} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] gap-5 p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-6">
        <aside className={panel + " h-fit"}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Patients</h2>
            <button
              aria-label="Add patient"
              className={secondary}
              onClick={() => {
                setNewPatient(true);
                setEditing(false);
                setName("");
                setAge("");
                setRoom("");
                setGender("");
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <input
            aria-label="Search patients"
            className={input}
            placeholder="Search by name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <nav className="mt-3 max-h-[65vh] space-y-1 overflow-auto">
            {patients.map((p) => (
              <button
                key={p._id}
                className={`w-full rounded-lg p-3 text-left ${selected === p._id ? "bg-teal-700 text-white" : "hover:bg-muted"}`}
                onClick={() => setSelected(p._id)}
              >
                <span className="block font-medium">{p.fullName}</span>
                <span className="text-xs opacity-75">
                  {p.room ? `Room ${p.room}` : "Room not recorded"}
                  {p.age != null ? ` · ${p.age} years` : ""}
                </span>
              </button>
            ))}
            {!patients.length && (
              <p className="py-6 text-sm text-muted-foreground">
                No patients found. Add a patient to begin.
              </p>
            )}
          </nav>
          {pages > 1 && (
            <div className="mt-4 flex justify-between text-xs">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {page}/{pages}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </aside>
        <main className="min-w-0 space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-400 bg-red-500/10 p-4 text-sm"
            >
              {error}{" "}
              <button
                className="ml-3 underline"
                onClick={() => void action(refresh)}
              >
                Retry
              </button>
            </div>
          )}
          {message && (
            <div
              role="status"
              className="rounded-lg border border-teal-600 bg-teal-500/10 p-4 text-sm"
            >
              {message}
            </div>
          )}
          {newPatient && (
            <form onSubmit={savePatient} className={panel}>
              <h2 className="mb-4 font-semibold">
                {editing ? "Edit patient" : "Add patient"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Patient name
                  <input
                    required
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
                  Save patient
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => setNewPatient(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {activePatient && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {activePatient.fullName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activePatient.room ? `Room ${activePatient.room} · ` : ""}
                    {linked.length} linked device
                    {linked.length !== 1 ? "s" : ""} · Last 24 hours
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
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
                </div>
              </div>
              <section className={panel}>
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
              {!data && (
                <p className="text-sm text-muted-foreground">
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
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                        <div key={m.key} className={panel}>
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            {m.title}
                            <m.icon size={18} />
                          </div>
                          <p className="my-3 text-3xl font-semibold">
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
              <section className={panel}>
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
              <section className={panel}>
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
          {!activePatient && !newPatient && (
            <section className={panel}>
              <h2 className="mb-2 text-xl font-semibold">
                Start with a patient
              </h2>
              <p className="text-sm text-muted-foreground">
                Add a patient, register or discover their watch, and link its
                study ID. New patients start with no measurements.
              </p>
              <button
                className={button + " mt-4"}
                onClick={() => {
                  setNewPatient(true);
                  setEditing(false);
                  setName("");
                  setAge("");
                  setRoom("");
                  setGender("");
                }}
              >
                Add patient
              </button>
            </section>
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
