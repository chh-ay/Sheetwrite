const layers = [
  {
    label: "Host",
    detail: "Lifecycle, persistence, collaboration, and product UI",
  },
  {
    label: "TypeScript core",
    detail: "Grid API, transactions, virtualization, interaction, and renderer coordination",
  },
  {
    label: "Rust / WASM",
    detail: "Columnar cells, formulas, query scans, snapshots, and packed render windows",
  },
] as const;

export default function RuntimeArchitecture() {
  return (
    <figure className="sw-architecture" aria-labelledby="runtime-architecture-caption">
      <div className="sw-architecture__flow">
        {layers.map((layer, index) => (
          <div className="sw-architecture__step" key={layer.label}>
            <div>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{layer.label}</strong>
              <p>{layer.detail}</p>
            </div>
            {index < layers.length - 1 ? <span aria-hidden="true">↓</span> : null}
          </div>
        ))}
      </div>
      <figcaption id="runtime-architecture-caption">
        Ownership moves downward through narrow contracts; events and resolved windows move upward.
      </figcaption>
    </figure>
  );
}
