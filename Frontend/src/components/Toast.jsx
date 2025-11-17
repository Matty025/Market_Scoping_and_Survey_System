import React, { useEffect } from "react";
import "./Toast.css";

// Props:
// - type: 'success' | 'error' | 'info' | 'warning'
// - message: string
// - visible: boolean
// - onClose: function
// - duration: ms before auto-close (default 3000)
export default function Toast({ type = "info", message = "", visible = false, onClose, duration = 3000 }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      onClose && onClose();
    }, duration);
    return () => clearTimeout(t);
  }, [visible, duration, onClose]);

  if (!visible || !message) return null;

  return (
    <div className={`toast toast-${type}`} role="alert" aria-live="assertive" aria-atomic="true">
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}
