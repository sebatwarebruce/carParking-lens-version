import { describe, it, expect, beforeAll, vi } from 'vitest';
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMocks } from '@/mocks/install.js';
import ParkingLoadingOverlay from '@/components/feedback/ParkingLoadingOverlay.jsx';

// The PWA update prompt imports a virtual module that only exists in the Vite build; it is unrelated to this feature.
vi.mock('@/app/PwaPrompt.jsx', () => ({ default: () => null }));

const overlay = () => document.querySelector('.pl-backdrop');
const kinds = () => [...document.querySelectorAll('[data-kind]')].map((n) => n.getAttribute('data-kind'));

describe('ParkingLoadingOverlay (presentational)', () => {
  it('shows the branding, the booth sign text and the exact loading message with the highlight', () => {
    render(<ParkingLoadingOverlay />);
    expect(screen.getByRole('status')).toHaveTextContent('Initializing Parking System...');
    expect(document.querySelector('.pl-text b')).toHaveTextContent('Parking System');
    expect(document.querySelector('.pl-sub')).toHaveTextContent('Parking Management System');
    expect(document.querySelectorAll('.pl-dot')).toHaveLength(3); // three dots, staggered by CSS delays
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('starts with a car at the booth, then a motorcycle and a truck queued behind it', () => {
    render(<ParkingLoadingOverlay />);
    expect(kinds()).toEqual(['car', 'motorcycle', 'truck', 'car']); // front of the queue first
  });

  it('keeps the queue moving: the served vehicle leaves, the rest advance, a new one joins at the back', async () => {
    render(<ParkingLoadingOverlay />);
    await waitFor(() => expect(kinds()).toEqual(['motorcycle', 'truck', 'car', 'motorcycle']), { timeout: 8000 });
    await waitFor(() => expect(kinds()).toEqual(['truck', 'car', 'motorcycle', 'truck']), { timeout: 8000 });
  }, 25000);

  it('stops blocking the app immediately while fading out, then is removed', async () => {
    function Harness() { const [on, setOn] = useState(true); return (<><button onClick={() => setOn(false)}>done</button><AnimatePresence>{on && <ParkingLoadingOverlay />}</AnimatePresence></>); }
    render(<Harness />);
    expect(overlay().style.pointerEvents).toBe('auto');
    await userEvent.click(screen.getByText('done'));
    if (overlay()) expect(overlay().style.pointerEvents).toBe('none'); // still fading, but click-through
    await waitFor(() => expect(overlay()).toBeNull(), { timeout: 4000 });
  });
});

describe('ParkingLoadingGate in the real app (real router, real auth flow, mock API)', () => {
  beforeAll(() => {
    installMocks();
    window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    window.history.replaceState({}, '', '/login'); // the router reads the URL when its module loads
    sessionStorage.clear();
  });

  it('first opening: overlay while the app initialises -> removed -> login screen; failed login shows NO overlay; successful login shows it again until the dashboard is ready', async () => {
    const { default: AppProviders } = await import('@/app/providers/AppProviders.jsx');
    const { default: App } = await import('@/App.jsx');
    const errors = vi.spyOn(console, 'error');
    render(<AppProviders><App /></AppProviders>);

    // A. first opening
    expect(overlay()).not.toBeNull();
    expect(overlay()).toHaveTextContent('Initializing Parking System...');
    await screen.findByLabelText(/email or phone/i);
    await waitFor(() => expect(overlay()).toBeNull(), { timeout: 5000 });

    // B. failed authentication: existing error handling unchanged, loader never shown
    await userEvent.type(screen.getByLabelText(/email or phone/i), 'attendant@parkwise.demo');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(overlay()).toBeNull();
    expect(await screen.findByText(/email\/phone or password is incorrect/i)).toBeInTheDocument();
    expect(overlay()).toBeNull();

    // C. successful authentication: same overlay, then the existing dashboard is revealed
    await userEvent.clear(screen.getByLabelText(/^password/i));
    await userEvent.type(screen.getByLabelText(/^password/i), 'demo1234');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(overlay()).not.toBeNull(), { timeout: 3000 });
    await screen.findAllByRole('link', { name: /vehicle entry/i }, { timeout: 8000 }); // existing attendant home rendered
    await waitFor(() => expect(overlay()).toBeNull(), { timeout: 8000 });
    expect(window.location.pathname).toBe('/home');
    expect(screen.getAllByRole('link', { name: /vehicle exit/i }).length).toBeGreaterThan(0);

    const mine = errors.mock.calls.filter((c) => /ParkingLoading|pl-|Invalid hook|Cannot update a component/i.test(String(c[0])));
    expect(mine).toHaveLength(0); // no console errors from the new code
  }, 40000);
});
