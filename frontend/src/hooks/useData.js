import { useEffect, useState } from "react";
import { api } from "../services/api";
import { getSocket } from "../services/socket";
import { useSignalStore } from "../store/signalStore";

/** Intraday (5-minute) engine rows. Refreshed every 15 s; the socket bridge pushes updates too. */
export function useIntraday() {
  const signals = useSignalStore((s) => s.signals);
  useEffect(() => {
    const load = () => api.signals().then((rows) => useSignalStore.setState({ signals: rows })).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);
  return signals;
}

/** Swing (daily) engine rows. Refreshed every 60 s. */
export function useSwing() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const load = () => api.swing().then(setRows).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);
  return rows;
}

/** Tracked (paper) trades. Reloads on the socket event and every 15 s. */
export function usePositions() {
  const [positions, setPositions] = useState([]);
  useEffect(() => {
    const load = () => api.positions().then(setPositions).catch(() => {});
    load();
    const socket = getSocket();
    socket.on("position:update", load);
    const id = setInterval(load, 15000);
    return () => {
      socket.off("position:update", load);
      clearInterval(id);
    };
  }, []);
  const reload = () => api.positions().then(setPositions).catch(() => {});
  return { positions, reload };
}
