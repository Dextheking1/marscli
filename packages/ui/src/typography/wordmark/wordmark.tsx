import { createUniqueId, type ComponentProps } from "solid-js"

// MarsAI wordmark. Blocky letterforms drawn in the same two-tone pixel-grid style as the
// inherited mark: each letter is a unioned path of axis-aligned rectangles, with a lighter
// inner "shadow" block. Spells "MARS". The `outline`/`fade` props drive the draw-on animation
// (pathLength-based) used by the first-launch splash.
export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 380 129"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            {/* M — outer down-stroke, inner peaks, footer baseline */}
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M18 110V18H37V55L46 73L55 55V18H74V110H55V55L46 92L37 55V110H18Z"
            />
            {/* A — legs, crossbar notch, apex */}
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M110 110V55L119 18H138L147 55V110H128V92H119V110H110ZM119 73H128V55L123 37L119 55V73Z"
            />
            {/* R — bowl + leg kick */}
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M183 110V18H221V73H202V110H183ZM202 55H221V36H202V55ZM202 73H221L230 110H211L202 73Z"
            />
            {/* S — top/bottom bars + middle step */}
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M266 110V92H304V73H266V18H323V36H285V55H323V110H266Z"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="380" height="129">
          <rect width="380" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="190" y1="68" x2="190" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
