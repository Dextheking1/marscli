import { type ComponentProps } from "solid-js"

// MarsAI logo. The mark is a blocky "M" built from axis-aligned rectangles in the same
// pixel-grid style the inherited component used — a strong outer glyph with a lighter
// inner shadow block. Splash scales the same mark up for the startup screen; Logo is the
// mark + "MARS" lockup. Export names are unchanged so call sites don't move.

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* inner shadow block */}
      <path data-slot="logo-mark-shadow" d="M6 12V8L8 10L10 8V12H6Z" fill="var(--icon-weak-base)" />
      {/* M — posts, inner peak, baseline */}
      <path
        data-slot="logo-mark-m"
        d="M4 16V4H6L8 8L10 4H12V16H10V8L8 12L6 8V16H4Z"
        fill="var(--icon-strong-base)"
      />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* inner shadow block */}
      <path d="M30 60V40L40 50L50 40V60H30Z" fill="var(--icon-base)" />
      {/* M — posts, inner peak, baseline */}
      <path d="M20 80V20H30L40 45L50 20H60V80H50V45L40 65L30 45V80H20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        {/* mark — M */}
        <path d="M14 34V22L21 28L28 22V34H14Z" fill="var(--icon-weak-base)" />
        <path d="M6 38V8H14L21 18L28 8H36V38H28V18L21 28L14 18V38H6Z" fill="var(--icon-base)" />
        {/* M */}
        <path d="M54 36V18H60L66 27L72 18H78V36H72V27L66 33L60 27V36H54Z" fill="var(--icon-base)" />
        {/* A */}
        <path d="M90 36V27L96 18H102L108 27V36H102V33H96V36H90ZM96 30H102V27L99 21L96 27V30Z" fill="var(--icon-base)" />
        {/* R */}
        <path d="M120 36V18H135V27H129V36H120ZM129 24H135V21H129V24ZM129 27H135L138 36H132L129 27Z" fill="var(--icon-base)" />
        {/* S */}
        <path d="M150 36V30H165V27H150V18H171V24H156V27H171V36H150Z" fill="var(--icon-base)" />
        {/* AI */}
        <path d="M192 36V18H198V36H192Z" fill="var(--icon-strong-base)" />
        <path d="M204 36V27L210 18H216L222 27V36H216V33H210V36H204ZM210 30H216V27L213 21L210 27V30Z" fill="var(--icon-strong-base)" />
        <path d="M228 36V18H234V36H228Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
