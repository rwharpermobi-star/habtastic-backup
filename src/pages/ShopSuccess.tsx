import { Navigate } from 'react-router-dom';

/**
 * Legacy Shop payment callbacks are retired. Redirect stale callbacks safely
 * back into the app rather than exposing a removed purchase surface.
 */
export default function ShopSuccess() {
  return <Navigate to="/profile" replace />;
}
