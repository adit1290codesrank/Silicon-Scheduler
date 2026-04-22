// src/pages/LoginPage.jsx
import { useState } from 'react';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function LoginPage({ onSwitchToRegister }) {
  const { login } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ roll_number: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.roll_number.trim() || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const data = await authAPI.login(form.roll_number, form.password);
      // Expected response: { user_id, full_name, email, role, roll_number, token }
      login(
        {
          user_id:     data.user_id,
          full_name:   data.full_name,
          email:       data.email,
          role:        data.role,
          roll_number: data.roll_number,
        },
        data.token
      );
      toast.success('Welcome back!', `Logged in as ${data.full_name}`);
    } catch (err) {
      if (err.status === 401) {
        setError('Invalid roll number or password.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">⬡</div>
          <span className="auth-brand-name">Silicon Scheduler</span>
        </div>

        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Access the lab hardware booking system</p>

        {error && <div className="err-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="fgroup">
            <label className="flabel">Roll Number</label>
            <input
              className="finput"
              type="text"
              placeholder="e.g. 22CS101"
              value={form.roll_number}
              onChange={set('roll_number')}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="fgroup">
            <label className="flabel">Password</label>
            <input
              className="finput"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={set('password')}
              autoComplete="current-password"
            />
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            type="submit"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <><span className="spinner" style={{ width: 15, height: 15 }} /> Signing in…</> : 'Sign in →'}
          </button>
        </form>

        <p className="auth-footer">
          No account?{' '}
          <span className="auth-link" onClick={onSwitchToRegister}>
            Register here
          </span>
        </p>
      </div>
    </div>
  );
}
