import type { ReactNode } from "react";
import "../styles/showcase-capability-hero.css";

export interface CapabilityHeroFact {
  label: string;
  value: string;
}

interface CapabilityHeroProps {
  description: ReactNode;
  eyebrow: string;
  facts: readonly CapabilityHeroFact[];
  title: string;
}

/** Shared opening contract for the four capability showcases. */
export function CapabilityHero({
  description,
  eyebrow,
  facts,
  title,
}: Readonly<CapabilityHeroProps>) {
  return (
    <header className="sw-capability-hero">
      <div className="sw-capability-hero__copy">
        <p className="sw-capability-hero__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="sw-capability-hero__lede">{description}</p>
      </div>
      <dl aria-label="Scenario scope" className="sw-capability-hero__facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
