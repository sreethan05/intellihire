// Socket.IO endpoint shared by the notification, proctoring, and admin feeds.
//
// Production / same-origin deployments rely on the page origin; in dev the
// Vite server proxies both `/api` and `/socket.io` to the backend, so using
// the page origin keeps cookies and the proxy in play. Hardcoding
// `http://localhost:5000` broke the socket whenever the client ran on a
// different port (or a different host entirely).
export const WS_URL =
  import.meta.env.VITE_API_URL?.replace("/api", "") || window.location.origin;
