# ADR-0003: Hand-rolled UI components for the frontend

- Status: Accepted
- Date: 2026-08-28

## Context

The frontend is a single screen: an upload area, and a results view that shows the
uploaded document with a bounding-box overlay plus a side panel with counts, a legend
and the list of detected boxes. The starting point is HomeVision's own
`react-challenge-template` (React 19, Vite, Tailwind v4, Vitest), which ships no
component library.

The component surface this screen actually needs is small: a button, one or two
bordered panels, a single-line alert for errors, a few count badges, and one
`<select>` to pick the detection strategy. The default move for a React plus Tailwind
app is shadcn/ui (as of now built on Base UI primitives), so the question is whether
to pull it in here.

## Decision

Hand-roll the components. Each of the pieces above is a few Tailwind classes on a
native element, so they live as small local components or inline markup, with one
three-line `cn()` helper for conditional classes and no component-library dependency.
The one widget with real accessibility depth, a styled dropdown, is just a native
`<select>` with Tailwind classes: keyboard, screen-reader and mobile behavior are
already correct and there is nothing to maintain.

Adding shadcn/ui would bring `class-variance-authority`, `tailwind-merge`, `clsx`, a
Base UI runtime, an icon set and a folder of generated component files, to save
writing markup that is shorter than the config it replaces. For one screen that is a
bad trade.

Two related choices that point the same way: `react-dropzone` is kept, because the
drag-enter/leave state machine, the hidden file input and the accept/reject handling
are worth not reimplementing; and the overlay is hand-drawn `<svg>` rather than an
annotation library, because a read-only box display needs nothing an SVG does not
already give.

## Where this leaves me

Less code than the library route, no new runtime dependency beyond `react-dropzone`,
and no line in the UI I cannot explain on the spot. The cost is that this does not
scale: the moment the UI needs dialogs, popovers, a combobox or a real design system,
hand-rolling stops being the smaller option and shadcn/ui becomes the right call. For
a single screen it is not there yet.
