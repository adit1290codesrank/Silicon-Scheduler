// src/pages/RegisterPage.jsx
import { useState } from 'react';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Cpu, Loader2 } from 'lucide-react';

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
      <Card className="relative z-10 w-full max-w-[440px] mx-6 shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_24px_64px_rgba(0,0,0,0.6)] border-border-mid rounded-[--radius-xl] animate-fade-up">
        <CardContent className="p-10">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-[42px] h-[42px] bg-amber-3 border border-amber/30 rounded-[--radius-md] grid place-items-center">
              <Cpu className="w-5 h-5 text-amber" />
            </div>
            <span className="font-[family-name:--font-heading] text-[19px] font-extrabold text-text-hi tracking-tight">
              Silicon Scheduler
            </span>
          </div>

          <h1 className="font-[family-name:--font-heading] text-[28px] font-extrabold mb-1.5">
            Create account
          </h1>
          <p className="text-[13px] text-text-mid mb-7">
            Register as a student or professor
          </p>

          {error && (
            <div className="bg-red-2 border border-red/25 rounded-[--radius-md] px-4 py-3 text-red text-[13px] mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <Label htmlFor="reg_roll">Roll Number</Label>
                <Input
                  id="reg_roll"
                  type="text"
                  placeholder="22CS101"
                  value={form.roll_number}
                  onChange={set('roll_number')}
                  autoFocus
                />
              </div>
              <div>
                {/* ⚠️  CRITICAL: No 'Admin' option here.
                     Admins are created directly in the database. */}
                <Label htmlFor="reg_role">Role</Label>
                <select
                  id="reg_role"
                  className="flex w-full rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-2.5 text-[13px] font-[family-name:--font-mono] text-text-hi outline-none transition-[border-color,box-shadow] duration-200 focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)] cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%3E%3Cpath%20d=%27M0%200l5%206%205-6z%27%20fill=%27%2355608a%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_13px_center] pr-9"
                  value={form.role}
                  onChange={set('role')}
                >
                  <option value="Student">Student</option>
                  <option value="Professor">Professor</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <Label htmlFor="reg_name">Full Name</Label>
              <Input
                id="reg_name"
                type="text"
                placeholder="Ada Lovelace"
                value={form.full_name}
                onChange={set('full_name')}
              />
            </div>

            <div className="mt-4">
              <Label htmlFor="reg_email">University Email</Label>
              <Input
                id="reg_email"
                type="email"
                placeholder="ada@university.edu"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5 mt-4">
              <div>
                <Label htmlFor="reg_pw">Password</Label>
                <Input
                  id="reg_pw"
                  type="password"
                  placeholder="Min. 8 chars"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label htmlFor="reg_pw2">Confirm Password</Label>
                <Input
                  id="reg_pw2"
                  type="password"
                  placeholder="••••••••"
                  value={form.confirm}
                  onChange={set('confirm')}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-6"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create account →'
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-[12px] text-text-mid">
            Already registered?{' '}
            <span
              className="text-amber cursor-pointer font-medium hover:underline"
              onClick={onSwitchToLogin}
            >
              Sign in
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
