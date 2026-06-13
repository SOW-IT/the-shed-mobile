/**
 * Minimal portal: renders children above the native tab bar without needing
 * React Native's Modal (which is constrained to the tab content area when
 * Expo Router uses a native UITabBarController).
 *
 * Usage:
 *   1. Place <PortalHost /> as a sibling of <Tabs> in the root layout (above
 *      it in z-order, i.e. rendered after it in JSX).
 *   2. Wrap any overlay content with <Portal> — it will teleport to the host.
 */

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

// ---- Module-level registry -------------------------------------------------
// Using module state (not React context) avoids prop-drilling and stale-
// closure issues. Each Portal writes its latest ReactNode here, then
// broadcasts to the single PortalHost to re-render.

let nextId = 0;
const entries: { id: string; node: ReactNode }[] = [];
let notify: (() => void) | null = null;

function broadcast() {
  notify?.();
}

// ---- PortalHost ------------------------------------------------------------

/**
 * Place once above <Tabs> in the root layout. Renders all active portals
 * using absolute positioning so they cover the full screen including the
 * native tab bar.
 */
export const PortalHost = () => {
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    notify = () => setTick((n) => n + 1);
    // Flush any portals that registered before this host mounted
    if (entries.length > 0) broadcast();
    return () => {
      notify = null;
    };
  }, []);

  if (entries.length === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {entries.map((e) => (
        <View key={e.id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {e.node}
        </View>
      ))}
    </View>
  );
};

// ---- Portal ----------------------------------------------------------------

/**
 * Teleports `children` to the PortalHost. Replaces <Modal> in Sheet and
 * OptionSheet so the overlay covers the full screen (including tab bar).
 */
export const Portal = ({ children }: { children: ReactNode }) => {
  const idRef = useRef(`portal-${nextId++}`);

  // Keep the portal content fresh on every render of the parent component
  useLayoutEffect(() => {
    const id = idRef.current;
    const idx = entries.findIndex((e) => e.id === id);
    if (idx >= 0) {
      entries[idx] = { id, node: children };
    } else {
      entries.push({ id, node: children });
    }
    broadcast();
  });

  // Remove entry when the parent unmounts (e.g. mounted state goes false)
  useEffect(
    () => () => {
      const id = idRef.current;
      const idx = entries.findIndex((e) => e.id === id);
      if (idx >= 0) entries.splice(idx, 1);
      broadcast();
    },
    []
  );

  return null;
};
