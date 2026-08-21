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

/**
 * Translucent surface tokens layered over the active theme while the skin is
 * enabled: panels become glass over the wallpaper. Overlays stay nearly
 * opaque so popover text keeps full contrast. Light/dark pairs are both
 * mandatory by the theme service contract.
 */
export const SKIN_TOKEN_OVERRIDES: Readonly<Record<string, { light: string; dark: string }>> = Object.freeze({
  '--dsw-alias-bg-base': { light: 'rgba(247, 248, 252, 0.45)', dark: 'rgba(17, 20, 28, 0.5)' },
  '--dsw-alias-bg-layer-1': { light: 'rgba(255, 255, 255, 0.6)', dark: 'rgba(23, 27, 36, 0.62)' },
  '--dsw-alias-bg-layer-2': { light: 'rgba(255, 255, 255, 0.52)', dark: 'rgba(28, 33, 44, 0.55)' },
  '--dsw-alias-bg-overlay': { light: 'rgba(255, 255, 255, 0.92)', dark: 'rgba(24, 28, 38, 0.94)' },
  '--dsw-specific-sidebar-fill': { light: 'rgba(240, 242, 248, 0.38)', dark: 'rgba(15, 18, 26, 0.4)' },
})

/**
 * The static skin stylesheet. The wallpaper itself, the dim veil colors, and
 * the blur radius ride CSS custom properties so live updates rewrite
 * variables instead of reparsing rules. `body::before` carries image + veil
 * + blur on one fixed layer at z-index -1 (beneath app content, above the
 * canvas); the negative bleed inset keeps blurred edges from showing a
 * frame. The dark veil is a touch stronger than the light one to preserve
 * label contrast on bright images.
 */
export const SKIN_CSS = `:root { --dsh-skin-image: none; --dsh-skin-dim-light: rgba(255,255,255,0.35); --dsh-skin-dim-dark: rgba(6,8,14,0.45); --dsh-skin-blur: 0px; --dsh-skin-bleed: 0px; }
html body { --dsh-skin-dim: var(--dsh-skin-dim-light); }
html body[data-ds-dark-theme] { --dsh-skin-dim: var(--dsh-skin-dim-dark); }
body.${SKIN_ACTIVE_CLASS}::before { content: ''; position: fixed; inset: calc(-1 * var(--dsh-skin-bleed)); z-index: -1; pointer-events: none; background-image: linear-gradient(var(--dsh-skin-dim), var(--dsh-skin-dim)), var(--dsh-skin-image); background-size: cover; background-position: center; background-repeat: no-repeat; filter: blur(var(--dsh-skin-blur)); }`

/** Compute the root-element custom properties for one resolved skin. */
export function skinVariables(settings: SkinSettings, wallpapers: readonly WallpaperEntry[] | undefined): Record<string, string> {
  const url = resolveImageUrl(settings.image, wallpapers)
  const darkDim = Math.min(settings.dim + 0.15, 0.95)
  return {
    '--dsh-skin-image': `url("${url}")`,
    '--dsh-skin-dim-light': `rgba(255,255,255,${settings.dim})`,
    '--dsh-skin-dim-dark': `rgba(6,8,14,${darkDim})`,
    '--dsh-skin-blur': `${settings.blur}px`,
    '--dsh-skin-bleed': `${settings.blur}px`,
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
export class SkinController {
  private readonly document: Document
  private readonly theme: ThemeOverrideService
  private disposeTokens: (() => void) | undefined
  private lastSettings: SkinSettings | undefined
  private lastWallpapers: readonly WallpaperEntry[] | undefined

  constructor(deps: SkinControllerDeps) {
    this.document = deps.document
    this.theme = deps.theme
  }

  /**
   * Apply one (possibly partial/garbage) settings document. Disabling or
   * garbage input degrades cleanly: the wallpaper layer hides and the token
   * layer is dropped.
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
    if (this.disposeTokens === undefined) {
      this.disposeTokens = this.theme.overrideTokens('dsh-skin-background', { ...SKIN_TOKEN_OVERRIDES })
    }
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

  /** Hide the wallpaper and drop the token layer (plugin stays loaded). */
  private deactivate(): void {
    this.document.body.classList.remove(SKIN_ACTIVE_CLASS)
    for (const name of ['--dsh-skin-image', '--dsh-skin-dim-light', '--dsh-skin-dim-dark', '--dsh-skin-blur', '--dsh-skin-bleed']) {
      this.document.documentElement.style.removeProperty(name)
    }
    this.disposeTokens?.()
    this.disposeTokens = undefined
  }

  /** Fully revert: deactivate plus remove the style tag. */
  dispose(): void {
    this.deactivate()
    this.document.querySelector(`style[data-plugin-css="${SKIN_STYLE_TAG}"]`)?.remove()
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
