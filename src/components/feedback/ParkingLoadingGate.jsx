import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence } from 'motion/react';
import { useIsFetching } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext.jsx';
import { router } from '@/app/router/routes.jsx';
import ParkingLoadingOverlay from './ParkingLoadingOverlay.jsx';

const SETTLE_MS = 150; // bridges the instant between "page mounted" and "its first requests start"
const MAX_HOLD_MS = 10000; // safety: after sign-in the overlay can never stay up longer than this

/**
 * Decides WHEN the parking loading overlay is visible. It only READS existing state; it never changes it.
 *  - First opening: visible while the existing session check runs (auth status "loading").
 *  - Successful sign-in (and a restored session): stays up until the destination page is mounted and its
 *    first data requests have finished, then fades out.
 *  - Failed sign-in: auth status never leaves "anonymous", so the overlay never appears.
 *  - Sign-out / expired session: status becomes "anonymous", so it hides immediately.
 * No artificial delay beyond the short settle window, and a hard cap so it cannot hang.
 */
export default function ParkingLoadingGate() {
  const { status } = useAuth();
  const fetching = useIsFetching();
  const routerState = useSyncExternalStore(router.subscribe, () => router.state, () => router.state);
  const [holding, setHolding] = useState(true); // the very first render is the first opening

  // "anonymous" means the login screen (or a failed login) is the ready state; anything else keeps/starts the hold.
  useEffect(() => { setHolding(status !== 'anonymous'); }, [status]);

  const routeReady = routerState.initialized && routerState.navigation.state === 'idle' && routerState.location.pathname !== '/login';

  // Release once the authenticated app is genuinely ready.
  useEffect(() => {
    if (!holding || status !== 'authenticated' || !routeReady || fetching > 0) return undefined;
    const t = setTimeout(() => setHolding(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [holding, status, routeReady, fetching]);

  // Hard cap so an unrelated failure can never leave the overlay on screen.
  useEffect(() => {
    if (!holding || status !== 'authenticated') return undefined;
    const t = setTimeout(() => setHolding(false), MAX_HOLD_MS);
    return () => clearTimeout(t);
  }, [holding, status]);

  return <AnimatePresence>{holding && <ParkingLoadingOverlay key="parking-loading" />}</AnimatePresence>;
}
