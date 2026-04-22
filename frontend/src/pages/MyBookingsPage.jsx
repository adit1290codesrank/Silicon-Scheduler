// src/pages/MyBookingsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { reservationsAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function formatDT(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duration(start, end) {
  const ms = new Date(end) - new Date(start);
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isUpcoming(end) {
  return new Date(end) > new Date();
}

const STATUS_CLASS = {
  Booked:    'badge-amber',
  Completed: 'badge-green',
  Cancelled: 'badge-red',
};

const NODE_ICON = {
  GPU:    '⬥',
  CPU:    '◈',
  FPGA:   '⬡',
  Server: '▪',
};

export default function MyBookingsPage({ onNavigateToBook }) {
  const { user } = useAuth();
  const toast = useToast();

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reservationsAPI.mine();
      setReservations(data);
    } catch (err) {
      toast.error('Failed to load bookings', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const upcoming = reservations.filter(
    r => r.status === 'Booked' && isUpcoming(r.end_time)
  );
  const past = reservations.filter(
    r => r.status !== 'Booked' || !isUpcoming(r.end_time)
  );

  const shown = tab === 'upcoming' ? upcoming : past;

  const totalHours = upcoming.reduce((acc, r) => {
    return acc + (new Date(r.end_time) - new Date(r.start_time)) / 3600000;
  }, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Bookings</h1>
          <p className="page-subtitle">Track all your hardware reservations, {user?.full_name?.split(' ')[0]}</p>
        </div>
        <button className="btn btn-primary" onClick={onNavigateToBook}>
          + Book Hardware
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card c-amber">
          <div className="stat-val">{upcoming.length}</div>
          <div className="stat-lbl">Active Bookings</div>
        </div>
        <div className="stat-card c-green">
          <div className="stat-val">{reservations.filter(r => r.status === 'Completed').length}</div>
          <div className="stat-lbl">Completed</div>
        </div>
        <div className="stat-card c-blue">
          <div className="stat-val">{totalHours.toFixed(1)}h</div>
          <div className="stat-lbl">Hours Booked</div>
        </div>
        <div className="stat-card c-red">
          <div className="stat-val">{reservations.filter(r => r.status === 'Cancelled').length}</div>
          <div className="stat-lbl">Cancelled</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === 'upcoming' ? ' active' : ''}`} onClick={() => setTab('upcoming')}>
          Upcoming ({upcoming.length})
        </button>
        <button className={`tab-btn${tab === 'past' ? ' active' : ''}`} onClick={() => setTab('past')}>
          Past & Cancelled ({past.length})
        </button>
      </div>

      {loading ? (
        <div className="loading-row"><span className="spinner" /> Loading reservations…</div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◫</div>
          <div className="empty-title">
            {tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
          </div>
          <div className="empty-sub" style={{ marginBottom: 20 }}>
            {tab === 'upcoming'
              ? 'Book a lab node to get started'
              : 'Your completed and cancelled reservations appear here'}
          </div>
          {tab === 'upcoming' && (
            <button className="btn btn-primary" onClick={onNavigateToBook}>Book Now</button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Node</th>
                <th>Type</th>
                <th>Location</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.reservation_id}>
                  <td style={{ color: 'var(--text-low)', fontSize: 11 }}>
                    #{r.reservation_id}
                  </td>
                  <td>
                    <span style={{ marginRight: 7 }}>
                      {NODE_ICON[r.node_type] || '◈'}
                    </span>
                    <strong>{r.node_name}</strong>
                  </td>
                  <td>
                    <span className="badge badge-muted">{r.node_type}</span>
                  </td>
                  <td>
                    {r.building_name
                      ? `${r.building_name} · Fl ${r.floor_number} · Rm ${r.room_number}`
                      : r.location_id || '—'}
                  </td>
                  <td>{formatDT(r.start_time)}</td>
                  <td>{formatDT(r.end_time)}</td>
                  <td style={{ color: 'var(--cyan)', fontWeight: 500 }}>
                    {duration(r.start_time, r.end_time)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[r.status] || 'badge-muted'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
