// src/pages/MyBookingsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { reservationsAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Separator } from '../components/ui/separator';
import { Plus, Loader2, Cpu, Server, Hexagon, CircuitBoard, Monitor } from 'lucide-react';

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

const STATUS_BADGE = {
  Booked:    'amber',
  Completed: 'green',
  Cancelled: 'red',
};

const NODE_ICON = {
  GPU:    Cpu,
  CPU:    CircuitBoard,
  FPGA:   Hexagon,
  Server: Server,
  Workstation: Monitor,
};

function NodeIcon({ type }) {
  const Icon = NODE_ICON[type] || Cpu;
  return <Icon className="w-3.5 h-3.5 text-text-low inline-block mr-1.5" />;
}

export default function MyBookingsPage({ onNavigateToBook }) {
  const { user } = useAuth();
  const toast = useToast();

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const totalHours = upcoming.reduce((acc, r) => {
    return acc + (new Date(r.end_time) - new Date(r.start_time)) / 3600000;
  }, 0);

  const stats = [
    { label: 'Active Bookings', value: upcoming.length, color: 'amber' },
    { label: 'Completed', value: reservations.filter(r => r.status === 'Completed').length, color: 'green' },
    { label: 'Hours Booked', value: `${totalHours.toFixed(1)}h`, color: 'blue' },
    { label: 'Cancelled', value: reservations.filter(r => r.status === 'Cancelled').length, color: 'red' },
  ];

  function renderTable(rows) {
    if (rows.length === 0) return null;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Node</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.reservation_id}>
              <TableCell className="text-text-low text-[11px]">#{r.reservation_id}</TableCell>
              <TableCell>
                <NodeIcon type={r.node_type} />
                <strong className="text-text-hi font-medium">{r.node_name}</strong>
              </TableCell>
              <TableCell>
                <Badge variant="muted">{r.node_type}</Badge>
              </TableCell>
              <TableCell>
                {r.building_name
                  ? `${r.building_name} · Fl ${r.floor_number} · Rm ${r.room_number}`
                  : r.location_id || '—'}
              </TableCell>
              <TableCell>{formatDT(r.start_time)}</TableCell>
              <TableCell>{formatDT(r.end_time)}</TableCell>
              <TableCell className="text-cyan font-medium">
                {duration(r.start_time, r.end_time)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[r.status] || 'muted'}>
                  {r.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7 pb-5 border-b border-border-dim">
        <div>
          <h1 className="font-[family-name:--font-heading] text-[26px] font-extrabold">My Bookings</h1>
          <p className="text-[13px] text-text-mid mt-0.5">
            Track all your hardware reservations, {user?.full_name?.split(' ')[0]}
          </p>
        </div>
        <Button onClick={onNavigateToBook}>
          <Plus className="w-4 h-4" />
          Book Hardware
        </Button>
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
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="mb-5">
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past & Cancelled ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-text-mid">
              <Loader2 className="w-4.5 h-4.5 animate-spin text-amber" />
              Loading reservations…
            </div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-16 text-text-low">
              <div className="text-4xl mb-3 opacity-40">◫</div>
              <div className="font-[family-name:--font-heading] text-base text-text-mid mb-1.5">
                No upcoming bookings
              </div>
              <div className="text-[12px] mb-5">Book a lab node to get started</div>
              <Button onClick={onNavigateToBook}>Book Now</Button>
            </div>
          ) : (
            renderTable(upcoming)
          )}
        </TabsContent>

        <TabsContent value="past">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-text-mid">
              <Loader2 className="w-4.5 h-4.5 animate-spin text-amber" />
              Loading reservations…
            </div>
          ) : past.length === 0 ? (
            <div className="text-center py-16 text-text-low">
              <div className="text-4xl mb-3 opacity-40">◫</div>
              <div className="font-[family-name:--font-heading] text-base text-text-mid mb-1.5">
                No past bookings
              </div>
              <div className="text-[12px]">Your completed and cancelled reservations appear here</div>
            </div>
          ) : (
            renderTable(past)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
