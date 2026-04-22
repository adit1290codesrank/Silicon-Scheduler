// src/pages/RegisterPage.jsx
import { useState } from 'react';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function RegisterPage({ onSwitchToLogin }) {
  const { login } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    roll_number: '',
    full_name:   '',
    email:       '',
    password:    '',
    confirm:     '',
    role:        'Student',     // Only 'Student' | 'Professor' — Admin is DB-only
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.roll_number.trim() || !form.full_name.trim() || !form.email.trim() || !form.password) {
      setError('All fields are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        roll_number: form.roll_number.trim(),
        full_name:   form.full_name.trim(),
        email:       form.email.trim().toLowerCase(),
        password:    form.password,
        role:        form.role,           // Always 'Student' or 'Professor'
      };
      const data = await authAPI.register(payload);
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
      toast.success('Account created!', `Welcome, ${data.full_name}`);
    } catch (err) {
      if (err.status === 409) {
        setError('An account with this roll number or email already exists.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
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

        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Register as a student or professor</p>

        {error && <div className="err-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="frow">
            <div className="fgroup">
              <label className="flabel">Roll Number</label>
              <input
                className="finput"
                type="text"
                placeholder="22CS101"
                value={form.roll_number}
                onChange={set('roll_number')}
                autoFocus
              />
            </div>
            <div className="fgroup">
              {/* ⚠️  CRITICAL: No 'Admin' option here.
                   Admins are created directly in the database. */}
              <label className="flabel">Role</label>
              <select className="fselect" value={form.role} onChange={set('role')}>
                <option value="Student">Student</option>
                <option value="Professor">Professor</option>
              </select>
            </div>
          </div>

          <div className="fgroup">
            <label className="flabel">Full Name</label>
            <input
              className="finput"
              type="text"
              placeholder="Ada Lovelace"
              value={form.full_name}
              onChange={set('full_name')}
            />
          </div>

          <div className="fgroup">
            <label className="flabel">University Email</label>
            <input
              className="finput"
              type="email"
              placeholder="ada@university.edu"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
            />
          </div>

          <div className="frow">
            <div className="fgroup">
              <label className="flabel">Password</label>
              <input
                className="finput"
                type="password"
                placeholder="Min. 8 chars"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
            </div>
            <div className="fgroup">
              <label className="flabel">Confirm Password</label>
              <input
                className="finput"
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={set('confirm')}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            type="submit"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <><span className="spinner" style={{ width: 15, height: 15 }} /> Creating account…</> : 'Create account →'}
          </button>
        </form>

        <p className="auth-footer">
          Already registered?{' '}
          <span className="auth-link" onClick={onSwitchToLogin}>Sign in</span>
        </p>
      </div>
    </div>
  );
}
