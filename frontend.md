# SimpliEarn frontend

Brand visuals only. Color, type, surfaces, and motion. Not product layout, navigation, or screen structure.

The brand is **dark only**. There is no light theme. One green accent. Everything else is black, white, and grey.

## Canvas

- Ground color is `#050505`.
- The body stays transparent so a point cloud can sit behind the page.
- Content sits in a layer above the canvas (`z-10`).
- The cloud is a fixed canvas covering the viewport (`z-index: -10`), `pointer-events: none`, `aria-hidden`.
- Panels over the cloud are semi-opaque and blurred so type stays readable.

## Color

One accent. Do not add a second brand color.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#050505` | Ground |
| `--foreground` | `#f5f5f5` | Primary type |
| `--muted-foreground` | `#9aa0a6` | Secondary type |
| `--brand` / `--primary` | `#6fd98a` | Accent, links, primary actions, focus |
| `--primary-foreground` | `#07140c` | Type on the green accent |
| `--surface` / `--card` | `rgba(17, 20, 19, 0.78)` | Panels |
| `--popover` | `#141716` | Floating surfaces |
| `--pill` / `--secondary` | `#2b2d2c` | Tags, quiet fills |
| `--muted` | `#161918` | Hover fills |
| `--accent` | `#1a2820` | Quiet green wash |
| `--border` | `rgba(255, 255, 255, 0.08)` | 1px edges |
| `--input` | `rgba(255, 255, 255, 0.12)` | Stronger field edges |
| `--destructive` | `#e06b6b` | Errors |

Focus rings use the brand green at about 50% opacity. Invalid fields use the destructive red.

## Type

- Family: **Urbanist**. Weights: 300, 400, 500, 600.
- Body is 400, antialiased. Labels and buttons are 500. Display type is **300** with tight tracking.
- Wordmark: “SimpliEarn” in brand green, font-light, tracking-tight. Large display size is `text-6xl`, `text-7xl` from `sm`. A smaller lockup is `1.65rem`.
- A subtitle, if the product has one, is foreground text, font-light, one step smaller. It is not a second color.
- Supporting copy is `text-sm` in `--muted-foreground`.
- Do not use a monospace face for brand or interface copy.

## Shape

- Base radius: `0.75rem`. Panels use `rounded-2xl`. Pills use `rounded-[10px]`.
- Borders are 1px. Depth comes from translucency and blur, not drop shadows or gradients.

## Surfaces

```css
.surface {
  background: var(--surface);
  border: 1px solid var(--border);
  backdrop-filter: blur(18px);
}
```

Pair `.surface` with `rounded-2xl`. Sticky or floating bars, when they exist, use a translucent dark fill and `backdrop-blur-xl` with a `border-white/8` edge.

## Controls

These are the brand treatments for common controls, not a layout.

**Primary button.** Green fill, `--primary-foreground` label, `text-sm font-medium`, height `2rem`, padding `0.625rem` horizontal, `rounded-lg`. Hover lightens the fill. Disabled opacity is 50%.

**Outline.** Faint fill, 1px border, same radius.

**Ghost.** No fill until hover (`bg-muted` or white at 5%).

**Destructive.** Red at low opacity, not a solid red block.

**Pills.** `rounded-[10px]`, `bg-pill`, `px-2.5 py-1`, `text-xs`. A selected pill uses `bg-brand` and `#07140c` type.

**Fields.** Height `2.25rem`, radius `0.65rem`, border `rgba(255, 255, 255, 0.1)`, fill `rgba(0, 0, 0, 0.35)`, `text-sm`. Focus border is brand at 70%.

**Links.** `text-brand`, no underline by default.

**Toasts.** Background `--popover`, text `--popover-foreground`, border `--border`, radius `--radius`.

Icons, when used, are Lucide outlines at `size-4`.

## Motion

The only ambient motion is the point cloud. Other motion is a short color fade. No page transitions, parallax, or extra decoration.

**Point cloud**

- Decoration only. It never receives clicks.
- About **2000** particles at viewport width `768px` and up, about **800** below that.
- Radius `0.5–1.8px`. Fill is grey-white (`rgb` 210–255) at alpha roughly `0.13–0.6`.
- Layout is a soft ring, centered near 72% of the width and height, on an ellipse about 40% by 46% of the viewport. Most particles sit on the ring. The rest are scattered inside it.
- Drift is slow and Brownian. Each frame, velocity is damped by `0.985` and kicked by a tiny gaussian (`0.02–0.05px`). Particles wrap a few pixels past the edges.
- Cap `devicePixelRatio` at **2**.
- Pause while `document.hidden`. When `prefers-reduced-motion: reduce`, draw one static frame and do not animate.

## Do not

- Do not add a light theme or a second accent.
- Do not replace Urbanist.
- Do not use heavy shadows, gradients, or glass beyond the surface blur.
- Do not let the point cloud intercept clicks or keep animating while the tab is hidden.
