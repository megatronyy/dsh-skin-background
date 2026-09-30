/**
 * Skin application core: owns the plugin's style tag, the CSS custom
 * properties on the root element, and the theme token override layer. Pure
 * DOM/theme dependencies are injected so jsdom tests drive the same code the
 * browser runs.
 */
import {
  resolveImageUrl, resolveSkinSettings,
  type SkinSettings, type WallpaperEntry,
} from '../skin-settings.ts'

/** The theme-service surface this skin touches (structural: the host provides the real service). */
export interface ThemeOverrideService {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}

/** Identifies the style tag both in DOM and for the loader's style inventory convention. */
export const SKIN_STYLE_TAG = 'dsh-skin-background/skin.css'

/** Body class that switches the wallpaper layer on and off. */
export const SKIN_ACTIVE_CLASS = 'dsh-skin-active'

/** Style tag carrying the desktop title-bar layer (rewritten on every apply). */
export const DESKTOP_CHROME_STYLE_TAG = 'dsh-skin-background/desktop-chrome.css'

/**
 * Token overrides layered over the active theme whenever the skin is enabled:
 * the main canvas and the sidebar turn translucent so the wallpaper shows
 * through — this is the skin's core visual, always on with the wallpaper
 * (same layering approach as dsh-skin). Light/dark pairs are both mandatory
 * by the theme service contract.
 */
export const SKIN_BASE_TOKEN_OVERRIDES: Readonly<Record<string, { light: string; dark: string }>> = Object.freeze({
  '--dsw-alias-bg-base': { light: 'rgba(247, 248, 252, 0.45)', dark: 'rgba(17, 20, 28, 0.5)' },
  '--dsw-specific-sidebar-fill': { light: 'rgba(240, 242, 248, 0.38)', dark: 'rgba(15, 18, 26, 0.4)' },
})

/**
 * The settings/Plugins-pages token layer, driven by `windowTransparency`
 * (shared by both surfaces): `0` keeps the theme's opaque defaults (no layer
 * at all), higher values make the window fills translucent. Overlays stay
 * nearly opaque so popover text keeps full contrast.
 */
export function windowTokenOverrides(
  windowTransparency: number,
): Record<string, { light: string; dark: string }> | undefined {
  if (windowTransparency <= 0) return undefined
  const alpha = round(Math.min(1 - windowTransparency, 1))
  return {
    '--dsw-alias-bg-layer-1': { light: `rgba(255, 255, 255, ${alpha})`, dark: `rgba(23, 27, 36, ${alpha})` },
    '--dsw-alias-bg-layer-2': { light: `rgba(255, 255, 255, ${alpha})`, dark: `rgba(28, 33, 44, ${alpha})` },
    '--dsw-alias-bg-overlay': {
      light: `rgba(255, 255, 255, ${Math.max(alpha, 0.92)})`,
      dark: `rgba(24, 28, 38, ${Math.max(alpha, 0.94)})`,
    },
  }
}

/**
 * The static skin stylesheet. The wallpaper itself, the dim veil colors, and
 * the blur radius ride CSS custom properties so live updates rewrite
 * variables instead of reparsing rules. `body::before` carries image + veil
 * + blur on one fixed layer at z-index -1 (beneath app content, above the
 * canvas); the negative bleed inset keeps blurred edges from showing a
 * frame. The dark veil is a touch stronger than the light one to preserve
 * label contrast on bright images. The plugin-manager surface
 * (`[data-plugin-panel]`, list and detail views alike) sits on the main
 * canvas, so it would inherit the canvas translucency — its fill is driven
 * by the shared `windowTransparency` value instead (`0` = fully opaque).
 * `--dsh-skin-chrome-fill` / `--dsh-skin-caption-fill` only feed the separate
 * Windows-desktop title-bar layer ({@link desktopChromeCss}).
 */
export const SKIN_CSS = `:root { --dsh-skin-image: none; --dsh-skin-dim-light: rgba(255,255,255,0.35); --dsh-skin-dim-dark: rgba(6,8,14,0.45); --dsh-skin-blur: 0px; --dsh-skin-bleed: 0px; --dsh-skin-window-light: rgba(255,255,255,1); --dsh-skin-window-dark: rgba(21,21,23,1); --dsh-skin-chrome-fill: var(--dsw-alias-bg-base, rgba(17, 20, 28, 0.5)); --dsh-skin-caption-fill: transparent; }
html body { --dsh-skin-dim: var(--dsh-skin-dim-light); }
html body[data-ds-dark-theme] { --dsh-skin-dim: var(--dsh-skin-dim-dark); }
body.${SKIN_ACTIVE_CLASS}::before { content: ''; position: fixed; inset: calc(-1 * var(--dsh-skin-bleed)); z-index: -1; pointer-events: none; background-image: linear-gradient(var(--dsh-skin-dim), var(--dsh-skin-dim)), var(--dsh-skin-image); background-size: cover; background-position: center; background-repeat: no-repeat; filter: blur(var(--dsh-skin-blur)); }
body.${SKIN_ACTIVE_CLASS} [data-plugin-panel] { --dsw-alias-bg-base: var(--dsh-skin-window-light); background: var(--dsh-skin-window-light); }
body.${SKIN_ACTIVE_CLASS}[data-ds-dark-theme] [data-plugin-panel] { --dsw-alias-bg-base: var(--dsh-skin-window-dark); background: var(--dsh-skin-window-dark); }`

/** Round a ratio to two decimals so CSS strings never carry float tails. */
const round = (value: number): number => Math.round(value * 100) / 100

/**
 * The Windows-desktop title-bar layer, written into its own tag so every
 * settings change can rewrite it (see {@link SkinController.syncDesktopChrome}).
 *
 * Electron reserves a 40px caption strip there (`titleBarStyle: "hidden"` plus
 * `titleBarOverlay`): AppFrame pays that area out with `padding-top` and paints
 * it — twice, on the frame box and on the frame's `::before` drag handle — with
 * the app's own opaque-leaning `--dsw-specific-sidebar-fill`, which is why the
 * strip ignored the skin while the panels below did not. The window buttons'
 * backdrop is drawn by the main process from `setTitleBarOverlay()`, whose
 * colour the preload measures off a hidden probe span parked in `<body>`
 * (`background-color: var(--dsw-specific-sidebar-fill)`).
 *
 * Both are re-pointed at the skin's own variables, so the strip and the caption
 * area follow the same settings as the main panel instead of the theme:
 * `--dsh-skin-chrome-fill` (defaults to the main panel's `--dsw-alias-bg-base`)
 * for the strip, `--dsh-skin-caption-fill` (`transparent` — the caption area
 * then shows whatever the strip renders, wallpaper and all) for the probe.
 *
 * The fills are translucent, so equal fill colours only look equal when the
 * stack depth matches. Measured on the desktop build (DevTools probe of the
 * computed `backgroundColor` up the ancestor chain): the panel column stacks
 * three `--dsw-alias-bg-base` layers (body, frame, content rail, root), while
 * the strip — which has no content above it — only stacks two (body, frame,
 * frame's `::before`). Two fills of α read ~7/8 where three read ~15/16, hence
 * the strip sat visibly brighter than the panel beside it. The drag handle
 * therefore paints its fill twice (its own colour plus a same-colour gradient
 * on top), which lands the strip on the panel's effective alpha without
 * touching anything outside the caption strip. With an opaque fill both sides
 * saturate and the extra pass is a no-op.
 *
 * Selectors deliberately avoid the CSS-Modules hashes: the frame is reached
 * through its stable `data-rightbar-col` child (:has), the session card through
 * the `_centerCol` suffix of its generated class, the probe through its fixed
 * style attribute. If any marker ever disappears the rules simply stop matching
 * and the strip falls back to its previous appearance.
 *
 * The card's top-left corner is squared off for the same reason the drag handle
 * is painted twice: dsh rounds it to set the session card apart from the
 * toolbar above, but once both sides share one fill that radius only leaves a
 * wedge of sidebar colour in the notch (measured ~5 levels lighter than the
 * card, with the corner itself reading ~40 levels brighter than either side).
 * Flattened, the strip and the card meet in a straight seam. Only the left
 * corner is touched — the right one sits under the window buttons, where any
 * notch is far less exposed.
 */
export function desktopChromeCss(): string {
  return `html[data-windows-titlebar] div:has(> [data-rightbar-col]) { background: var(--dsh-skin-chrome-fill); }
html[data-windows-titlebar] div:has(> [data-rightbar-col])::before { background-color: var(--dsh-skin-chrome-fill); background-image: linear-gradient(var(--dsh-skin-chrome-fill), var(--dsh-skin-chrome-fill)); }
html[data-windows-titlebar] span[style*="--dsw-specific-sidebar-fill"] { --dsw-specific-sidebar-fill: var(--dsh-skin-caption-fill); }
html[data-windows-titlebar] [class*="_centerCol"] { border-top-left-radius: 0; }`
}

/** Compute the root-element custom properties for one resolved skin. */
export function skinVariables(settings: SkinSettings, wallpapers: readonly WallpaperEntry[] | undefined): Record<string, string> {
  const url = resolveImageUrl(settings.image, wallpapers)
  const lightVeil = round(Math.min(1 - settings.transparency, 1))
  const darkVeil = round(Math.min(lightVeil + 0.15, 0.95))
  const windowAlpha = round(Math.min(1 - settings.windowTransparency, 1))
  return {
    '--dsh-skin-image': `url("${url}")`,
    '--dsh-skin-dim-light': `rgba(255,255,255,${lightVeil})`,
    '--dsh-skin-dim-dark': `rgba(6,8,14,${darkVeil})`,
    '--dsh-skin-blur': `${settings.blur}px`,
    '--dsh-skin-bleed': `${settings.blur}px`,
    '--dsh-skin-window-light': `rgba(255,255,255,${windowAlpha})`,
    '--dsh-skin-window-dark': `rgba(21,21,23,${windowAlpha})`,
  }
}

/** Constructor dependencies for {@link SkinController}. */
export interface SkinControllerDeps {
  document: Document
  theme: ThemeOverrideService
}

/**
 * Applies, updates, and removes the image-background skin. Idempotent:
 * `apply` may run on every settings or wallpaper change; `dispose` fully
 * reverts the DOM and the theme layer.
 */
/** Source ids for the two token override layers (base always with the skin; window layer follows its transparency). */
const BASE_TOKEN_SOURCE = 'dsh-skin-background'
const WINDOW_TOKEN_SOURCE = 'dsh-skin-background:window'

export class SkinController {
  private readonly document: Document
  private readonly theme: ThemeOverrideService
  private disposeBaseTokens: (() => void) | undefined
  private disposeWindowTokens: (() => void) | undefined
  private lastSettings: SkinSettings | undefined
  private lastWallpapers: readonly WallpaperEntry[] | undefined

  constructor(deps: SkinControllerDeps) {
    this.document = deps.document
    this.theme = deps.theme
  }

  /**
   * Apply one (possibly partial/garbage) settings document. Disabling or
   * garbage input degrades cleanly: the wallpaper layer hides and both token
   * layers are dropped. The base token layer (main canvas + sidebar) is part
   * of the skin itself; the window layer over the settings/Plugins pages
   * follows its own `windowTransparency` slider (0 = opaque theme defaults).
   */
  apply(settings: unknown, wallpapers?: readonly WallpaperEntry[]): void {
    const resolved = resolveSkinSettings(settings)
    this.lastSettings = resolved
    this.lastWallpapers = wallpapers ?? this.lastWallpapers
    const body = this.document.body
    if (!resolved.enabled) {
      this.deactivate()
      return
    }
    this.ensureStyleTag()
    body.classList.add(SKIN_ACTIVE_CLASS)
    const root = this.document.documentElement
    for (const [name, value] of Object.entries(skinVariables(resolved, this.lastWallpapers))) {
      root.style.setProperty(name, value)
    }
    // Drop and re-add each token layer on every apply: a transparency change
    // takes effect immediately, and overrideTokens stacks layers if re-called.
    this.disposeBaseTokens?.()
    this.disposeWindowTokens?.()
    this.disposeBaseTokens = this.theme.overrideTokens(BASE_TOKEN_SOURCE, { ...SKIN_BASE_TOKEN_OVERRIDES })
    const windowTokens = windowTokenOverrides(resolved.windowTransparency)
    this.disposeWindowTokens = windowTokens === undefined
      ? undefined
      : this.theme.overrideTokens(WINDOW_TOKEN_SOURCE, { ...windowTokens })
    this.syncDesktopChrome()
  }

  /** Store a late-arriving wallpaper list and re-apply the last settings. */
  applyWallpapers(wallpapers: readonly WallpaperEntry[]): void {
    this.lastWallpapers = wallpapers
    this.refresh()
  }

  /** Re-apply the last settings (used when the wallpaper list arrives late). */
  refresh(): void {
    if (this.lastSettings === undefined) return
    this.apply(this.lastSettings, this.lastWallpapers)
  }

  /** Hide the wallpaper and drop both token layers (plugin stays loaded). */
  private deactivate(): void {
    this.document.body.classList.remove(SKIN_ACTIVE_CLASS)
    for (const name of ['--dsh-skin-image', '--dsh-skin-dim-light', '--dsh-skin-dim-dark', '--dsh-skin-blur', '--dsh-skin-bleed', '--dsh-skin-window-light', '--dsh-skin-window-dark']) {
      this.document.documentElement.style.removeProperty(name)
    }
    this.disposeBaseTokens?.()
    this.disposeBaseTokens = undefined
    this.disposeWindowTokens?.()
    this.disposeWindowTokens = undefined
    // Removing the tag is itself a `<head>` mutation, which is what makes the
    // desktop preload re-read its caption probe and fall back to the theme.
    this.document.querySelector(`style[data-plugin-css="${DESKTOP_CHROME_STYLE_TAG}"]`)?.remove()
  }

  /** Fully revert: deactivate plus remove the style tag. */
  dispose(): void {
    this.deactivate()
    this.document.querySelector(`style[data-plugin-css="${SKIN_STYLE_TAG}"]`)?.remove()
  }

  /**
   * Write (or refresh) the desktop title-bar layer. Rewriting the tag's text on
   * every apply is the point, not an accident: the Windows desktop preload
   * re-measures its caption probe from `<head>` mutations, so a settings change
   * only reaches the window buttons if this tag actually changes. Runs after the
   * root variables and the token layers so the preload reads the new values.
   * Tag discovery follows the same document-wide convention as the main sheet.
   */
  private syncDesktopChrome(): void {
    const selector = `style[data-plugin-css="${DESKTOP_CHROME_STYLE_TAG}"]`
    let tag = this.document.querySelector<HTMLStyleElement>(selector)
    if (tag === null) {
      tag = this.document.createElement('style')
      tag.dataset.plugin = 'dsh-skin-background'
      tag.dataset.pluginCss = DESKTOP_CHROME_STYLE_TAG
      this.document.head.appendChild(tag)
    }
    tag.textContent = desktopChromeCss()
  }

  private ensureStyleTag(): void {
    if (this.document.querySelector(`style[data-plugin-css="${SKIN_STYLE_TAG}"]`) !== null) return
    const tag = this.document.createElement('style')
    // data-plugin / data-plugin-css follow the loader's style-inventory
    // convention so HMR and teardown recognize the tag as plugin-owned.
    tag.dataset.plugin = 'dsh-skin-background'
    tag.dataset.pluginCss = SKIN_STYLE_TAG
    tag.textContent = SKIN_CSS
    this.document.head.appendChild(tag)
  }
}
