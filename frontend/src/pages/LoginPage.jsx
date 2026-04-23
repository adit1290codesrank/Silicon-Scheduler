// src/pages/LoginPage.jsx
import { useState } from 'react';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Cpu, Loader2 } from 'lucide-react';

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
            Sign in
          </h1>
          <p className="text-[13px] text-text-mid mb-7">
            Access the lab hardware booking system
          </p>

          {error && (
            <div className="bg-red-2 border border-red/25 rounded-[--radius-md] px-4 py-3 text-red text-[13px] mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="roll_number">Roll Number</Label>
                <Input
                  id="roll_number"
                  type="text"
                  placeholder="e.g. 22CS101"
                  value={form.roll_number}
                  onChange={set('roll_number')}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="current-password"
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
                  Signing in…
                </>
              ) : (
                'Sign in →'
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-[12px] text-text-mid">
            No account?{' '}
            <span
              className="text-amber cursor-pointer font-medium hover:underline"
              onClick={onSwitchToRegister}
            >
              Register here
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
