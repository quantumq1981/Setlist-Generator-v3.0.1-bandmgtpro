window.featureDefinitions = {
  energyCurve: {
    title: 'Energy Curve Optimization',
    content: (
      <>
        <p style={{ marginBottom: '.65rem' }}>
          Energy Curve Optimization places songs against a target intensity arc so each set has a deliberate emotional shape rather than random ups and downs.
        </p>
        <ul style={{ paddingLeft: '1rem', display: 'grid', gap: '.4rem' }}>
          <li>Builds momentum early, supports peaks mid-set, and controls landing energy near the close.</li>
          <li>Combines style-based energy with BPM-informed energy when available.</li>
          <li>Works with weighting controls so you can decide how strongly the generator enforces the arc.</li>
        </ul>
      </>
    )
  },
  presets: {
    title: 'Curve Presets',
    content: (
      <>
        <p style={{ marginBottom: '.65rem' }}>Preset options tailor the flow to different show goals:</p>
        <ul style={{ paddingLeft: '1rem', display: 'grid', gap: '.4rem' }}>
          <li><strong>Classic Arc:</strong> gradual lift, one main summit, controlled landing.</li>
          <li><strong>Double Peak:</strong> two high-energy surges with a reset in between.</li>
          <li><strong>Slow Burn:</strong> patient, low-friction build that saves impact for late set moments.</li>
          <li><strong>Freeform High:</strong> sustained high energy with one strategic breather.</li>
        </ul>
      </>
    )
  },
  tonalGravity: {
    title: 'Tonal Gravity (Circle of Fifths)',
    content: (
      <>
        <p style={{ marginBottom: '.65rem' }}>
          Tonal Gravity uses Circle of Fifths distance to reduce harmonic friction between neighboring songs.
        </p>
        <ul style={{ paddingLeft: '1rem', display: 'grid', gap: '.4rem' }}>
          <li>Closer key movement usually sounds smoother to listeners.</li>
          <li>Directional moves can reinforce arc intent (clockwise tends to feel like lift, counterclockwise can release).</li>
          <li>Tonal Smoothness controls whether the set favors cohesion or intentional contrast moments.</li>
        </ul>
      </>
    )
  },
  optimizationMode: {
    title: 'Optimization Modes',
    content: (
      <>
        <p style={{ marginBottom: '.65rem' }}>Choose speed vs exploration depth:</p>
        <ul style={{ paddingLeft: '1rem', display: 'grid', gap: '.4rem' }}>
          <li><strong>Standard (Greedy):</strong> faster, practical choices from top-scoring candidates.</li>
          <li><strong>Deep Self-Adaptive (Simulated Annealing):</strong> slower but explores more arrangements to escape local optima.</li>
        </ul>
      </>
    )
  }
};
