/**
 * Haptic feedback utility — wraps the Web Vibration API.
 * Falls back silently on devices that don't support it (e.g. desktop).
 */

export const haptics = {
  /** Short tap — for normal button presses, list items */
  tap: () => { try { navigator.vibrate?.(8); } catch {} },

  /** Medium — for toggles, confirmations, tab changes */
  medium: () => { try { navigator.vibrate?.(18); } catch {} },

  /** Success — double pulse, for completed actions */
  success: () => { try { navigator.vibrate?.([10, 30, 10]); } catch {} },

  /** Warning/Error — longer buzz */
  error: () => { try { navigator.vibrate?.([40, 20, 40]); } catch {} },

  /** Heavy — for SOS, destructive actions */
  heavy: () => { try { navigator.vibrate?.([60, 30, 60]); } catch {} },
};
