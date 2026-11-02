// Top bar: connect to MIDI and pick ports and channel

export default function ConnectBar({ midi }) {
  return (
    <section className="panel connect">
      {midi.connected
        ? <span className="ok">Connected</span>
        : <button onClick={midi.connect}>Connect to MIDI</button>}
      {midi.error && <span className="bad">{midi.error}</span>}

      <label>
        MIDI in
        <select value={midi.inName} onChange={e => midi.setInName(e.target.value)} disabled={!midi.connected}>
          {midi.ports.inputs.map(n => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        MIDI out
        <select value={midi.outName} onChange={e => midi.setOutName(e.target.value)} disabled={!midi.connected}>
          {midi.ports.outputs.map(n => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        Channel
        <select value={midi.channel} onChange={e => midi.setChannel(Number(e.target.value))}>
          {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select>
      </label>
    </section>
  );
}
