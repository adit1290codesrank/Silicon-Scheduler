// src/pages/BookingWizard.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { locationsAPI, nodesAPI, reservationsAPI, predictAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { 
  Cpu, CircuitBoard, Hexagon, Server, Monitor, 
  CalendarDays, MapPin, Zap, CheckCircle2, ArrowRight, ArrowLeft,
  Loader2, Clock, AlertTriangle
} from 'lucide-react';

/* ── Helpers ────────────────────────────────────────────── */
function toISO(localDT) {
  if (!localDT) return '';
  return new Date(localDT).toISOString().slice(0, 19).replace('T', ' ');
}

function localNow(offsetMinutes = 5) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  return d.toISOString().slice(0, 16);
}

function localPlus(localDT, hours = 2) {
  if (!localDT) return localNow(5 + hours * 60);
  const d = new Date(localDT);
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 16);
}

function roundTo15(localDT) {
  if (!localDT) return localDT;
  const [datePart, timePart = '00:00'] = localDT.split('T');
  const [h, m] = timePart.split(':').map(Number);
  const total  = h * 60 + m;
  const rounded = Math.ceil(total / 15) * 15;
  const newH = Math.floor(rounded / 60) % 24;
  const newM = rounded % 60;
  return `${datePart}T${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function parseDT(localDT) {
  if (!localDT) return { date: '', hour: '12', minute: '00', period: 'AM' };
  const [datePart, timePart = '00:00'] = localDT.split('T');
  let [h, m] = timePart.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0)       h = 12;
  else if (h > 12)   h -= 12;
  return { date: datePart, hour: String(h), minute: String(m).padStart(2, '0'), period };
}

function composeDT(date, hour, minute, period) {
  if (!date) return '';
  let h = parseInt(hour, 10);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${minute}`;
}

const TODAY = new Date().toISOString().split('T')[0];
const HOURS   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ['00', '15', '30', '45'];

const NODE_ICON = {
  'Server':        Server,
  'GPU Node':      Cpu,
  'FPGA':          Hexagon,
  'Cluster':       CircuitBoard,
  'Supercomputer': Zap,
  'Workstation':   Monitor,
};

function getNodeIcon(type) {
  return NODE_ICON[type] || Cpu;
}

/* ── Surge Logic ────────────────────────────────────────── */
function getSurgeMax(load) {
  if (load > 0.80) return 1;
  if (load > 0.50) return 4;
  return 8;
}

function surgeColour(load) {
  if (load > 0.80) return 'text-red';
  if (load > 0.50) return 'text-amber';
  return 'text-green';
}

function heatmapCellBg(load) {
  const safeLoad = Math.min(Math.max(load, 0), 1);
  const hue = (1 - safeLoad) * 120;
  const alpha = 0.15 + (safeLoad * 0.7);
  return `hsla(${hue}, 85%, 50%, ${alpha.toFixed(2)})`;
}

function surgeTierLabel(load) {
  if (load > 0.80) return 'HIGH SURGE';
  if (load > 0.50) return 'MODERATE';
  return 'NORMAL';
}

function surgeBadgeVariant(load) {
  if (load > 0.80) return 'red';
  if (load > 0.50) return 'amber';
  return 'green';
}

const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0)  return '12am';
  if (i < 12)   return `${i}am`;
  if (i === 12) return '12pm';
  return `${i - 12}pm`;
});

/* ── AM/PM DateTime Picker ──────────────────────────────── */
function DateTimePicker({ label, value, minDate, onChange }) {
  const { date, hour, minute, period } = parseDT(value);
  const update = (d, h, m, p) => onChange(composeDT(d, h, m, p));
  const selectClasses = "flex rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-2.5 text-[13px] font-[family-name:--font-mono] text-text-hi outline-none focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)] cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%3E%3Cpath%20d=%27M0%200l5%206%205-6z%27%20fill=%27%2355608a%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_13px_center] pr-9";

  return (
    <div className="mb-4">
      <Label>{label}</Label>
      <div className="flex gap-2.5">
        <Input
          type="date"
          className="flex-[2] min-w-[130px]"
          value={date}
          min={minDate || TODAY}
          onChange={e => update(e.target.value, hour, minute, period)}
        />
        <select className={cn(selectClasses, "flex-1")} value={hour} onChange={e => update(date, e.target.value, minute, period)}>
          {HOURS.map(h => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}</option>)}
        </select>
        <select className={cn(selectClasses, "flex-1")} value={minute} onChange={e => update(date, hour, e.target.value, period)}>
          {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={cn(selectClasses, "flex-1")} value={period} onChange={e => update(date, hour, minute, e.target.value)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

/* ── Surge Heatmap Grid ─────────────────────────────────── */
function SurgeHeatmap({ heatmap, startISO }) {
  const heatMap = useMemo(() => {
    const m = {};
    (heatmap || []).forEach(({ day, hour, load }) => { m[`${day}-${hour}`] = load; });
    return m;
  }, [heatmap]);

  const jsDay = startISO ? new Date(startISO).getDay() : -1;
  const activeIsoDay = jsDay === 0 ? 7 : jsDay;
  const activeHour = startISO ? new Date(startISO).getHours() : -1;

  if (!heatmap || heatmap.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <span className="text-[11px] text-text-label uppercase tracking-[0.09em] font-medium">
          Predicted Load Heatmap (7 × 24)
        </span>
        <div className="flex gap-3 items-center">
          {[
            { label: 'Normal ≤50%',  color: 'hsla(120, 85%, 50%, 0.3)' },
            { label: 'Surge 50-80%', color: 'hsla(35, 85%, 50%, 0.6)' },
            { label: 'High >80%',    color: 'hsla(0, 85%, 50%, 0.9)' },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] text-text-mid">
              <span className="w-2.5 h-2.5 rounded-sm border border-white/10" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[--radius-lg] border border-border-dim">
        <div className="min-w-[420px]">
          <div className="grid grid-cols-[36px_repeat(7,1fr)] bg-surface border-b border-border-dim">
            <div />
            {DAY_LABELS.map((d, idx) => (
              <div key={d} className={cn(
                "text-center py-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
                (idx + 1) === activeIsoDay ? "text-amber" : "text-text-label"
              )}>{d}</div>
            ))}
          </div>

          {HOUR_LABELS.map((hlabel, hour) => (
            <div key={hour} className={cn(
              "grid grid-cols-[36px_repeat(7,1fr)]",
              hour < 23 ? "border-b border-white/[0.03]" : ""
            )}>
              <div className={cn(
                "flex items-center justify-end pr-1.5 text-[9px] select-none tracking-[0.04em]",
                hour === activeHour ? "text-amber font-bold" : "text-text-low font-normal"
              )}>
                {hlabel}
              </div>
              {DAY_LABELS.map((_, idx) => {
                const isoDay   = idx + 1;
                const load     = heatMap[`${isoDay}-${hour}`] ?? 0;
                const isActive = isoDay === activeIsoDay && hour === activeHour;
                return (
                  <div
                    key={idx}
                    title={`${DAY_LABELS[idx]} ${hlabel} — load: ${(load * 100).toFixed(0)}% (max ${getSurgeMax(load)}h)`}
                    className="h-3.5 relative transition-colors duration-200"
                    style={{
                      background: isActive ? 'transparent' : heatmapCellBg(load),
                      outline: isActive ? '2px solid var(--color-amber)' : 'none',
                      outlineOffset: '-1px',
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-text-low mt-1.5 leading-relaxed">
        Highlighted cell = your selected start time. Red = higher predicted load = shorter max duration.
      </p>
    </div>
  );
}

/* ── Step indicators ───────────────────────────────────── */
function WizardSteps({ step, maxDone, onGoTo }) {
  const steps = [
    { num: 1, label: 'Time Window', icon: Clock },
    { num: 2, label: 'Location',    icon: MapPin },
    { num: 3, label: 'Select Node', icon: Cpu },
  ];
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const isActive = step === s.num;
        const isDone   = s.num < step && s.num <= maxDone;
        const Icon = s.icon;
        return (
          <div key={s.num} className="flex items-center">
            <div
              onClick={isDone ? () => onGoTo(s.num) : undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all border",
                isActive ? "bg-amber-2 text-amber border-amber/25" : 
                isDone ? "bg-surface text-text-hi border-border-mid cursor-pointer hover:bg-elevated" : 
                "bg-transparent text-text-low border-transparent opacity-50"
              )}
            >
              {isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-green" /> : <Icon className="w-3.5 h-3.5" />}
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                "w-8 h-px mx-2",
                isDone ? "bg-border-lit" : "bg-border-dim"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Time Selection ─────────────────────────────── */
function StepTime({ value, onChange, onNext }) {
  const [error, setError] = useState('');
  const [heatmap,        setHeatmap]        = useState(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterNodeType, setFilterNodeType] = useState('');
  const [locations,      setLocations]      = useState([]);

  useEffect(() => { locationsAPI.list().then(setLocations).catch(() => {}); }, []);

  useEffect(() => {
    setHeatmapLoading(true);
    const filters = {};
    if (filterLocation) filters.location_id = parseInt(filterLocation, 10);
    if (filterNodeType) filters.node_type   = filterNodeType;

    predictAPI.heatmap(filters)
      .then(setHeatmap)
      .catch(() => setHeatmap([]))
      .finally(() => setHeatmapLoading(false));
  }, [filterLocation, filterNodeType]);

  const heatMap = useMemo(() => {
    const m = {};
    (heatmap || []).forEach(({ day, hour, load }) => { m[`${day}-${hour}`] = load; });
    return m;
  }, [heatmap]);

  const startLoad = useMemo(() => {
    if (!value.start) return 0;
    const d = new Date(value.start);
    const jsDay = d.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return heatMap[`${isoDay}-${d.getHours()}`] ?? 0;
  }, [value.start, heatMap]);

  const surgeMax = getSurgeMax(startLoad);
  const diffH = value.start && value.end ? (new Date(value.end) - new Date(value.start)) / 3600000 : 0;
  const isSurgeViolation = diffH > 0 && diffH > surgeMax;
  const hasSurgeData     = heatmap && heatmap.length > 0;
  
  const selectClasses = "flex rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-1.5 text-[12px] font-[family-name:--font-mono] text-text-hi outline-none focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)] cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%3E%3Cpath%20d=%27M0%200l5%206%205-6z%27%20fill=%27%2355608a%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_13px_center] pr-9";

  function validate() {
    setError('');
    if (!value.start || !value.end) { setError('Please select both start and end times.'); return; }
    const s = new Date(value.start);
    const e = new Date(value.end);
    if (s <= new Date()) { setError('Start time must be in the future.'); return; }
    if (e <= s)          { setError('End time must be after start time.'); return; }
    const durH = (e - s) / 3600000;
    if (durH < 0.5) { setError('Minimum booking duration is 30 minutes.'); return; }
    if (hasSurgeData && durH > surgeMax) {
      setError(`Surge limit active: max booking is ${surgeMax}h at this time (predicted load ${(startLoad * 100).toFixed(0)}%). Reduce your end time or pick a lower-demand slot.`);
      return;
    }
    if (durH > 12) { setError('Maximum booking duration is 12 hours.'); return; }
    onNext();
  }

  return (
    <Card className="max-w-[580px] animate-fade-up">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-amber" /> Time Window</CardTitle>
          <p className="text-[13px] text-text-mid mt-1.5 leading-relaxed">
            Choose when you need the hardware. The system uses B-Tree indexed availability checks — results are instant.
          </p>
        </div>
        {hasSurgeData && (
          <Badge variant={surgeBadgeVariant(startLoad)} className="shrink-0">{surgeTierLabel(startLoad)}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {error && <div className="bg-red-2 border border-red/25 rounded-[--radius-md] px-4 py-3 text-red text-[13px] mb-5">{error}</div>}

        <DateTimePicker label="Start Time" value={value.start} minDate={TODAY} onChange={(newStart) => onChange({ start: newStart, end: roundTo15(localPlus(newStart, 2)) })} />
        <DateTimePicker label="End Time" value={value.end} minDate={value.start ? value.start.split('T')[0] : TODAY} onChange={(newEnd) => onChange({ ...value, end: newEnd })} />

        {diffH > 0 && (
          <div className={cn(
            "flex items-center justify-between gap-4 p-3 rounded-[--radius-md] text-[13px] mb-5 border",
            isSurgeViolation ? "bg-red-2 text-red border-red/25" : "bg-cyan-2 text-cyan border-cyan/20"
          )}>
            <div className="flex items-center gap-2">
              {isSurgeViolation ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              <span>Duration: <strong>{diffH.toFixed(1)}h</strong></span>
            </div>
            {hasSurgeData && (
              <span className="text-[11px] opacity-90">
                {isSurgeViolation ? `Surge limit: max ${surgeMax}h at this hour` : `OK — up to ${surgeMax}h allowed`}
              </span>
            )}
          </div>
        )}

        <div className="mb-6">
          <Label>Quick Presets</Label>
          <div className="flex gap-2 flex-wrap mt-1.5">
            {[1, 2, 3, 4].map(h => {
              const wouldViolate = hasSurgeData && h > surgeMax;
              return (
                <Button
                  key={h} variant="outline" size="sm" disabled={wouldViolate}
                  className={cn(
                    "font-[family-name:--font-mono]",
                    wouldViolate ? "opacity-40" : "",
                    !wouldViolate && h === Math.floor(diffH) ? "border-amber text-amber bg-amber/5" : ""
                  )}
                  onClick={() => {
                    const start = value.start || roundTo15(localNow(5));
                    onChange({ start, end: roundTo15(localPlus(start, h)) });
                  }}
                >
                  {h}h
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap p-3 bg-surface border border-border-dim rounded-[--radius-md] mb-5">
          <span className="text-[11px] text-text-label uppercase tracking-[0.08em] shrink-0 font-semibold">Heatmap Filters:</span>
          <select className={selectClasses} value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.building_name} · Fl {l.floor_number}</option>)}
          </select>
          <select className={selectClasses} value={filterNodeType} onChange={e => setFilterNodeType(e.target.value)}>
            <option value="">All Types</option>
            {Object.keys(NODE_ICON).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(filterLocation || filterNodeType) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterLocation(''); setFilterNodeType(''); }}>✕ Clear</Button>
          )}
        </div>

        {heatmapLoading ? (
          <div className="flex items-center gap-2.5 py-4 text-text-mid text-[12px] mb-5">
            <Loader2 className="w-4 h-4 animate-spin text-amber" /> Loading predicted load matrix…
          </div>
        ) : <SurgeHeatmap heatmap={heatmap} startISO={value.start} />}

        {isSurgeViolation && (
          <div className="flex gap-3 p-4 bg-red-2 border border-red/25 rounded-[--radius-md] mb-5">
            <AlertTriangle className="w-6 h-6 text-red shrink-0" />
            <div>
              <div className="font-[family-name:--font-heading] font-bold text-red text-[13px] mb-1">Surge Limit Active</div>
              <div className="text-[12px] text-text-hi leading-relaxed opacity-90">
                Predicted load is <strong className="text-red">{(startLoad * 100).toFixed(0)}%</strong> at your selected start time. Maximum allowed duration is <strong className="text-amber">{surgeMax} hour{surgeMax !== 1 ? 's' : ''}</strong>. Move your booking or reduce duration.
              </div>
            </div>
          </div>
        )}

        <Button className="w-full" size="lg" onClick={validate} disabled={isSurgeViolation}>
          {isSurgeViolation ? 'Resolve Surge Limit to Continue' : <>Next: Choose Location <ArrowRight className="w-4 h-4" /></>}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Step 2: Location Selection ─────────────────────────── */
function StepLocation({ value, onChange, onNext, onBack }) {
  const toast = useToast();
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    locationsAPI.list().then(setLocations).catch(err => toast.error('Failed to load', err.message)).finally(() => setLoading(false));
  }, [toast]);

  const buildings = useMemo(() => [...new Set(locations.map(l => l.building_name))], [locations]);
  const floors    = useMemo(() => {
    if (!value.building) return [];
    return [...new Set(locations.filter(l => l.building_name === value.building).map(l => l.floor_number))].sort((a, b) => a - b);
  }, [locations, value.building]);

  const resolvedLocation = useMemo(() => {
    if (!value.building || !value.floor) return null;
    return locations.find(l => l.building_name === value.building && l.floor_number === parseInt(value.floor, 10));
  }, [locations, value]);

  const selectClasses = "flex w-full rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-2.5 text-[13px] font-[family-name:--font-mono] text-text-hi outline-none focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)] cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%3E%3Cpath%20d=%27M0%200l5%206%205-6z%27%20fill=%27%2355608a%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_13px_center] pr-9";

  function validate() {
    setError('');
    if (!value.building) { setError('Please select a building.'); return; }
    if (!value.floor)    { setError('Please select a floor.'); return; }
    if (!resolvedLocation) { setError('No rooms found for this floor.'); return; }
    onNext(resolvedLocation.location_id);
  }

  if (loading) return <div className="flex items-center gap-2 text-text-mid"><Loader2 className="w-4 h-4 animate-spin" /> Loading locations…</div>;

  return (
    <Card className="max-w-[500px] animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-amber" /> Choose Location</CardTitle>
        <p className="text-[13px] text-text-mid mt-1">Select the building and floor to view the node grid.</p>
      </CardHeader>
      <CardContent>
        {error && <div className="bg-red-2 border border-red/25 rounded-[--radius-md] px-4 py-3 text-red text-[13px] mb-5">{error}</div>}

        <div className="mb-4">
          <Label>Building</Label>
          <select className={selectClasses} value={value.building} onChange={(e) => onChange({ building: e.target.value, floor: '' })}>
            <option value="">— Select building —</option>
            {buildings.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {value.building && (
          <div className="mb-5">
            <Label>Floor</Label>
            <div className="flex gap-2 flex-wrap mt-1">
              {floors.map(f => (
                <Button key={f} variant={value.floor === String(f) ? 'default' : 'outline'} onClick={() => onChange({ ...value, floor: String(f) })}>
                  Floor {f}
                </Button>
              ))}
            </div>
          </div>
        )}

        {resolvedLocation && (
          <div className="flex items-center gap-2 bg-green-2 border border-green/25 text-green p-3 rounded-[--radius-md] text-[13px] mb-6">
            <CheckCircle2 className="w-4 h-4" /> {resolvedLocation.building_name}, Floor {resolvedLocation.floor_number}, Room {resolvedLocation.room_number}
          </div>
        )}

        <div className="flex gap-3 mt-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back</Button>
          <Button className="flex-1" onClick={validate}>Next: View Node Grid <ArrowRight className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Step 3: Node Grid ──────────────────────────────────── */
function StepGrid({ timeWindow, locationId, locationLabel, onBack, onSuccess }) {
  const { user, isStudent } = useAuth();
  const toast = useToast();

  const [allNodes,       setAllNodes]       = useState([]);
  const [availableIds,   setAvailableIds]   = useState(new Set());
  const [loading,        setLoading]        = useState(true);
  const [selectedNode,   setSelectedNode]   = useState(null);
  const [booking,        setBooking]        = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);

  const startISO = toISO(timeWindow.start);
  const endISO   = toISO(timeWindow.end);

  useEffect(() => {
    setLoading(true); setSelectedNode(null);
    Promise.all([
      nodesAPI.atLocation(locationId),
      nodesAPI.available(startISO, endISO, locationId),
    ]).then(([all, available]) => {
      setAllNodes(all); setAvailableIds(new Set(available.map(n => n.node_id)));
    }).catch(err => toast.error('Failed to load', err.message)).finally(() => setLoading(false));
  }, [locationId, startISO, endISO, toast]);

  async function handleBook() {
    if (!selectedNode) return;
    setBooking(true);
    try {
      const res = await reservationsAPI.book({ user_id: user.user_id, node_id: selectedNode.node_id, start_time: startISO, end_time: endISO });
      setBookingSuccess({ ...res, node: selectedNode });
      toast.success('Booking confirmed!', `${selectedNode.node_name} is yours`);
    } catch (err) {
      if (err.status === 409) {
        if (err.message === 'user_conflict') toast.error('You already have a booking', 'Cancel existing reservation first.');
        else if (err.message.startsWith('surge_conflict:')) toast.error('Surge limit enforced', `Reduce window or pick quieter slot.`);
        else { toast.error('Taken', 'Another user just booked this.'); setSelectedNode(null); }
      } else toast.error('Failed', err.message);
    } finally { setBooking(false); }
  }

  if (loading) return <div className="flex items-center gap-2 text-text-mid"><Loader2 className="w-4 h-4 animate-spin" /> Scanning availability…</div>;

  if (bookingSuccess) {
    return (
      <Card className="max-w-[520px] animate-fade-up">
        <CardContent className="p-8 pt-10 text-center">
          <CheckCircle2 className="w-16 h-16 text-green mx-auto mb-4" />
          <h2 className="font-[family-name:--font-heading] text-2xl font-bold text-green mb-2">Booking Confirmed!</h2>
          <p className="text-text-mid text-[13px] mb-8">Reservation #{bookingSuccess.reservation_id} is locked in.</p>
          
          <div className="bg-surface rounded-[--radius-lg] border border-border-dim p-5 text-left mb-8">
            {[
              ['Node', bookingSuccess.node.node_name], ['Type', bookingSuccess.node.node_type],
              ['Location', locationLabel], ['From', new Date(timeWindow.start).toLocaleString('en-IN')],
              ['Until', new Date(timeWindow.end).toLocaleString('en-IN')]
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-border-dim last:border-0">
                <span className="text-[11px] text-text-low uppercase tracking-[0.08em]">{k}</span>
                <span className="text-[13px] font-medium">{v}</span>
              </div>
            ))}
          </div>
          <Button className="w-full" size="lg" onClick={onSuccess}>View My Bookings <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </CardContent>
      </Card>
    );
  }

  const visibleNodes = allNodes.filter(n => !(isStudent && n.access_level === 'Professor'));

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="font-[family-name:--font-heading] text-xl font-bold flex items-center gap-2"><Cpu className="w-5 h-5 text-amber" /> Node Grid</h2>
          <p className="text-text-mid text-[12px] mt-1">{locationLabel} · {visibleNodes.length} nodes shown</p>
        </div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-text-low"><div className="w-3 h-3 bg-surface border border-green/50 rounded-sm" /> Available</span>
          <span className="flex items-center gap-1.5 text-[11px] text-text-low"><div className="w-3 h-3 bg-[#16131f] border border-red/30 rounded-sm" /> In Use</span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5 mb-8">
        {visibleNodes.map(n => {
          const isAvail  = availableIds.has(n.node_id) && n.status === 'Available';
          const isSel    = selectedNode?.node_id === n.node_id;
          const isProf   = n.access_level === 'Professor';
          const NodeIcon = getNodeIcon(n.node_type);

          return (
            <div
              key={n.node_id}
              onClick={() => isAvail && setSelectedNode(n)}
              className={cn(
                "p-4 rounded-[--radius-md] border transition-all relative overflow-hidden select-none",
                !isAvail ? "bg-[#16131f] border-border-dim opacity-50 cursor-not-allowed" :
                isSel ? "bg-amber-2 border-amber/50 shadow-[0_0_20px_rgba(245,166,35,0.1)] cursor-default scale-[1.02]" :
                "bg-surface border-border-mid cursor-pointer hover:border-amber/40 hover:bg-elevated"
              )}
            >
              {isProf && <div className="absolute top-0 right-0 px-2 py-0.5 bg-violet-2 text-violet text-[9px] uppercase font-bold tracking-[0.05em] rounded-bl-[--radius-md]">Prof</div>}
              {isSel && <div className="absolute top-0 right-0 w-2 h-2 m-2 bg-amber rounded-full animate-pulse" />}
              
              <div className="flex items-center gap-2 mb-2">
                <NodeIcon className={cn("w-4 h-4", isSel ? "text-amber" : isAvail ? "text-green" : "text-text-low")} />
                <span className={cn("font-bold text-[14px]", isSel ? "text-amber" : "text-text-hi")}>{n.node_name}</span>
              </div>
              <div className="text-[11px] text-text-low uppercase tracking-[0.06em] flex justify-between">
                <span>{n.node_type}</span>
                {!isAvail ? <span className="text-red">In Use</span> : <span className="text-green opacity-60">Ready</span>}
              </div>
            </div>
          );
        })}
        {visibleNodes.length === 0 && <div className="col-span-full text-center py-12 text-text-mid border border-dashed border-border-mid rounded-[--radius-lg]">No nodes available for your access level here.</div>}
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        {selectedNode ? (
          <Card className="flex-[2] min-w-[300px]">
            <CardHeader className="py-4 border-b border-border-dim"><CardTitle className="text-sm">Hardware Specs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2">
                {selectedNode.hardware_specs && Object.entries(selectedNode.hardware_specs).map(([k, v]) => (
                  <div key={k} className="p-3 border-b border-r border-border-dim">
                    <div className="text-[10px] text-text-label uppercase tracking-[0.08em] mb-1">{k}</div>
                    <div className="text-[12px] text-text-hi font-medium truncate" title={v}>{v || '—'}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex-[2] min-w-[300px] border border-dashed border-border-mid rounded-[--radius-lg] flex items-center justify-center text-text-low text-[13px] min-h-[120px]">
            Select an available node to view specs
          </div>
        )}

        <div className="flex-1 min-w-[240px] flex flex-col gap-3">
          <Button size="lg" className="w-full text-[14px]" disabled={!selectedNode || booking} onClick={handleBook}>
            {booking ? <><Loader2 className="w-4 h-4 animate-spin" /> Provisioning…</> : 'Confirm Booking'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onBack}>← Back to Location</Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Wizard Component ──────────────────────────────── */
export default function BookingWizard({ onBookingComplete }) {
  const [step, setStep] = useState(1);
  const [maxDone, setMaxDone] = useState(0);

  const [timeWindow, setTimeWindow] = useState({ start: roundTo15(localNow(5)), end: roundTo15(localPlus(localNow(5), 2)) });
  const [locationSel, setLocationSel] = useState({ building: '', floor: '' });
  const [locationId, setLocationId] = useState(null);

  const [locationsCache, setLocationsCache] = useState([]);
  useEffect(() => { locationsAPI.list().then(setLocationsCache).catch(()=>{}); }, []);

  const resolvedLocName = useMemo(() => {
    if (!locationId || !locationsCache.length) return '';
    const l = locationsCache.find(x => x.location_id === locationId);
    return l ? `${l.building_name} · Floor ${l.floor_number}` : '';
  }, [locationId, locationsCache]);

  return (
    <div className="pb-10">
      <div className="mb-8 border-b border-border-dim pb-5">
        <h1 className="font-[family-name:--font-heading] text-[26px] font-extrabold flex items-center gap-2"><CircuitBoard className="w-6 h-6 text-amber" /> Provision Hardware</h1>
        <p className="text-[13px] text-text-mid mt-1">Reserve compute clusters, GPUs, and lab endpoints securely.</p>
      </div>

      <WizardSteps step={step} maxDone={maxDone} onGoTo={setStep} />

      {step === 1 && (
        <StepTime
          value={timeWindow} onChange={setTimeWindow}
          onNext={() => { setMaxDone(Math.max(maxDone, 1)); setStep(2); }}
        />
      )}
      {step === 2 && (
        <StepLocation
          value={locationSel} onChange={setLocationSel}
          onBack={() => setStep(1)}
          onNext={(locId) => { setLocationId(locId); setMaxDone(Math.max(maxDone, 2)); setStep(3); }}
        />
      )}
      {step === 3 && (
        <StepGrid
          timeWindow={timeWindow} locationId={locationId} locationLabel={resolvedLocName}
          onBack={() => setStep(2)} onSuccess={onBookingComplete}
        />
      )}
    </div>
  );
}