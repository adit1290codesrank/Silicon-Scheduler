// src/pages/AdminDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { reservationsAPI, nodesAPI, locationsAPI, auditAPI } from '../api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Loader2, Plus, ShieldCheck, ShieldAlert, RotateCw, AlertTriangle,
} from 'lucide-react';

function formatDT(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_BADGE = {
  Booked:    'amber',
  Completed: 'green',
  Cancelled: 'red',
};

const ROLE_BADGE = {
  Admin:     'red',
  Professor: 'violet',
  Student:   'cyan',
};

/* ── Add Node Modal ─────────────────────────────────────────── */
function AddNodeModal({ locations, open, onOpenChange, onCreated }) {
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
      onOpenChange(false);
    } catch (err) {
      setError(err.status === 409 ? 'A node with this name already exists.' : err.message || 'Failed to create node.');
    } finally {
      setLoading(false);
    }
  }

  const selectClasses = "flex w-full rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-2.5 text-[13px] font-[family-name:--font-mono] text-text-hi outline-none transition-[border-color,box-shadow] duration-200 focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)] cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%3E%3Cpath%20d=%27M0%200l5%206%205-6z%27%20fill=%27%2355608a%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_13px_center] pr-9";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Add Lab Node</DialogTitle>
          <DialogDescription>Provision a new hardware node into the system.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-2 border border-red/25 rounded-[--radius-md] px-4 py-3 text-red text-[13px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <Label>Node Name</Label>
              <Input type="text" placeholder="GPU-01-A" value={form.node_name} onChange={set('node_name')} autoFocus />
            </div>
            <div>
              <Label>Node Type</Label>
              <select className={selectClasses} value={form.node_type} onChange={set('node_type')}>
                {['GPU','CPU','FPGA','Server','Workstation','Cluster'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3.5 mt-4">
            <div>
              <Label>Location</Label>
              <select className={selectClasses} value={form.location_id} onChange={set('location_id')}>
                <option value="">— Select location —</option>
                {locations.map(l => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.building_name} · Fl {l.floor_number} · Rm {l.room_number}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Access Level</Label>
              <select className={selectClasses} value={form.access_level} onChange={set('access_level')}>
                <option value="Student">Student</option>
                <option value="Professor">Professor</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label>Initial Status</Label>
            <select className={selectClasses} value={form.status} onChange={set('status')}>
              <option value="Available">Available</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Offline">Offline</option>
            </select>
          </div>
          <div className="mt-4">
            <Label>Hardware Specs (JSON)</Label>
            <textarea
              className="flex w-full rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-2.5 text-[13px] font-[family-name:--font-mono] text-text-hi outline-none transition-[border-color,box-shadow] duration-200 focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)] resize-y leading-relaxed"
              rows={8}
              value={form.hardware_specs}
              onChange={set('hardware_specs')}
              spellCheck={false}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</> : 'Add Node'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Confirm Cancel Modal ─────────────────────────────────── */
function ConfirmCancelModal({ reservation, open, onOpenChange, onConfirm, loading }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Cancel Reservation</DialogTitle>
        </DialogHeader>
        <p className="text-text-mid leading-relaxed">
          Are you sure you want to cancel reservation{' '}
          <strong className="text-text-hi">#{reservation?.reservation_id}</strong> for{' '}
          <strong className="text-text-hi">{reservation?.full_name}</strong> on{' '}
          <strong className="text-text-hi">{reservation?.node_name}</strong>?
        </p>
        <p className="text-text-low text-[12px] mt-2">This cannot be undone.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Keep it</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelling…</> : 'Yes, Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Security Audit Panel ─────────────────────────────────── */
function AuditSection({ data, loading, onRun }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-text-mid">
        <Loader2 className="w-4.5 h-4.5 animate-spin text-amber" />
        Running cryptographic hash verification…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-text-low">
        <ShieldCheck className="w-10 h-10 text-text-low opacity-40 mx-auto mb-3" />
        <div className="font-[family-name:--font-heading] text-base text-text-mid mb-1.5">
          Cryptographic Ledger Audit
        </div>
        <div className="text-[12px] mb-5">
          Run a deep state-reconciliation and SHA-256 hash verification against the immutable ledger.
        </div>
        <Button onClick={onRun}>Run Audit Now</Button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex justify-between items-center mb-5">
        <h2 className="font-[family-name:--font-heading] text-lg font-bold">Ledger Status</h2>
        <Button variant="ghost" size="sm" onClick={onRun}>
          <RotateCw className="w-3.5 h-3.5" /> Re-run
        </Button>
      </div>

      <div
        className="p-6 rounded-[--radius-lg]"
        style={{
          border: `2px solid ${data.audit_failed ? 'var(--color-red)' : 'var(--color-green)'}`,
          background: data.audit_failed ? 'var(--color-red-2)' : 'var(--color-green-2)',
        }}
      >
        <div className="flex items-center mb-3 gap-3">
          {data.audit_failed
            ? <ShieldAlert className="w-8 h-8 text-red" />
            : <ShieldCheck className="w-8 h-8 text-green" />
          }
          <h3 className="font-[family-name:--font-heading] text-[22px] font-extrabold" style={{ color: data.audit_failed ? 'var(--color-red)' : 'var(--color-green)' }}>
            {data.audit_failed ? 'Integrity Compromised' : 'System Secure'}
          </h3>
        </div>

        <p className="text-base text-text-hi font-medium leading-relaxed">
          {data.message}
        </p>

        {data.anomaly_type && (
          <div className="mt-4 p-3 bg-[#1a1a1a] text-red font-[family-name:--font-mono] rounded-[--radius-md] text-[13px]">
            <span className="text-text-low">ERROR_CODE: </span>
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
  const [activeTab,    setActiveTab]    = useState('bookings');

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

  // Stats
  const active    = reservations.filter(r => r.status === 'Booked');
  const completed = reservations.filter(r => r.status === 'Completed');
  const cancelled = reservations.filter(r => r.status === 'Cancelled');
  const usedNodeIds = new Set(
    reservations
      .filter(r => r.status === 'Booked' || r.status === 'Completed')
      .map(r => r.node_id)
  );
  const uniqueUsers = new Set(reservations.map(r => r.user_id)).size;

  const stats = [
    { label: 'Active Bookings', value: active.length,    color: 'amber' },
    { label: 'Completed',       value: completed.length, color: 'green' },
    { label: 'Unique Users',    value: uniqueUsers,      color: 'blue' },
    { label: 'Cancelled',       value: cancelled.length, color: 'red' },
    { label: 'Nodes Used',      value: usedNodeIds.size,  color: 'cyan' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7 pb-5 border-b border-border-dim">
        <div>
          <h1 className="font-[family-name:--font-heading] text-[26px] font-extrabold">Admin Panel</h1>
          <p className="text-[13px] text-text-mid mt-0.5">System-wide bookings, hardware management & security</p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="ghost" onClick={() => { setActiveTab('audit'); runAudit(); }}>
            <ShieldCheck className="w-4 h-4" /> Security Audit
          </Button>
          <Button onClick={() => setShowAddNode(true)}>
            <Plus className="w-4 h-4" /> Add Lab Node
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5 mb-7">
        {stats.map(s => (
          <Card key={s.label} className="relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 bg-${s.color}`} />
            <CardContent className="p-5">
              <div className="font-[family-name:--font-heading] text-[34px] font-extrabold leading-none mb-1">
                {s.value}
              </div>
              <div className="text-[11px] text-text-low uppercase tracking-[0.09em]">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => {
        setActiveTab(v);
        if (v === 'audit' && !auditData && !auditLoading) runAudit();
      }}>
        <TabsList className="mb-5">
          <TabsTrigger value="bookings">All Bookings</TabsTrigger>
          <TabsTrigger value="audit">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            Security Audit
            {auditData && (
              auditData.audit_failed
                ? <span className="ml-1.5 text-red font-bold">(Failed)</span>
                : <span className="ml-1.5 text-green">✓</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Bookings tab ── */}
        <TabsContent value="bookings">
          {/* Filter row */}
          <div className="flex items-center gap-2.5 flex-wrap mb-4">
            <span className="text-text-label text-[11px] uppercase tracking-[0.08em]">Filter:</span>
            {['', 'Booked', 'Completed', 'Cancelled'].map(s => (
              <Button
                key={s}
                variant={filterStatus === s ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterStatus(s)}
              >
                {s || 'All'}
              </Button>
            ))}
            <span className="text-text-low text-[12px] ml-auto">
              {reservations.length} record{reservations.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-text-mid">
              <Loader2 className="w-4.5 h-4.5 animate-spin text-amber" />
              Loading all reservations…
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center py-16 text-text-low">
              <div className="text-4xl mb-3 opacity-40">◫</div>
              <div className="font-[family-name:--font-heading] text-base text-text-mid mb-1.5">
                No reservations found
              </div>
              <div className="text-[12px]">
                {filterStatus ? `No ${filterStatus.toLowerCase()} reservations` : 'The system has no bookings yet'}
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map(r => (
                  <TableRow key={r.reservation_id}>
                    <TableCell className="text-text-low text-[11px]">#{r.reservation_id}</TableCell>
                    <TableCell>
                      <div className="font-[family-name:--font-heading] text-[12px] text-text-hi font-semibold">
                        {r.full_name}
                      </div>
                      <div className="text-[11px] text-text-low">{r.roll_number}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[r.role] || 'muted'}>{r.role}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-text-hi">{r.node_name}</TableCell>
                    <TableCell className="text-[12px]">
                      {r.building_name ? `${r.building_name} · Fl ${r.floor_number}` : '—'}
                    </TableCell>
                    <TableCell className="text-[12px]">{formatDT(r.start_time)}</TableCell>
                    <TableCell className="text-[12px]">{formatDT(r.end_time)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status] || 'muted'}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.status === 'Booked' ? (
                        <Button variant="destructive" size="sm" onClick={() => setToDelete(r)}>
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-text-low text-[11px]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Audit tab ── */}
        <TabsContent value="audit">
          <AuditSection
            data={auditData}
            loading={auditLoading}
            onRun={runAudit}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <AddNodeModal
        locations={locations}
        open={showAddNode}
        onOpenChange={setShowAddNode}
        onCreated={loadReservations}
      />

      <ConfirmCancelModal
        reservation={toDelete}
        open={!!toDelete}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        onConfirm={handleCancel}
        loading={deleting}
      />
    </div>
  );
}