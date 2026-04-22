// src/pages/BookingWizard.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { locationsAPI, nodesAPI, reservationsAPI, predictAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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
  'Server':        '▪',
  'GPU Node':      '⬥',
  'FPGA':          '⬡',
  'Cluster':       '⬢',
  'Supercomputer': '⚡',
  'Workstation':   '◉',
};

function getNodeIcon(type) {
  return NODE_ICON[type] || '◈';
}

/* ── Surge Logic ────────────────────────────────────────── */
function getSurgeMax(load) {
  if (load > 0.80) return 1;
  if (load > 0.50) return 4;
  return 8;
}

function surgeColour(load) {
  if (load > 0.80) return 'var(--red)';
  if (load > 0.50) return 'var(--amber)';
  return 'var(--green)';
}

function heatmapCellBg(load) {
  // Cap between 0 and 1
  const safeLoad = Math.min(Math.max(load, 0), 1);
  // Hue 120 = Green, Hue 0 = Red
  const hue = (1 - safeLoad) * 120;
  // Increase opacity dynamically
  const alpha = 0.15 + (safeLoad * 0.7);
  return `hsla(${hue}, 85%, 50%, ${alpha.toFixed(2)})`;
}

function surgeTierLabel(load) {
  if (load > 0.80) return 'HIGH SURGE';
  if (load > 0.50) return 'MODERATE';
  return 'NORMAL';
}

// ALIGNMENT FIX: Start with Monday to match Backend ISO-DOW 1-7
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

  return (
    <div className="fgroup">
      <label className="flabel">{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="date"
          className="finput"
          style={{ flex: '2 1 130px', minWidth: 0 }}
          value={date}
          min={minDate || TODAY}
          onChange={e => update(e.target.value, hour, minute, period)}
        />
        <select
          className="fselect"
          style={{ flex: '1 1 58px', minWidth: 0, paddingRight: 8 }}
          value={hour}
          onChange={e => update(date, e.target.value, minute, period)}
        >
          {HOURS.map(h => (
            <option key={h} value={String(h)}>{String(h).padStart(2, '0')}</option>
          ))}
        </select>
        <select
          className="fselect"
          style={{ flex: '1 1 58px', minWidth: 0, paddingRight: 8 }}
          value={minute}
          onChange={e => update(date, hour, e.target.value, period)}
        >
          {MINUTES.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          className="fselect"
          style={{ flex: '1 1 58px', minWidth: 0, paddingRight: 8 }}
          value={period}
          onChange={e => update(date, hour, minute, e.target.value)}
        >
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

  // Convert JS getDay (0=Sun) to ISO Day (7=Sun)
  const jsDay = startISO ? new Date(startISO).getDay() : -1;
  const activeIsoDay = jsDay === 0 ? 7 : jsDay;
  const activeHour = startISO ? new Date(startISO).getHours() : -1;

  if (!heatmap || heatmap.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 10,
        flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 500 }}>
          Predicted Load Heatmap (7 × 24)
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {[
            { label: 'Normal ≤50%',  color: 'hsla(120, 85%, 50%, 0.3)' },
            { label: 'Surge 50-80%', color: 'hsla(35, 85%, 50%, 0.6)' },
            { label: 'High >80%',    color: 'hsla(0, 85%, 50%, 0.9)' },
          ].map(({ label, color }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-mid)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', border: '1px solid rgba(255,255,255,0.08)' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-dim)' }}>
        <div style={{ minWidth: 420 }}>
          {/* Day header */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-dim)' }}>
            <div />
            {DAY_LABELS.map((d, idx) => (
              <div key={d} style={{
                textAlign: 'center', padding: '6px 0', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: (idx + 1) === activeIsoDay ? 'var(--amber)' : 'var(--text-label)',
              }}>{d}</div>
            ))}
          </div>

          {/* 24 hour rows */}
          {HOUR_LABELS.map((hlabel, hour) => (
            <div key={hour} style={{
              display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)',
              borderBottom: hour < 23 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                paddingRight: 6, fontSize: 9, userSelect: 'none', letterSpacing: '0.04em',
                color: hour === activeHour ? 'var(--amber)' : 'var(--text-low)',
                fontWeight: hour === activeHour ? 700 : 400,
              }}>
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
                    style={{
                      height: 14,
                      background: isActive ? 'transparent' : heatmapCellBg(load),
                      outline: isActive ? '2px solid var(--amber)' : 'none',
                      outlineOffset: '-1px',
                      position: 'relative',
                      cursor: 'default',
                      transition: 'background 0.2s',
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-low)', marginTop: 6, lineHeight: 1.5 }}>
        Highlighted cell = your selected start time. Red = higher predicted load = shorter max duration.
      </p>
    </div>
  );
}

/* ── Step indicators ───────────────────────────────────── */
function WizardSteps({ step, maxDone, onGoTo }) {
  const steps = [
    { num: 1, label: 'Time Window' },
    { num: 2, label: 'Location'    },
    { num: 3, label: 'Select Node' },
  ];
  return (
    <div className="wizard-steps">
      {steps.map((s, i) => {
        const isActive = step === s.num;
        const isDone   = s.num < step && s.num <= maxDone;
        return (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              className={`wstep${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
              onClick={isDone ? () => onGoTo(s.num) : undefined}
            >
              <span className="wstep-num">{isDone ? '✓' : s.num}</span>
              <span className="wstep-lbl">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="wstep-connector" />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Time Selection ─────────────────────────────── */
function StepTime({ value, onChange, onNext }) {
  const [error, setError] = useState('');

  // ── Heatmap state — owned here, refetched when filters change ──
  const [heatmap,        setHeatmap]        = useState(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterNodeType, setFilterNodeType] = useState('');
  const [locations,      setLocations]      = useState([]);

  // Load locations once for the filter dropdown
  useEffect(() => {
    locationsAPI.list()
      .then(setLocations)
      .catch(() => {});
  }, []);

  // Re-fetch heatmap whenever a filter changes
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

  // Build lookup from heatmap data
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

  const diffH = value.start && value.end
    ? (new Date(value.end) - new Date(value.start)) / 3600000
    : 0;

  const isSurgeViolation = diffH > 0 && diffH > surgeMax;
  const hasSurgeData     = heatmap && heatmap.length > 0;
  const tierLabel        = hasSurgeData ? surgeTierLabel(startLoad) : null;
  const tierColour       = hasSurgeData ? surgeColour(startLoad) : 'var(--cyan)';

  function validate() {
    setError('');
    if (!value.start || !value.end) {
      setError('Please select both start and end times.');
      return;
    }
    const s = new Date(value.start);
    const e = new Date(value.end);
    if (s <= new Date()) { setError('Start time must be in the future.'); return; }
    if (e <= s)          { setError('End time must be after start time.'); return; }
    const durH = (e - s) / 3600000;
    if (durH < 0.5) { setError('Minimum booking duration is 30 minutes.'); return; }
    if (hasSurgeData && durH > surgeMax) {
      setError(
        `Surge limit active: max booking is ${surgeMax}h at this time ` +
        `(predicted load ${(startLoad * 100).toFixed(0)}%). ` +
        `Reduce your end time or pick a lower-demand slot.`
      );
      return;
    }
    if (durH > 12) { setError('Maximum booking duration is 12 hours.'); return; }
    onNext();
  }

  return (
    <div className="card" style={{ maxWidth: 580 }}>
      <div className="card-hd">
        <span className="card-title">📅 Select Time Window</span>
        {hasSurgeData && (
          <span className="badge" style={{
            background: startLoad > 0.80 ? 'var(--red-2)' : startLoad > 0.50 ? 'var(--amber-2)' : 'var(--green-2)',
            color:      surgeColour(startLoad),
            border:     `1px solid ${surgeColour(startLoad)}44`,
            fontSize: 10,
          }}>
            {tierLabel}
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Choose when you need the hardware. The system uses B-Tree indexed availability checks — results are instant.
      </p>

      {error && <div className="err-box">{error}</div>}

      <DateTimePicker
        label="Start Time"
        value={value.start}
        minDate={TODAY}
        onChange={(newStart) =>
          onChange({ start: newStart, end: roundTo15(localPlus(newStart, 2)) })
        }
      />

      <DateTimePicker
        label="End Time"
        value={value.end}
        minDate={value.start ? value.start.split('T')[0] : TODAY}
        onChange={(newEnd) => onChange({ ...value, end: newEnd })}
      />

      {/* Duration indicator */}
      {diffH > 0 && (
        <div style={{
          padding: '10px 14px',
          background: isSurgeViolation ? 'var(--red-2)' : 'var(--cyan-2)',
          border:     `1px solid ${isSurgeViolation ? 'rgba(245,83,90,0.25)' : 'rgba(56,232,208,0.2)'}`,
          borderRadius: 'var(--r-md)',
          color: isSurgeViolation ? 'var(--red)' : 'var(--cyan)',
          fontSize: 13,
          marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, flexWrap: 'wrap',
        }}>
          <span>
            {isSurgeViolation ? '⚡' : '⏱'} Duration:{' '}
            <strong>{diffH.toFixed(1)}h</strong>
          </span>
          {hasSurgeData && (
            <span style={{ fontSize: 11, opacity: 0.9 }}>
              {isSurgeViolation
                ? `Surge limit: max ${surgeMax}h at this hour`
                : `OK — up to ${surgeMax}h allowed`}
            </span>
          )}
        </div>
      )}

      {/* Quick duration presets */}
      <div style={{ marginBottom: 20 }}>
        <span style={{
          fontSize: 11, color: 'var(--text-label)', textTransform: 'uppercase',
          letterSpacing: '0.08em', display: 'block', marginBottom: 8,
        }}>
          Quick Presets
        </span>
        <div className="gap-row">
          {[1, 2, 3, 4].map(h => {
            const wouldViolate = hasSurgeData && h > surgeMax;
            return (
              <button
                key={h}
                className="btn btn-sm btn-ghost"
                disabled={wouldViolate}
                title={wouldViolate ? `Surge limit: max ${surgeMax}h` : `Book for ${h} hour${h > 1 ? 's' : ''}`}
                style={{
                  opacity: wouldViolate ? 0.35 : 1,
                  cursor:  wouldViolate ? 'not-allowed' : 'pointer',
                  borderColor: !wouldViolate && h === Math.floor(diffH) ? 'var(--amber)' : undefined,
                  color:       !wouldViolate && h === Math.floor(diffH) ? 'var(--amber)' : undefined,
                }}
                onClick={() => {
                  const start = value.start || roundTo15(localNow(5));
                  onChange({ start, end: roundTo15(localPlus(start, h)) });
                }}
              >
                {h}h
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Heatmap filter controls ── */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        flexWrap: 'wrap', marginBottom: 12,
        padding: '10px 14px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-dim)',
        borderRadius: 'var(--r-md)',
      }}>
        <span style={{
          fontSize: 11, color: 'var(--text-label)', textTransform: 'uppercase',
          letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Filter heatmap:
        </span>
        <select
          className="fselect"
          style={{ flex: '1 1 150px', minWidth: 120 }}
          value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
        >
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.location_id} value={l.location_id}>
              {l.building_name} · Fl {l.floor_number} · Rm {l.room_number}
            </option>
          ))}
        </select>
        <select
          className="fselect"
          style={{ flex: '1 1 120px', minWidth: 100 }}
          value={filterNodeType}
          onChange={e => setFilterNodeType(e.target.value)}
        >
          <option value="">All Types</option>
          {Object.keys(NODE_ICON).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(filterLocation || filterNodeType) && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => { setFilterLocation(''); setFilterNodeType(''); }}
            style={{ flexShrink: 0 }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Heatmap */}
      {heatmapLoading ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 0', color: 'var(--text-low)', fontSize: 12, marginBottom: 20,
        }}>
          <span className="spinner" style={{ width: 14, height: 14 }} />
          {filterLocation || filterNodeType
            ? 'Updating heatmap for selected filter…'
            : 'Loading predicted load matrix…'}
        </div>
      ) : (
        <SurgeHeatmap heatmap={heatmap} startISO={value.start} />
      )}

      {/* Surge warning banner */}
      {isSurgeViolation && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--red-2)', border: '1px solid rgba(245,83,90,0.3)',
          borderRadius: 'var(--r-md)', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
          <div>
            <div style={{ fontFamily: 'var(--font-h)', fontWeight: 700, color: 'var(--red)', fontSize: 13, marginBottom: 3 }}>
              Surge Limit Active
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>
              Predicted load is <strong style={{ color: 'var(--red)' }}>{(startLoad * 100).toFixed(0)}%</strong>{' '}
              at your selected start time. Maximum allowed duration is{' '}
              <strong style={{ color: 'var(--amber)' }}>{surgeMax} hour{surgeMax !== 1 ? 's' : ''}</strong>.
              Move your booking to a quieter slot or reduce the duration.
            </div>
          </div>
        </div>
      )}

      <button
        className="btn btn-primary btn-full"
        onClick={validate}
        disabled={isSurgeViolation}
        style={{ opacity: isSurgeViolation ? 0.5 : 1, cursor: isSurgeViolation ? 'not-allowed' : 'pointer' }}
      >
        {isSurgeViolation ? '⚡ Resolve Surge Limit to Continue' : 'Next: Choose Location →'}
      </button>
    </div>
  );
}

/* ── Step 2: Location Selection ─────────────────────────── */
function StepLocation({ value, onChange, onNext, onBack }) {
  const toast = useToast();
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await locationsAPI.list();
        setLocations(data);
      } catch (err) {
        toast.error('Failed to load locations', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const buildings = useMemo(() => [...new Set(locations.map(l => l.building_name))], [locations]);
  const floors    = useMemo(() => {
    if (!value.building) return [];
    return [...new Set(
      locations
        .filter(l => l.building_name === value.building)
        .map(l => l.floor_number)
    )].sort((a, b) => a - b);
  }, [locations, value.building]);

  const resolvedLocation = useMemo(() => {
    if (!value.building || !value.floor) return null;
    return locations.find(
      l => l.building_name === value.building && l.floor_number === parseInt(value.floor, 10)
    );
  }, [locations, value]);

  function validate() {
    setError('');
    if (!value.building)   { setError('Please select a building.'); return; }
    if (!value.floor)      { setError('Please select a floor.'); return; }
    if (!resolvedLocation) { setError('No rooms found for this floor.'); return; }
    onNext(resolvedLocation.location_id);
  }

  if (loading) return <div className="loading-row"><span className="spinner" /> Loading locations…</div>;

  return (
    <div className="card" style={{ maxWidth: 500 }}>
      <div className="card-hd">
        <span className="card-title">📍 Choose Location</span>
      </div>
      <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Select the building and floor. The grid will show every lab node in that area.
      </p>

      {error && <div className="err-box">{error}</div>}

      <div className="fgroup">
        <label className="flabel">Building</label>
        <select
          className="fselect"
          value={value.building}
          onChange={(e) => onChange({ building: e.target.value, floor: '' })}
        >
          <option value="">— Select building —</option>
          {buildings.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {value.building && (
        <div className="fgroup">
          <label className="flabel">Floor</label>
          <div className="gap-row" style={{ marginTop: 2 }}>
            {floors.map(f => (
              <button
                key={f}
                className={`btn btn-sm ${value.floor === String(f) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onChange({ ...value, floor: String(f) })}
              >
                Floor {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {resolvedLocation && (
        <div style={{
          padding: '10px 14px', background: 'var(--green-2)',
          border: '1px solid rgba(47,214,122,0.2)', borderRadius: 'var(--r-md)',
          color: 'var(--green)', fontSize: 12, marginBottom: 20,
        }}>
          ✓ {resolvedLocation.building_name}, Floor {resolvedLocation.floor_number}, Room {resolvedLocation.room_number}
        </div>
      )}

      <div className="gap-row" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={validate}>
          Next: View Node Grid →
        </button>
      </div>
    </div>
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
    (async () => {
      setLoading(true);
      setSelectedNode(null);
      try {
        const [all, available] = await Promise.all([
          nodesAPI.atLocation(locationId),
          nodesAPI.available(startISO, endISO, locationId),
        ]);
        setAllNodes(all);
        setAvailableIds(new Set(available.map(n => n.node_id)));
      } catch (err) {
        toast.error('Failed to load node grid', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId, startISO, endISO, toast]);

  async function handleBook() {
    if (!selectedNode) return;
    setBooking(true);
    try {
      const res = await reservationsAPI.book({
        user_id:    user.user_id,
        node_id:    selectedNode.node_id,
        start_time: startISO,
        end_time:   endISO,
      });
      setBookingSuccess({ ...res, node: selectedNode });
      toast.success('Booking confirmed!', `${selectedNode.node_name} is yours`);
    } catch (err) {
      const detail = err.message || '';
      if (err.status === 409) {
        if (detail === 'user_conflict') {
          toast.error(
            'You already have a booking',
            'You cannot reserve multiple nodes at the same time. Cancel your existing reservation first.'
          );
        } else if (detail.startsWith('surge_conflict:')) {
          const maxH = detail.split(':')[1] || '?';
          toast.error(
            'Surge limit enforced by server',
            `This time slot allows a maximum of ${maxH}h due to high predicted demand. ` +
            `Reduce your booking window or choose a quieter slot.`
          );
        } else {
          toast.error('Hardware just taken', 'Another user booked this node just now. Pick a different one.');
          const available = await nodesAPI.available(startISO, endISO, locationId).catch(() => []);
          setAvailableIds(new Set(available.map(n => n.node_id)));
          setSelectedNode(null);
        }
      } else {
        toast.error('Booking failed', err.message);
      }
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" /> Scanning node availability…</div>;

  if (bookingSuccess) {
    return (
      <div className="card" style={{ maxWidth: 520, animation: 'fadeUp 0.3s ease both' }}>
        <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-h)', fontSize: 24, marginBottom: 8, color: 'var(--green)' }}>
            Booking Confirmed!
          </h2>
          <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 24 }}>
            Reservation #{bookingSuccess.reservation_id} is locked in.
          </p>
        </div>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--r-lg)', padding: 20, marginBottom: 20 }}>
          {[
            ['Node',     bookingSuccess.node.node_name],
            ['Type',     bookingSuccess.node.node_type],
            ['Location', locationLabel],
            ['From',     new Date(timeWindow.start).toLocaleString()],
            ['Until',    new Date(timeWindow.end).toLocaleString()],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-dim)' }}>
              <span style={{ color: 'var(--text-low)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k}</span>
              <span style={{ color: 'var(--text-hi)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-full" onClick={onSuccess}>View My Bookings →</button>
      </div>
    );
  }

  const visibleNodes = allNodes.filter(n => {
    if (isStudent && n.access_level === 'Professor') return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Node Grid</h2>
          <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 2 }}>
            {locationLabel} · {visibleNodes.length} node{visibleNodes.length !== 1 ? 's' : ''} shown
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Available', dot: 'var(--cyan)' },
            { label: 'Booked',    dot: 'var(--text-low)' },
            { label: 'Selected',  dot: 'var(--amber)' },
            ...(!isStudent ? [{ label: 'Prof Only', dot: 'var(--violet)' }] : []),
          ].map(({ label, dot }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-mid)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {visibleNodes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◫</div>
          <div className="empty-title">No nodes at this location</div>
          <div className="empty-sub" style={{ marginBottom: 16 }}>Try a different floor or building</div>
          <button className="btn btn-ghost" onClick={onBack}>← Go Back</button>
        </div>
      ) : (
        <>
          <div className="node-grid">
            {visibleNodes.map(node => {
              const isAvailable = availableIds.has(node.node_id) && node.status === 'Available';
              const isBooked    = !isAvailable && node.status === 'Available';
              const isProfOnly  = node.access_level === 'Professor';
              const isOffline   = node.status !== 'Available';
              const isSelected  = selectedNode?.node_id === node.node_id;

              let cellClass = 'node-cell';
              if (isSelected)     cellClass += ' selected';
              else if (isBooked)  cellClass += ' unavail';
              else if (isOffline) cellClass += ' offline-cell';

              return (
                <div
                  key={node.node_id}
                  className={cellClass}
                  onClick={isAvailable ? () => setSelectedNode(isSelected ? null : node) : undefined}
                  title={
                    isOffline  ? `${node.status}` :
                    isBooked   ? 'Booked in this window' :
                    isProfOnly ? 'Professor access' :
                    node.node_name
                  }
                >
                  {isProfOnly && !isStudent && (
                    <span className="node-cell-lock">🔒</span>
                  )}
                  <div className="node-cell-icon">{getNodeIcon(node.node_type)}</div>
                  <div className="node-cell-name">{node.node_name}</div>
                  <div className="node-cell-type">{node.node_type}</div>
                  <div className="node-cell-badge">
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: isSelected ? 'var(--amber)'
                                : isOffline  ? 'var(--red)'
                                : isBooked   ? 'var(--text-low)'
                                : 'var(--green)',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {selectedNode && (
            <div className="node-detail-panel">
              <div className="node-detail-hd">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 28 }}>{getNodeIcon(selectedNode.node_type)}</span>
                    <div>
                      <h3 style={{ fontSize: 20, fontWeight: 800 }}>{selectedNode.node_name}</h3>
                      <div className="gap-row" style={{ marginTop: 4 }}>
                        <span className="badge badge-cyan">{selectedNode.node_type}</span>
                        {selectedNode.access_level === 'Professor' && (
                          <span className="badge badge-violet">Prof Access</span>
                        )}
                        <span className="badge badge-green">Available</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button className="modal-close" onClick={() => setSelectedNode(null)}>×</button>
              </div>

              <div className="specs-grid">
                {Object.entries(selectedNode.hardware_specs || {}).map(([key, val]) => (
                  <div key={key} className="spec-item">
                    <div className="spec-key">{key.replace(/_/g, ' ')}</div>
                    <div className="spec-val">{String(val)}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 18, fontSize: 13, color: 'var(--text-mid)' }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <span>🕐 <strong style={{ color: 'var(--text-hi)' }}>
                    {new Date(timeWindow.start).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </strong></span>
                  <span>→</span>
                  <span>🕐 <strong style={{ color: 'var(--text-hi)' }}>
                    {new Date(timeWindow.end).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </strong></span>
                  <span style={{ color: 'var(--cyan)' }}>⏱ {((new Date(timeWindow.end) - new Date(timeWindow.start)) / 3600000).toFixed(1)}h</span>
                </div>
              </div>

              <div className="gap-row">
                <button className="btn btn-ghost" onClick={() => setSelectedNode(null)}>Deselect</button>
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1 }}
                  onClick={handleBook}
                  disabled={booking}
                >
                  {booking
                    ? <><span className="spinner" style={{ width: 15, height: 15 }} /> Confirming…</>
                    : `Confirm Booking — ${selectedNode.node_name}`}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back to Location</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Root Wizard ────────────────────────────────────────── */
export default function BookingWizard({ onBookingComplete }) {
  const [step,    setStep]    = useState(1);
  const [maxDone, setMaxDone] = useState(0);

  const [timeWindow,  setTimeWindow]  = useState({
    start: roundTo15(localNow(5)),
    end:   roundTo15(localNow(125)),
  });
  const [locationSel, setLocationSel] = useState({ building: '', floor: '' });
  const [locationId,  setLocationId]  = useState(null);
  const [locationLbl, setLocationLbl] = useState('');

  function goTo(n) {
    if (n <= maxDone + 1) setStep(n);
  }

  function nextFromStep1() {
    setMaxDone(m => Math.max(m, 1));
    setStep(2);
  }

  function nextFromStep2(locId) {
    setLocationId(locId);
    const { building, floor } = locationSel;
    setLocationLbl(`${building} · Floor ${floor}`);
    setMaxDone(m => Math.max(m, 2));
    setStep(3);
  }

  return (
    <div className="wizard-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Book Hardware</h1>
          <p className="page-subtitle">Reserve lab compute nodes in 3 steps</p>
        </div>
      </div>

      <WizardSteps step={step} maxDone={maxDone} onGoTo={goTo} />

      {step === 1 && (
        <StepTime
          value={timeWindow}
          onChange={setTimeWindow}
          onNext={nextFromStep1}
        />
      )}

      {step === 2 && (
        <StepLocation
          value={locationSel}
          onChange={setLocationSel}
          onNext={nextFromStep2}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <StepGrid
          timeWindow={timeWindow}
          locationId={locationId}
          locationLabel={locationLbl}
          onBack={() => setStep(2)}
          onSuccess={onBookingComplete}
        />
      )}
    </div>
  );
}