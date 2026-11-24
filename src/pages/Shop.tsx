import { Navigate } from 'react-router-dom';

/**
 * The shop is retired. Keep the legacy route as a safe compatibility redirect
 * so stale links never produce a dead page.
 */
export default function Shop() {
  return <Navigate to="/profile" replace />;
}
