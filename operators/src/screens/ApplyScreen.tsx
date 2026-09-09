import { useEffect, useState } from 'react';
import { api, type Corridor, type DocumentKey, type OperatorProfile } from '../api/client';
import { useAuth } from '../state/AuthContext';

const DOC_SPEC: { key: DocumentKey; name: string; note: string }[] = [
  { key: 'RGD_CERTIFICATE', name: 'Certificate of incorporation', note: 'RGD REGISTRATION' },
  { key: 'TRANSPORT_LICENCE', name: 'Commercial transport licence', note: 'PASSENGER SERVICE' },
  { key: 'DRIVER_ROSTER', name: 'Driver roster and licences', note: 'MANAGED ON THE CONSOLE' },
  { key: 'INSURANCE_ENDORSEMENT', name: 'Insurance · fare-paying passengers', note: 'ENDORSEMENT REQUIRED' },
  { key: 'SAFETY_STANDARD_AGREEMENT', name: 'CityShare Safety Standard agreement', note: 'DRIVERS · VEHICLES · RIDERS · TRIPS' },
];

// Recreated from CityShare Express Operators.dc.html ("Apply" tab). The
// design's fleet table is an aggregate "type + unit count" (e.g. "4x
// Hyundai H1"); this build tracks individually assignable vehicles
// instead, since the Operator console needs a specific vehicle to assign
// to a specific run — an aggregate count can't be assigned to anything.
// The "corridors you want" chips are real, DB-driven (only the corridors
// that actually exist here, unlike the design's Northwestern/Eastern/
// Madina examples, most of which aren't seeded in this build).
export function ApplyScreen({ onSubmitted }: { onSubmitted: () => void }) {
  const { session } = useAuth();
  const [operator, setOperator] = useState<OperatorProfile | 'none' | undefined>();
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const [companyForm, setCompanyForm] = useState({ registeredName: '', rgdNumber: '', operatingSince: '', contactName: '' });
  const [vehicleForm, setVehicleForm] = useState({ label: '', vehicleType: '', spec: '', seats: '11' });

  async function refresh() {
    if (!session) return;
    try {
      const res = await api.getMine(session.token);
      setOperator(res.operator);
      setCompanyForm({
        registeredName: res.operator.registeredName,
        rgdNumber: res.operator.rgdNumber ?? '',
        operatingSince: res.operator.operatingSince?.toString() ?? '',
        contactName: res.operator.contactName ?? '',
      });
    } catch {
      setOperator('none');
    }
  }

  useEffect(() => {
    refresh();
    api.getCorridors().then((res) => setCorridors(res.corridors));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.upsertApplication(session.token, {
        registeredName: companyForm.registeredName,
        rgdNumber: companyForm.rgdNumber || undefined,
        operatingSince: companyForm.operatingSince ? Number(companyForm.operatingSince) : undefined,
        contactName: companyForm.contactName || undefined,
      });
      await refresh();
    } catch {
      setError('Could not save company details.');
    } finally {
      setBusy(false);
    }
  }

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    try {
      await api.addVehicle(session.token, {
        label: vehicleForm.label,
        vehicleType: vehicleForm.vehicleType,
        spec: vehicleForm.spec,
        seats: Number(vehicleForm.seats),
      });
      setVehicleForm({ label: '', vehicleType: '', spec: '', seats: '11' });
      await refresh();
    } catch {
      setError('Could not add that vehicle.');
    } finally {
      setBusy(false);
    }
  }

  async function removeVehicle(id: string) {
    if (!session) return;
    await api.removeVehicle(session.token, id);
    await refresh();
  }

  async function toggleCorridor(corridorId: string, on: boolean) {
    if (!session) return;
    await api.setCorridorInterest(session.token, corridorId, on);
    await refresh();
  }

  async function toggleDoc(key: DocumentKey) {
    if (!session) return;
    await api.toggleDocument(session.token, key);
    await refresh();
  }

  async function submit() {
    if (!session || operator === 'none' || !operator) return;
    if (operator.status !== 'APPLICATION') {
      onSubmitted();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.submitApplication(session.token);
      onSubmitted();
    } catch {
      setError('Complete the fleet, corridors and documents before submitting.');
    } finally {
      setBusy(false);
    }
  }

  if (operator === undefined) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  if (operator === 'none') {
    return (
      <div style={{ padding: '34px 40px', maxWidth: 480 }}>
        <span className="card-kicker">EXPRESS OPERATOR APPLICATION</span>
        <h2 style={{ font: '600 26px var(--font-display)', letterSpacing: '-0.025em', margin: '7px 0 16px' }}>
          Tell us what you run today
        </h2>
        <form onSubmit={saveCompany} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="REGISTERED NAME" value={companyForm.registeredName} onChange={(v) => setCompanyForm((p) => ({ ...p, registeredName: v }))} required />
          <Field label="RGD NUMBER" value={companyForm.rgdNumber} onChange={(v) => setCompanyForm((p) => ({ ...p, rgdNumber: v }))} />
          <Field label="OPERATING SINCE" value={companyForm.operatingSince} onChange={(v) => setCompanyForm((p) => ({ ...p, operatingSince: v }))} />
          <Field label="OPERATIONS CONTACT" value={companyForm.contactName} onChange={(v) => setCompanyForm((p) => ({ ...p, contactName: v }))} />
          {error && <span className="error-text">{error}</span>}
          <button className="btn btn-dark" type="submit" disabled={busy} style={{ padding: 12 }}>
            {busy ? 'Saving…' : 'Start application'}
          </button>
        </form>
      </div>
    );
  }

  const seatTotal = operator.vehicles.reduce((sum, v) => sum + v.seats, 0);
  const interestedIds = new Set(operator.corridorInterests.map((c) => c.corridorId));
  const docStatus = new Map(operator.documents.map((d) => [d.key, Boolean(d.uploadedAt)]));

  return (
    <div style={{ padding: '34px 40px 52px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span className="card-kicker">EXPRESS OPERATOR APPLICATION</span>
          <h2 style={{ font: '600 26px var(--font-display)', letterSpacing: '-0.025em', margin: '7px 0 0' }}>
            {operator.registeredName}
          </h2>
        </div>

        <form onSubmit={saveCompany} className="card">
          <div className="card-header"><span className="card-kicker">COMPANY</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)' }}>
            <CellInput label="REGISTERED NAME" value={companyForm.registeredName} onChange={(v) => setCompanyForm((p) => ({ ...p, registeredName: v }))} />
            <CellInput label="RGD NUMBER" value={companyForm.rgdNumber} onChange={(v) => setCompanyForm((p) => ({ ...p, rgdNumber: v }))} />
            <CellInput label="OPERATING SINCE" value={companyForm.operatingSince} onChange={(v) => setCompanyForm((p) => ({ ...p, operatingSince: v }))} />
            <CellInput label="OPERATIONS CONTACT" value={companyForm.contactName} onChange={(v) => setCompanyForm((p) => ({ ...p, contactName: v }))} />
          </div>
          <div style={{ padding: '12px 20px' }}>
            <button className="btn btn-outline" type="submit" disabled={busy}>Save company details</button>
          </div>
        </form>

        <div className="card">
          <div className="card-header">
            <span className="card-kicker">FLEET YOU'D RELEASE TO EXPRESS</span>
            <span className="card-note">You keep the rest for charter work</span>
          </div>
          {operator.vehicles.map((v) => (
            <div key={v.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ font: '500 14px var(--font-display)' }}>{v.label} · {v.vehicleType}</span>
                <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>{v.spec} · {v.seats} SEATS</span>
              </div>
              <button className="btn btn-outline" onClick={() => removeVehicle(v.id)}>Remove</button>
            </div>
          ))}
          <form onSubmit={addVehicle} style={{ padding: '14px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Label (H1-07)" required value={vehicleForm.label} onChange={(e) => setVehicleForm((p) => ({ ...p, label: e.target.value }))} style={smallInput} />
            <input placeholder="Type (Hyundai H1 · 11-seater)" required value={vehicleForm.vehicleType} onChange={(e) => setVehicleForm((p) => ({ ...p, vehicleType: e.target.value }))} style={{ ...smallInput, flex: 1 }} />
            <input placeholder="Spec (AC · WIFI · INSURED)" required value={vehicleForm.spec} onChange={(e) => setVehicleForm((p) => ({ ...p, spec: e.target.value }))} style={{ ...smallInput, flex: 1 }} />
            <input type="number" min={1} max={60} required value={vehicleForm.seats} onChange={(e) => setVehicleForm((p) => ({ ...p, seats: e.target.value }))} style={{ ...smallInput, width: 64 }} />
            <button className="btn btn-dark" type="submit" disabled={busy}>Add vehicle</button>
          </form>
          <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: 'var(--row-bg)' }}>
            <span style={{ font: '500 13px var(--font-display)' }}>Seats you're offering</span>
            <span style={{ font: '600 20px var(--font-mono)', letterSpacing: '-0.02em' }}>{seatTotal}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-kicker">CORRIDORS YOU WANT</span>
            <span className="card-note">{interestedIds.size ? `${interestedIds.size} selected` : 'Select at least one'}</span>
          </div>
          <div style={{ padding: '18px 20px', display: 'flex', flexWrap: 'wrap', gap: 9 }}>
            {corridors.map((c) => {
              const on = interestedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCorridor(c.id, !on)}
                  style={{
                    border: `1px solid ${on ? 'var(--green)' : 'var(--border-strong)'}`,
                    background: on ? 'var(--green)' : '#fff',
                    color: on ? '#fff' : 'var(--ink)',
                    borderRadius: 999,
                    padding: '10px 16px',
                    font: '500 13px var(--font-display)',
                    cursor: 'pointer',
                  }}
                >
                  {c.name} · {c.origin} → {c.destination}
                </button>
              );
            })}
            {corridors.length === 0 && <span style={{ color: 'var(--muted)' }}>No corridors seeded yet.</span>}
          </div>
          <div style={{ padding: '0 20px 18px', font: '400 12px var(--font-display)', color: 'var(--muted-strong)' }}>
            Only corridors CityShare actually runs today are listed here.
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-kicker">DOCUMENTS</span></div>
          {DOC_SPEC.map((d) => {
            const uploaded = docStatus.get(d.key) ?? false;
            return (
              <div key={d.key} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ font: '500 14.5px var(--font-display)' }}>{d.name}</span>
                  <span style={{ font: '400 11.5px var(--font-mono)', color: 'var(--muted)' }}>{d.note}</span>
                </div>
                <button className={uploaded ? 'btn btn-outline' : 'btn btn-dark'} onClick={() => toggleDoc(d.key)}>
                  {uploaded ? 'Uploaded' : 'Upload'}
                </button>
              </div>
            );
          })}
          <div className="card-footnote">
            Insurance is checked specifically for fare-paying passenger cover. Uploads here are a placeholder for a
            real document pipeline — see the backend README.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
        <div style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-ink)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.13em', color: 'var(--sidebar-muted)' }}>APPLICATION</span>
          <SummaryRow label="Seats offered" value={String(seatTotal)} />
          <SummaryRow label="Corridors requested" value={String(interestedIds.size)} />
          <SummaryRow
            label="Documents complete"
            value={`${operator.readiness.docsUploaded} of ${operator.readiness.docsTotal}`}
            accent={operator.readiness.docsComplete ? '#96e498' : '#d8c79a'}
          />
          <button
            className="btn"
            disabled={busy || (operator.status === 'APPLICATION' && !operator.readiness.ready)}
            onClick={submit}
            style={{
              marginTop: 4,
              padding: 15,
              background: operator.status !== 'APPLICATION' ? '#2b3029' : operator.readiness.ready ? 'var(--green)' : '#2b3029',
              color: operator.status !== 'APPLICATION' ? '#f5f4f0' : operator.readiness.ready ? '#0e120e' : '#6d736c',
            }}
          >
            {operator.status !== 'APPLICATION' ? 'Submitted · view certification' : operator.readiness.ready ? 'Submit application' : 'Complete documents to submit'}
          </button>
          {error && <span className="error-text">{error}</span>}
          <span style={{ font: '400 11.5px/1.45 var(--font-display)', color: '#8b918a' }}>
            {operator.status !== 'APPLICATION'
              ? `Application received. Status: ${operator.status}.`
              : 'No commitment. You approve corridors and terms before anything goes live.'}
          </span>
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <span className="card-kicker">WHAT HAPPENS AFTER</span>
          <span style={{ font: '400 13px/1.55 var(--font-display)', color: '#3d403b' }}>
            Certification checks company registration, insurance, the Safety Standard agreement and your driver
            roster's identity verification — see the Certification tab. Nothing goes live until every check clears.
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="stat-label">{label}</span>
      <input required={required} value={value} onChange={(e) => onChange(e.target.value)} style={smallInput} />
    </label>
  );
}

function CellInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ background: '#fff', padding: '15px 20px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ font: '500 10px var(--font-mono)', letterSpacing: '0.1em', color: '#9a9d95' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...smallInput, border: 'none', padding: 0, font: '500 15px var(--font-display)' }} />
    </div>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ font: '400 13px var(--font-display)', color: '#c9cec8' }}>{label}</span>
      <span style={{ font: '600 17px var(--font-mono)', color: accent }}>{value}</span>
    </div>
  );
}

const smallInput: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  font: '500 13px var(--font-display)',
};
