import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { Aperture } from 'lucide-react';
import { BRAND } from '@/constants/brand.js';
import './ParkingLoadingOverlay.css';

/**
 * Premium parking loading overlay: vehicles queue towards an attendant booth, three dots bounce below.
 * Purely presentational. It knows nothing about authentication, routing or data. Whoever renders it decides
 * when it is visible (see ParkingLoadingGate). Mount inside <AnimatePresence> for the smooth exit.
 */

const C = { cream: '#F5EBD8', black: '#101010', char: '#252525', line: '#38332F', gray: '#A7A29B', orange: '#C65D25', bright: '#E87932' };
const GROUND = 124; // y of the road surface where wheels touch
const STOP_X = 350; // front bumper of the first vehicle (just before the attendant)
const GAP = 14; // space between queued vehicles
const ENTER_X = -130; // new vehicles slide in from beyond the left edge
const EXIT_X = 560; // the served vehicle drives out beyond the right edge
const CYCLE_MS = 2600;
const FIRST_TICK_MS = 2300; // lets the initial queue finish rolling in
const ORDER = ['car', 'motorcycle', 'truck'];

/* ---------- vehicle artwork: local coordinates, wheels sit on y = 0 and the vehicle faces right ---------- */
function Wheel({ cx, r }) {
  return (
    <g transform={`translate(${cx} ${-r})`}>
      <g className="pl-wheel">
        <circle r={r} fill={C.black} stroke={C.gray} strokeWidth="1.6" />
        <path d={`M${-r + 1.8} 0H${r - 1.8}M0 ${-r + 1.8}V${r - 1.8}`} stroke={C.gray} strokeWidth="1.2" strokeLinecap="round" />
        <circle r="1.6" fill={C.bright} />
      </g>
    </g>
  );
}
const CarArt = () => (
  <g>
    <rect x="0" y="-19" width="64" height="12" rx="4.5" fill={C.cream} />
    <path d="M13 -19 L20 -28.5 H45 L53 -19 Z" fill={C.cream} />
    <path d="M19 -20.5 L23.5 -26.8 H31.5 V-20.5 Z" fill={C.char} />
    <path d="M34 -20.5 V-26.8 H44 L48.5 -20.5 Z" fill={C.char} />
    <rect x="3" y="-12.5" width="58" height="1.6" fill={C.orange} opacity=".85" />
    <rect x="60.5" y="-16" width="3.5" height="3.2" rx="1.4" fill={C.bright} />
    <rect x="0" y="-16" width="2.6" height="3.2" rx="1" fill={C.orange} />
    <Wheel cx={14} r={5.8} /><Wheel cx={50} r={5.8} />
  </g>
);
const MotoArt = () => (
  <g>
    <path d="M8 -6.5 L16 -15 H26 L32 -6.5" fill="none" stroke={C.orange} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.5 -15.5 Q20 -21.5 27.5 -15.5 Z" fill={C.orange} />
    <rect x="8.5" y="-16" width="10" height="2.6" rx="1.2" fill={C.char} stroke={C.line} strokeWidth=".6" />
    <path d="M29.5 -17 L32 -6.5" stroke={C.cream} strokeWidth="2" strokeLinecap="round" />
    <path d="M27.5 -19 H33.5" stroke={C.cream} strokeWidth="2" strokeLinecap="round" />
    <path d="M15.5 -15.5 L19.5 -24.5 M21 -22.5 L28 -19" stroke={C.cream} strokeWidth="3.2" strokeLinecap="round" fill="none" />
    <circle cx="20.5" cy="-28.5" r="3.6" fill={C.cream} />
    <circle cx="36" cy="-14.5" r="1.9" fill={C.bright} />
    <Wheel cx={8} r={6.5} /><Wheel cx={32} r={6.5} />
  </g>
);
const TruckArt = () => (
  <g>
    <rect x="0" y="-11" width="96" height="4.5" rx="1" fill={C.char} />
    <rect x="0" y="-37" width="62" height="27" rx="2.5" fill={C.cream} />
    <rect x="0" y="-21" width="62" height="2.6" fill={C.orange} />
    <rect x="4" y="-33" width="14" height="2" rx="1" fill={C.line} opacity=".7" />
    <path d="M65 -10 V-29 Q65 -31 67.5 -31 H81 L92 -20.5 V-10 Z" fill={C.bright} />
    <path d="M69.5 -27 H80 L87 -20.5 H69.5 Z" fill={C.char} />
    <rect x="92.5" y="-17" width="3.5" height="3.4" rx="1.4" fill={C.cream} />
    <Wheel cx={14} r={6.3} /><Wheel cx={30} r={6.3} /><Wheel cx={79} r={6.3} />
  </g>
);
const KINDS = { car: { w: 64, Art: CarArt }, motorcycle: { w: 40, Art: MotoArt }, truck: { w: 96, Art: TruckArt } };

/** Left edge of every queued vehicle. queue[0] is at the booth; the others line up behind it. */
export function queueLefts(queue) {
  let edge = STOP_X;
  return queue.map((v) => { const left = edge - KINDS[v.kind].w; edge = left - GAP; return left; });
}
const initialQueue = () => [0, 1, 2, 3].map((id) => ({ id, kind: ORDER[id % 3] }));

/* ---------- one animated vehicle ---------- */
function Vehicle({ kind, index, left }) {
  const ref = useRef(null);
  const { Art } = KINDS[kind];
  return (
    <motion.g
      ref={ref}
      data-kind={kind}
      style={{ y: GROUND }}
      initial={{ x: ENTER_X, opacity: 0 }}
      animate={{ x: left, opacity: 1, transition: { x: { duration: 1.05, ease: [0.22, 0.8, 0.28, 1], delay: index * 0.09 }, opacity: { duration: 0.3 } } }}
      exit={{ x: EXIT_X, opacity: 0, transition: { x: { duration: 0.95, ease: [0.5, 0, 0.9, 0.6] }, opacity: { duration: 0.3, delay: 0.6 } } }}
      onAnimationStart={() => ref.current?.classList.add('pl-moving')}
      onAnimationComplete={() => ref.current?.classList.remove('pl-moving')}
    >
      <Art />
    </motion.g>
  );
}

/* ---------- the scene (exported so it can be rendered statically for checks) ---------- */
export function ParkingScene({ queue, open, reduce }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const lefts = queueLefts(queue);
  return (
    <svg viewBox="0 0 480 140" role="presentation" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={`g${uid}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={C.bright} stopOpacity=".45" /><stop offset="100%" stopColor={C.bright} stopOpacity="0" /></radialGradient>
        <linearGradient id={`r${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1d1d1d" /><stop offset="100%" stopColor="#121212" /></linearGradient>
      </defs>

      {/* road */}
      <rect x="0" y="94" width="480" height="46" fill={`url(#r${uid})`} />
      <rect x="0" y="94" width="480" height="2" fill={C.line} />
      <line className={reduce ? undefined : 'pl-dash'} x1="0" x2="480" y1="113" y2="113" stroke={C.gray} strokeWidth="2" strokeDasharray="14 12" opacity=".4" />
      <rect x="0" y="136" width="480" height="2" fill={C.line} opacity=".7" />
      <rect x={STOP_X + 5} y="97" width="2.5" height="36" fill={C.bright} opacity=".45" />

      {/* attendant booth with parking sign */}
      <ellipse cx="424" cy="94" rx="52" ry="9" fill={`url(#g${uid})`} />
      <rect x="422" y="38" width="3" height="14" fill={C.gray} />
      <circle cx="423.5" cy="28" r="12.5" fill={C.orange} stroke={C.bright} strokeWidth="1.5" />
      <text x="423.5" y="34" textAnchor="middle" fontSize="17" fontWeight="700" fill={C.cream} fontFamily="Inter, Arial, sans-serif">P</text>
      <path d="M394 58 H454 L447 50 H401 Z" fill={C.orange} />
      <rect x="401" y="58" width="46" height="36" rx="3" fill={C.char} stroke={C.line} />
      <rect x="408" y="64" width="32" height="17" rx="2.5" fill={C.bright} opacity=".22" stroke={C.bright} strokeOpacity=".5" />
      <circle cx="424" cy="71.5" r="3.4" fill={C.cream} opacity=".9" />
      <path d="M416.5 81 Q424 73.5 431.5 81 Z" fill={C.cream} opacity=".9" />
      <rect x="408" y="83" width="32" height="3" rx="1" fill={C.line} />

      {/* barrier arm: lowered while vehicles wait, lifted while one is served */}
      <g transform="translate(401 77)">
        {reduce ? (
          <g>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-40 + i * 8} y={-2.5} width="8" height="5" fill={i % 2 ? C.cream : C.orange} />)}</g>
        ) : (
          <motion.g animate={{ rotate: open ? 70 : 0 }} transition={{ type: 'spring', stiffness: 150, damping: 17 }} style={{ originX: 1, originY: 0.5 }}>
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-40 + i * 8} y={-2.5} width="8" height="5" fill={i % 2 ? C.cream : C.orange} />)}
          </motion.g>
        )}
      </g>

      {/* vehicles */}
      {reduce
        ? queue.map((v, i) => { const { Art } = KINDS[v.kind]; return <g key={v.id} data-kind={v.kind} transform={`translate(${lefts[i]} ${GROUND})`}><Art /></g>; })
        : <AnimatePresence>{queue.map((v, i) => <Vehicle key={v.id} kind={v.kind} index={i} left={lefts[i]} />)}</AnimatePresence>}
    </svg>
  );
}

/* ---------- the overlay ---------- */
export default function ParkingLoadingOverlay({ message = 'Initializing', highlight = 'Parking System' }) {
  const present = useIsPresent();
  const reduce = !!useReducedMotion();
  const [queue, setQueue] = useState(initialQueue);
  const [open, setOpen] = useState(false);
  const nextId = useRef(4);

  // Continuous queue: serve the front vehicle, advance the rest, add a new one at the back. All timers are cleaned up.
  useEffect(() => {
    if (reduce) return undefined;
    let interval; const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const tick = () => {
      if (document.hidden) return; // do not pile up animation work in a background tab
      setOpen(true);
      setQueue((q) => { const id = nextId.current++; return [...q.slice(1), { id, kind: ORDER[id % ORDER.length] }]; });
      later(() => setOpen(false), 1050);
    };
    later(() => { tick(); interval = setInterval(tick, CYCLE_MS); }, FIRST_TICK_MS);
    return () => { clearInterval(interval); timers.forEach(clearTimeout); };
  }, [reduce]);

  return (
    <motion.div
      className="pl-backdrop"
      role="status" aria-live="polite" aria-busy="true"
      style={{ pointerEvents: present ? 'auto' : 'none' }} // never blocks the app while fading out
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.28 } }} transition={{ duration: 0.22 }}
    >
      <motion.div
        className="pl-card"
        initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 1.02 }}
        transition={{ duration: 0.32, ease: [0.22, 0.8, 0.28, 1] }}
      >
        <div className="pl-brand" aria-hidden="true">
          <span className="pl-mark"><Aperture size={17} /></span>
          <div><div className="pl-name">{BRAND.name}</div><div className="pl-sub">Parking Management System</div></div>
        </div>
        <div className="pl-scene"><ParkingScene queue={queue} open={open} reduce={reduce} /></div>
        <div className="pl-status">
          <div className="pl-dots" aria-hidden="true"><span className="pl-dot" /><span className="pl-dot" /><span className="pl-dot" /></div>
          <p className="pl-text">{message} <b>{highlight}</b>...</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
