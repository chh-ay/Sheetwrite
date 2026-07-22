import { Link } from "@tanstack/react-router";

/** Static, engine-free callout for the live engine route. */
export default function EngineLandingTeaser() {
  return (
    <div className="sw-landing-engine-teaser">
      <div className="sw-landing-engine-teaser__copy">
        <p className="sw-section-eyebrow">The live route, reserved below</p>
        <h2 id="landing-engine-title">
          Watch the Grid, the calculation engine, and your host agree.
        </h2>
        <p>
          A paged formula sheet makes each request, checked result, drawing choice, and host save
          readable. No illustration stands in for the working Grid.
        </p>
        <Link className="sw-landing-engine-teaser__link" to="/showcases/engine/">
          Try the live engine view →
        </Link>
      </div>
      <ol aria-label="Live view outline" className="sw-landing-engine-teaser__steps">
        <li>
          <span>01</span>
          <strong>Edit in the Grid</strong>
          <p>Change one actual value and watch its formula update.</p>
        </li>
        <li>
          <span>02</span>
          <strong>Check the result</strong>
          <p>Jump to a row and see only the needed page arrive.</p>
        </li>
        <li>
          <span>03</span>
          <strong>Save to your host</strong>
          <p>Read the acknowledgement returned by the host boundary.</p>
        </li>
      </ol>
    </div>
  );
}
