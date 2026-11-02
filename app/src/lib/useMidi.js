// A React hook that handles the MIDI connection to the R3.
// It gives the app: connect(), the port lists, send(), and waitForReply().

import { useCallback, useEffect, useRef, useState } from 'react';
import * as R3 from './r3.js';
import { getSetting, setSetting } from './store.js';

export function useMidi(onSysex) {
  const [access, setAccess] = useState(null);
  const [error, setError] = useState(null);
  const [ports, setPorts] = useState({ inputs: [], outputs: [] });
  const [inName, setInName] = useState(getSetting('in', ''));
  const [outName, setOutName] = useState(getSetting('out', ''));
  const [channel, setChannel] = useState(getSetting('channel', 1));

  // Refs hold the latest values for code that runs outside React's render
  const onSysexRef = useRef(onSysex);
  onSysexRef.current = onSysex;
  const replyWaiter = useRef(null);

  const connect = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setError('This browser has no Web MIDI. Use Chrome.');
      return;
    }
    try {
      // sysex: true is what lets us send and receive patch data
      setAccess(await navigator.requestMIDIAccess({ sysex: true }));
      setError(null);
    } catch (err) {
      setError(`Blocked: ${err.message}`);
    }
  }, []);

  // If Chrome already allowed MIDI last time, connect straight away
  useEffect(() => {
    navigator.permissions?.query({ name: 'midi', sysex: true })
      .then(p => { if (p.state === 'granted') connect(); })
      .catch(() => {});
  }, [connect]);

  // Keep the port lists up to date when interfaces are plugged in or out
  useEffect(() => {
    if (!access) return;
    const refresh = () => setPorts({
      inputs: [...access.inputs.values()].map(p => p.name),
      outputs: [...access.outputs.values()].map(p => p.name),
    });
    refresh();
    access.onstatechange = refresh;
    return () => { access.onstatechange = null; };
  }, [access]);

  // If nothing's picked yet, or the saved port has gone, use the first one
  useEffect(() => {
    if (ports.inputs.length && !ports.inputs.includes(inName)) setInName(ports.inputs[0]);
    if (ports.outputs.length && !ports.outputs.includes(outName)) setOutName(ports.outputs[0]);
  }, [ports, inName, outName]);

  useEffect(() => setSetting('in', inName), [inName]);
  useEffect(() => setSetting('out', outName), [outName]);
  useEffect(() => setSetting('channel', channel), [channel]);

  // Listen only on the picked input
  useEffect(() => {
    if (!access) return;
    for (const input of access.inputs.values()) {
      input.onmidimessage = input.name !== inName ? null : (e) => {
        const d = e.data;
        if (d[0] !== 0xF0) return;   // only SysEx matters here
        const r = R3.parse(d);
        if ((r.kind === 'loaded' || r.kind === 'loadError') && replyWaiter.current) {
          replyWaiter.current(r.kind);
          replyWaiter.current = null;
          return;
        }
        onSysexRef.current(d, r);
      };
    }
  }, [access, inName]);

  const send = useCallback((bytes) => {
    const out = access && [...access.outputs.values()].find(p => p.name === outName);
    if (!out) return false;
    out.send(bytes);
    return true;
  }, [access, outName]);

  // Wait for the R3's "OK" or "error" reply. Resolves with null if none comes.
  const waitForReply = useCallback((ms) => new Promise(resolve => {
    const timer = setTimeout(() => { replyWaiter.current = null; resolve(null); }, ms);
    replyWaiter.current = (kind) => { clearTimeout(timer); resolve(kind); };
  }), []);

  return {
    connected: !!access, error, connect, ports,
    inName, setInName, outName, setOutName, channel, setChannel,
    send, waitForReply,
  };
}
