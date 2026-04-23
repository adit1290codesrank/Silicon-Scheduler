// src/components/Layout.jsx
import { useAuth } from '../context/AuthContext';
import { Cpu, CalendarDays, Shield, LogOut } from 'lucide-react';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';

const NAV_ICONS = {
  book: Cpu,
  bookings: CalendarDays,
  admin: Shield,
};

const ROLE_BADGE = {
  Admin: 'red',
  Professor: 'violet',
  Student: 'cyan',
};

export default function Layout({ children, activePage, onNavigate }) {
  const { user, logout, isAdmin } = useAuth();

  const initials = user?.full_name
    ?.split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const navItems = [
    { id: 'book',     label: 'Book Hardware', show: true },
    { id: 'bookings', label: 'My Bookings',   show: !isAdmin },
    { id: 'admin',    label: 'Admin Panel',   show: isAdmin },
  ].filter(i => i.show);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[230px] shrink-0 bg-base border-r border-border-dim flex flex-col fixed inset-y-0 left-0 z-50 overflow-y-auto">
          {/* Brand */}
          <div className="px-4 py-5 border-b border-border-dim flex items-center gap-3">
            <div className="w-[34px] h-[34px] bg-amber-3 border border-amber/25 rounded-[--radius-sm] grid place-items-center shrink-0">
              <Cpu className="w-4 h-4 text-amber" />
            </div>
            <div>
              <div className="font-[family-name:--font-heading] text-[15px] font-extrabold text-text-hi tracking-tight leading-tight">
                Silicon<br/>Scheduler
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 flex flex-col gap-0.5">
            <span className="text-[10px] text-text-low uppercase tracking-[0.1em] px-2.5 pt-3 pb-1.5">
              Navigation
            </span>
            {navItems.map(item => {
              const Icon = NAV_ICONS[item.id];
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-[--radius-md] text-[13px] font-[family-name:--font-mono]",
                    "cursor-pointer border border-transparent transition-all duration-150 w-full text-left",
                    isActive
                      ? "bg-amber-2 text-amber border-amber/20"
                      : "text-text-mid hover:bg-surface hover:text-text-hi"
                  )}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-border-dim">
            <div className="flex items-center gap-2.5 p-2 rounded-[--radius-md] bg-surface border border-border-dim">
              <div className="w-[30px] h-[30px] rounded-full bg-amber-2 border border-amber/25 grid place-items-center text-[12px] text-amber font-bold shrink-0 font-[family-name:--font-heading]">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-[family-name:--font-heading] text-[12px] text-text-hi font-semibold truncate">
                  {user?.full_name || 'User'}
                </div>
                <Badge variant={ROLE_BADGE[user?.role] || 'muted'} className="mt-0.5 text-[8px] px-1.5 py-0">
                  {user?.role}
                </Badge>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="text-text-low hover:text-red p-1 rounded-[--radius-sm] transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="ml-[230px] flex-1 p-9 max-w-[calc(100%-230px)]">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
