import { useEffect, useState } from "react";
import { locationApi } from "../api.js";

const SEND_EVERY_MS = 10_000;

// While `active` (the driver has a ride on the way), watch the phone's GPS,
// send it to the server every 10 seconds, and keep the screen awake
// (browsers pause GPS for web pages when the phone locks).
//
// Returns { position: {lat, lng, accuracy} | null, state }, where state is
// "off" | "locating" | "slow" | "sharing" | "denied" | "unavailable".
// "slow" = still no fix after 15 s, usually an unanswered "Allow location?" prompt.
export default function useLocationSharing(active) {
  const [position, setPosition] = useState(null);
  const [state, setState] = useState("off");

  useEffect(() => {
    if (!active) {
      setState("off");
      return;
    }
    if (!("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }

    setState("locating");
    const slowTimer = setTimeout(() => setState((s) => (s === "locating" ? "slow" : s)), 15_000);
    let latest = null;
    let lastSent = 0;
    let stopped = false;
    let wakeLock = null;

    async function send() {
      if (!latest || stopped) return;
      lastSent = Date.now();
      try {
        await locationApi.send(latest);
        setState("sharing");
      } catch (err) {
        // 409: the server says no ride is on the way anymore; stop sending.
        if (err.status === 409) stopped = true;
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setPosition(latest);
        setState((s) => (s === "locating" || s === "slow" ? "locating" : s)); // first fix: on its way to "sharing"
        if (Date.now() - lastSent >= SEND_EVERY_MS) send();
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    // Keep reporting even when standing still (watchPosition only fires on change).
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastSent >= SEND_EVERY_MS) send();
    }, SEND_EVERY_MS);

    async function keepAwake() {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* not supported or refused: GPS still works while the screen is on */
      }
    }
    keepAwake();
    document.addEventListener("visibilitychange", keepAwake);

    return () => {
      stopped = true;
      clearTimeout(slowTimer);
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", keepAwake);
      wakeLock?.release().catch(() => {});
    };
  }, [active]);

  return { position: active ? position : null, state };
}
