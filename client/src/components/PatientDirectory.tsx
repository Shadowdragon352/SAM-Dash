import { ArrowRight, Plus, Search, Users } from "lucide-react";

export type PatientSummary = {
  _id: string;
  fullName: string;
  age?: number;
  gender?: string;
  room?: string;
  condition?: string;
};

type Props = {
  patients: PatientSummary[];
  total: number;
  loading: boolean;
  search: string;
  page: number;
  pages: number;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
  onOpen: (patient: PatientSummary) => void;
  onCreate: () => void;
  deviceLabels: (patientId: string) => string[];
};

export default function PatientDirectory({
  patients, total, loading, search, page, pages, onSearch, onPage,
  onOpen, onCreate, deviceLabels,
}: Props) {
  return (
    <section aria-labelledby="patients-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Patient directory</p>
          <h2 id="patients-title" className="text-3xl font-semibold tracking-tight">Patients</h2>
          <p className="mt-2 text-sm text-muted-foreground">Open a patient to review measurements, cognition tests and device links.</p>
        </div>
        <button onClick={onCreate} className="sam-button">
          <Plus size={16} /> Add patient
        </button>
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <label className="relative block w-full sm:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <input
              aria-label="Search patients"
              type="search"
              className="sam-input pl-9"
              placeholder="Search patients by name"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {loading ? "Loading patients…" : `${total} ${search ? "matching " : ""}patient${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Patient</th>
                <th scope="col" className="px-5 py-3 font-medium">Room</th>
                <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Age</th>
                <th scope="col" className="hidden px-5 py-3 font-medium md:table-cell">Linked device</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Open patient</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {patients.map((patient) => {
                const labels = deviceLabels(patient._id);
                return (
                  <tr key={patient._id} className="hover:bg-muted/40 focus-within:bg-muted/40">
                    <td className="px-5 py-4">
                      <button className="text-left font-medium underline-offset-4 hover:underline" onClick={() => onOpen(patient)}>
                        {patient.fullName}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{patient.room || "—"}</td>
                    <td className="hidden px-5 py-4 text-muted-foreground sm:table-cell">{patient.age != null ? `${patient.age} years` : "—"}</td>
                    <td className="hidden px-5 py-4 text-muted-foreground md:table-cell">{labels.length ? labels.join(", ") : "Not linked"}</td>
                    <td className="px-5 py-4 text-right">
                      <button aria-label={`Open ${patient.fullName}`} onClick={() => onOpen(patient)} className="sam-icon-button">
                        <ArrowRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!patients.length && (
            <div className="px-6 py-16 text-center">
              <Users size={28} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium">{loading ? "Loading your patient directory" : search ? "No matching patients" : "No patients yet"}</h3>
              {!loading && <p className="mt-2 text-sm text-muted-foreground">{search ? "Try another name or clear the search." : "Add your first patient, then link their watch."}</p>}
              {!loading && <button className="sam-secondary mt-5" onClick={search ? () => onSearch("") : onCreate}>{search ? "Clear search" : "Add patient"}</button>}
            </div>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <button className="sam-secondary" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <button className="sam-secondary" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">New patients have no measurements until a linked device uploads data.</p>
    </section>
  );
}
