// In your ../../components/Toast.jsx file

import React, { useEffect } from "react";
import "./Toast.css";

// ----------------------------------------------------
// Step 1: Define a way to manage toast visibility globally
// This is a placeholder/conceptual utility.
// In a real app, this would use a React Context or a State Hook 
// high up in your component tree to manage an array of visible toasts.
// ----------------------------------------------------
const toastManager = {
    show: (message, type) => {
        // You must implement the global state change here 
        // to make the default exported Toast component appear.
        console.warn(`TOAST_MANAGER: Must implement state logic to show ${type} toast: ${message}`);
        // If you install react-hot-toast, you'd use: 
        // toast[type](message); 
    }
};

// ----------------------------------------------------
// Step 2: The React Toast Component (Default Export - Unchanged)
// This component renders a single toast based on its props.
// ----------------------------------------------------

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


// ----------------------------------------------------
// Step 3: Define and export the utility functions (THE FIX)
// These functions use the toastManager to trigger the display.
// ----------------------------------------------------
export const success = (message) => toastManager.show(message, 'success');
export const error = (message) => toastManager.show(message, 'error');
export const info = (message) => toastManager.show(message, 'info');
export const warning = (message) => toastManager.show(message, 'warning');