import { Navigate } from 'react-router-dom';

/**
 * Coin economy is temporarily disabled.
 * Keep this route as a safe redirect so old bookmarks/deep links do not break.
 */
export default function CoinHistory() {
  return <Navigate to="/profile" replace />;
}
