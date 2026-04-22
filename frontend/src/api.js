// src/api.js
// Centralised API client for Silicon Scheduler
// All endpoints map to the FastAPI backend at localhost:8000

const BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('ss_token');
}

async function request(method, path, body = null, params = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  }

  if (!res.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `HTTP ${res.status}: ${res.statusText}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  login:    (roll_number, password) =>
    request('POST', '/auth/login',    { roll_number, password }),

  register: (payload) =>
    request('POST', '/auth/register', payload),

  me: () =>
    request('GET', '/auth/me'),
};

// ── Reservations ──────────────────────────────────────────────
export const reservationsAPI = {
  mine: () =>
    request('GET', '/reservations/my'),

  all: (filters = {}) =>
    request('GET', '/reservations/all', null, filters),

  book: (payload) =>
    request('POST', '/book', payload),

  cancel: (reservation_id) =>
    request('DELETE', `/reservations/${reservation_id}`),
};

// ── Locations ─────────────────────────────────────────────────
export const locationsAPI = {
  list: () =>
    request('GET', '/locations'),
};

// ── Nodes ─────────────────────────────────────────────────────
export const nodesAPI = {
  atLocation: (location_id) =>
    request('GET', '/nodes', null, { location_id }),

  available: (start_time, end_time, location_id) =>
    request('GET', '/nodes/available', null,
      { start_time, end_time, ...(location_id ? { location_id } : {}) }),

  create: (payload) =>
    request('POST', '/admin/nodes', payload),

  delete: (node_id) =>
    request('DELETE', `/admin/nodes/${node_id}`),
};

// ── Users (Admin) ─────────────────────────────────────────────
export const usersAPI = {
  all: () =>
    request('GET', '/admin/users'),
};

// ── Admin Audit ───────────────────────────────────────────────
export const auditAPI = {
  run: () =>
    request('GET', '/admin/audit'),
};

// ── Predictive Load Heatmap ───────────────────────────────────
export const predictAPI = {
  /**
   * Fetches the 7×24 (168-cell) predicted load matrix.
   * Each cell: { day: 0-6, hour: 0-23, load: 0.0-1.0 }
   *
   * Optional filters:
   *   { location_id: number, node_type: string }
   * When omitted, backend returns the average across all combos.
   */
  heatmap: (filters = {}) => {
    const params = {};
    if (filters.location_id) params.location_id = filters.location_id;
    if (filters.node_type)   params.node_type   = filters.node_type;
    return request('GET', '/predict/heatmap', null,
      Object.keys(params).length ? params : null);
  },
};
