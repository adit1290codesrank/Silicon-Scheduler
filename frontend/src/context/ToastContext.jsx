// src/context/ToastContext.jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const addToast = useCallback(({ type = 'info', title, message, duration = 4500 }) => {
    const id = ++nextId.current;
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
  }, []);

  // Convenience helpers
  const toast = {
    success: (title, message) => addToast({ type: 'success', title, message }),
    error:   (title, message) => addToast({ type: 'error',   title, message, duration: 6000 }),
    warning: (title, message) => addToast({ type: 'warning', title, message }),
    info:    (title, message) => addToast({ type: 'info',    title, message }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-host">
        {toasts.map(t => (
          <div key={t.id} className={`toast t-${t.type}${t.leaving ? ' leaving' : ''}`}>
            <span className="toast-icon">{ICONS[t.type]}</span>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg">{t.message}</div>}
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}
