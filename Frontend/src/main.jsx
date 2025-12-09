import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./styles/responsive.css";
// Use the public `icons.svg` as the favicon (downloaded into `public/`).

function setFavicon(href) {
  try {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
    // Hint to browsers a larger preferred size so higher-res assets are chosen when available.
    try {
      if (typeof href === 'string') {
        if (href.endsWith('.png')) link.type = 'image/png';
        else if (href.endsWith('.svg')) link.type = 'image/svg+xml';
      }
    } catch (e) {}
    // Provide a size hint; browsers may ignore it but many will pick a higher-resolution source.
    link.sizes = '64x64';

    // Also set an apple-touch-icon to improve iOS shortcut appearance.
    let apple = document.querySelector("link[rel='apple-touch-icon']");
    if (!apple) {
      apple = document.createElement('link');
      apple.rel = 'apple-touch-icon';
      document.head.appendChild(apple);
    }
    apple.href = href;
    apple.sizes = '180x180';
  } catch (e) {
    // Non-fatal: don't block app startup if favicon fails
    // console.warn('Failed to set favicon', e);
  }
}

// Prefer the public PNG icon so it doesn't rely on bundling.
setFavicon('/icons.png');

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
