// src/pages/AdminDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { reservationsAPI, nodesAPI, locationsAPI, auditAPI } from '../api';
import { useToast } from '../context/ToastContext';

function formatDT(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDTShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_CLASS = {
  Booked:    'badge-amber',
  Completed: 'badge-green',
  Cancelled: 'badge-red',
};

const ROLE_CLASS = {
  Admin:     'badge-red',
  Professor: 'badge-violet',
  Student:   'badge-cyan',
};

/* ── Add Node Modal ─────────────────────────────────────────── */
function AddNodeModal({ locations, onClose, onCreated }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    node_name:      '',
    node_type:      'GPU',
    location_id:    '',
    access_level:   'Student',
    status:         'Available',
    hardware_specs: '{\n  "processor": "",\n  "accelerator": "",\n  "memory": "",\n  "storage": "",\n  "interface": ""\n}',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.node_name.trim() || !form.location_id) {
      setError('Node name and location are required.');
      return;
    }
    let specs;
    try { specs = JSON.parse(form.hardware_specs); }
    catch { setError('hardware_specs must be valid JSON.'); return; }

    setLoading(true);
    try {
      await nodesAPI.create({
        node_name:      form.node_name.trim(),
        node_type:      form.node_type,
        location_id:    parseInt(form.location_id, 10),
        access_level:   form.access_level,
        status:         form.status,
        hardware_specs: specs,
      });
      toast.success('Node added!', `"${form.node_name}" is now in the system`);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.status === 409 ? 'A node with this name already exists.' : err.message || 'Failed to create node.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <h2 className="modal-title">Add Lab Node</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && <div className="err-box">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="frow">
            <div className="fgroup">
              <label className="flabel">Node Name</label>
              <input className="finput" type="text" placeholder="GPU-01-A" value={form.node_name} onChange={set('node_name')} autoFocus />
            </div>
            <div className="fgroup">
              <label className="flabel">Node Type</label>
              <select className="fselect" value={form.node_type} onChange={set('node_type')}>
                {['GPU','CPU','FPGA','Server','Workstation','Cluster'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fgroup">
              <label className="flabel">Location</label>
              <select className="fselect" value={form.location_id} onChange={set('location_id')}>
                <option value="">— Select location —</option>
                {locations.map(l => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.building_name} · Fl {l.floor_number} · Rm {l.room_number}
                  </option>
                ))}
              </select>
            </div>
            <div className="fgroup">
              <label className="flabel">Access Level</label>
              <select className="fselect" value={form.access_level} onChange={set('access_level')}>
                <option value="Student">Student</option>
                <option value="Professor">Professor</option>
              </select>
            </div>
          </div>
          <div className="fgroup">
            <label className="flabel">Initial Status</label>
            <select className="fselect" value={form.status} onChange={set('status')}>
              <option value="Available">Available</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Offline">Offline</option>
            </select>
          </div>
          <div className="fgroup">
            <label className="flabel">Hardware Specs (JSON)</label>
            <textarea
              className="finput"
              rows={8}
              style={{ resize: 'vertical', fontFamily: 'var(--font-b)', lineHeight: 1.6 }}
              value={form.hardware_specs}
              onChange={set('hardware_specs')}
              spellCheck={false}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Adding…</> : 'Add Node'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Confirm Cancel Modal ─────────────────────────────────── */
function ConfirmModal({ reservation, onClose, onConfirm, loading }) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <h2 className="modal-title">Cancel Reservation</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{ color: 'var(--text-mid)', lineHeight: 1.7 }}>
          Are you sure you want to cancel reservation{' '}
          <strong style={{ color: 'var(--text-hi)' }}>#{reservation?.reservation_id}</strong> for{' '}
          <strong style={{ color: 'var(--text-hi)' }}>{reservation?.full_name}</strong> on{' '}
          <strong style={{ color: 'var(--text-hi)' }}>{reservation?.node_name}</strong>?
        </p>
        <p style={{ color: 'var(--text-low)', fontSize: 12, marginTop: 8 }}>This cannot be undone.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Keep it</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Cancelling…</> : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Security Audit Panel ─────────────────────────────────── */
function AuditSection({ data, loading, onRun }) {
  if (loading) {
    return <div className="loading-row"><span className="spinner" /> Running cryptographic hash verification…</div>;
  }

  if (!data) {
    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ fontSize: 36 }}>🛡️</div>
        <div className="empty-title">Cryptographic Ledger Audit</div>
        <div className="empty-sub" style={{ marginBottom: 20 }}>
          Run a deep state-reconciliation and SHA-256 hash verification against the immutable ledger.
        </div>
        <button className="btn btn-primary" onClick={onRun}>Run Audit Now</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-hi)' }}>Ledger Status</h2>
        <button className="btn btn-ghost btn-sm" onClick={onRun}>↻ Re-run</button>
      </div>

      <div style={{
        padding: 24,
        borderRadius: 'var(--r-lg)',
        border: `2px solid ${data.audit_failed ? 'var(--red)' : 'var(--green)'}`,
        background: data.audit_failed ? 'var(--red-2)' : 'var(--green-2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 32, marginRight: 12 }}>{data.audit_failed ? '🚨' : '✅'}</span>
          <h3 style={{
            fontSize: 22,
            fontWeight: 800,
            color: data.audit_failed ? 'var(--red)' : 'var(--green)'
          }}>
            {data.audit_failed ? 'Integrity Compromised' : 'System Secure'}
          </h3>
        </div>
        
        <p style={{ fontSize: 16, color: 'var(--text-hi)', fontWeight: 500, lineHeight: 1.5 }}>
          {data.message}
        </p>

        {data.anomaly_type && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#1a1a1a',
            color: '#ff4d4f',
            fontFamily: 'monospace',
            borderRadius: 6,
            fontSize: 13
          }}>
            <span style={{ color: '#888' }}>ERROR_CODE: </span>
            {data.anomaly_type}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Admin Dashboard ─────────────────────────────────── */
export default function AdminDashboard() {
  const toast = useToast();

  const [reservations, setReservations] = useState([]);
  const [locations,    setLocations]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showAddNode,  setShowAddNode]  = useState(false);
  const [toDelete,     setToDelete]     = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [tab,          setTab]          = useState('bookings');

  // Audit state
  const [auditData,    setAuditData]    = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const filters = filterStatus ? { status: filterStatus } : {};
      const data = await reservationsAPI.all(filters);
      setReservations(data);
    } catch (err) {
      toast.error('Failed to load reservations', err.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, toast]);

  const loadLocations = useCallback(async () => {
    try { setLocations(await locationsAPI.list()); } catch { /* non-critical */ }
  }, []);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await auditAPI.run();
      setAuditData(data);
      
      if (!data.audit_failed) {
        toast.success('Audit complete', 'No tampering detected — ledger is secure.');
      } else {
        toast.error('Integrity Compromised', 'Anomalies detected in the cryptographic ledger!');
      }
    } catch (err) {
      toast.error('Audit failed', err.message);
    } finally {
      setAuditLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadReservations(); }, [loadReservations]);
  useEffect(() => { loadLocations();    }, [loadLocations]);

  async function handleCancel() {
    setDeleting(true);
    try {
      await reservationsAPI.cancel(toDelete.reservation_id);
      toast.success('Reservation cancelled', `#${toDelete.reservation_id} removed`);
      setToDelete(null);
      loadReservations();
    } catch (err) {
      toast.error('Failed to cancel', err.message);
    } finally {
      setDeleting(false);
    }
  }

  // Correctly computed stats — use displayed status (already Completed-corrected by backend)
  const now = new Date();
  const active    = reservations.filter(r => r.status === 'Booked');
  const completed = reservations.filter(r => r.status === 'Completed');
  const cancelled = reservations.filter(r => r.status === 'Cancelled');

  // Nodes actually used = unique nodes that were Booked or Completed (not just cancelled)
  const usedNodeIds = new Set(
    reservations
      .filter(r => r.status === 'Booked' || r.status === 'Completed')
      .map(r => r.node_id)
  );
  const uniqueUsers = new Set(reservations.map(r => r.user_id)).size;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">System-wide bookings, hardware management &amp; security</p>
        </div>
        <div className="gap-row">
          <button className="btn btn-ghost" onClick={() => { setTab('audit'); runAudit(); }}>
            🔍 Security Audit
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddNode(true)}>
            + Add Lab Node
          </button>
        </div>
      </div>

      {/* Stats — always shown regardless of tab */}
      <div className="stats-grid">
        <div className="stat-card c-amber">
          <div className="stat-val">{active.length}</div>
          <div className="stat-lbl">Active Bookings</div>
        </div>
        <div className="stat-card c-green">
          <div className="stat-val">{completed.length}</div>
          <div className="stat-lbl">Completed</div>
        </div>
        <div className="stat-card c-blue">
          <div className="stat-val">{uniqueUsers}</div>
          <div className="stat-lbl">Unique Users</div>
        </div>
        <div className="stat-card c-red">
          <div className="stat-val">{cancelled.length}</div>
          <div className="stat-lbl">Cancelled</div>
        </div>
        <div className="stat-card c-cyan">
          <div className="stat-val">{usedNodeIds.size}</div>
          <div className="stat-lbl">Nodes Used</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-btn${tab === 'bookings' ? ' active' : ''}`}
          onClick={() => setTab('bookings')}
        >
          All Bookings
        </button>
        <button
          className={`tab-btn${tab === 'audit' ? ' active' : ''}`}
          onClick={() => { setTab('audit'); if (!auditData && !auditLoading) runAudit(); }}
        >
          🔍 Security Audit
          {auditData && (
            auditData.audit_failed
              ? <span style={{ marginLeft: 6, color: 'var(--red)', fontWeight: 700 }}>(Failed)</span>
              : <span style={{ marginLeft: 6, color: 'var(--green)' }}>✓</span>
          )}
        </button>
      </div>

      {/* ── Bookings tab ── */}
      {tab === 'bookings' && (
        <>
          <div className="gap-row" style={{ marginBottom: 18 }}>
            <span style={{ color: 'var(--text-label)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Filter:
            </span>
            {['', 'Booked', 'Completed', 'Cancelled'].map(s => (
              <button
                key={s}
                className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterStatus(s)}
              >
                {s || 'All'}
              </button>
            ))}
            <span style={{ color: 'var(--text-low)', fontSize: 12, marginLeft: 'auto' }}>
              {reservations.length} record{reservations.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="loading-row"><span className="spinner" /> Loading all reservations…</div>
          ) : reservations.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◫</div>
              <div className="empty-title">No reservations found</div>
              <div className="empty-sub">
                {filterStatus ? `No ${filterStatus.toLowerCase()} reservations` : 'The system has no bookings yet'}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Node</th>
                    <th>Location</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map(r => (
                    <tr key={r.reservation_id}>
                      <td style={{ color: 'var(--text-low)', fontSize: 11 }}>#{r.reservation_id}</td>
                      <td>
                        <div style={{ fontFamily: 'var(--font-h)', fontSize: 12, color: 'var(--text-hi)', fontWeight: 600 }}>
                          {r.full_name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-low)' }}>{r.roll_number}</div>
                      </td>
                      <td>
                        <span className={`badge ${ROLE_CLASS[r.role] || 'badge-muted'}`}>{r.role}</span>
                      </td>
                      <td><strong>{r.node_name}</strong></td>
                      <td style={{ fontSize: 12 }}>
                        {r.building_name ? `${r.building_name} · Fl ${r.floor_number}` : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>{formatDT(r.start_time)}</td>
                      <td style={{ fontSize: 12 }}>{formatDT(r.end_time)}</td>
                      <td>
                        <span className={`badge ${STATUS_CLASS[r.status] || 'badge-muted'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.status === 'Booked' ? (
                          <button className="btn btn-sm btn-danger" onClick={() => setToDelete(r)}>
                            Cancel
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-low)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Audit tab ── */}
      {tab === 'audit' && (
        <AuditSection
          data={auditData}
          loading={auditLoading}
          onRun={runAudit}
        />
      )}

      {showAddNode && (
        <AddNodeModal
          locations={locations}
          onClose={() => setShowAddNode(false)}
          onCreated={loadReservations}
        />
      )}

      {toDelete && (
        <ConfirmModal
          reservation={toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={handleCancel}
          loading={deleting}
        />
      )}
    </div>
  );
}