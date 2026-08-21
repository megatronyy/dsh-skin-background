/**
 * Shared skin settings model: constants, validation, and pure resolution
 * helpers consumed by both plugin halves and the test suite. Keeping the
 * rules here means the Host schema, the Host route validation, and the
 * browser applier can never drift apart.
 */

/** Settings namespace (also the loader row id and the route prefix stem). */
export const SKIN_NAMESPACE = 'skin-background'

/** Route prefix the Host half owns for wallpaper listing and serving. */
export const WALLPAPER_ROUTE = '/skin-background/wallpapers'

/** The wallpaper picked when the stored image reference is empty or unusable. */
export const FALLBACK_WALLPAPER_URL = `${WALLPAPER_ROUTE}/aurora-dawn.svg`

/** Upper bound for the dim veil alpha (kept below 1 so content stays readable). */
export const DIM_MAX = 0.9

/** Upper bound for the background blur radius in CSS pixels. */
export const BLUR_MAX = 24

/** Wallpaper file extensions served from disk, leading dot included. */
export const WALLPAPER_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'] as const

/** User-facing shape stored under the settings namespace. */
export interface SkinSettings {
  /** Master switch: when false every visual change is removed. */
  enabled: boolean
  /**
   * Image reference: `preset:<wallpaper-id>`, an absolute http(s) URL, or a
   * plugin-served path under {@link WALLPAPER_ROUTE}. Empty means "default".
   */
  image: string
  /** Dim veil alpha over the image, 0–{@link DIM_MAX}. */
  dim: number
  /** Background blur radius in px, 0–{@link BLUR_MAX}. */
  blur: number
}

/** Defaults applied below both the composition layer and any stored value. */
export const DEFAULT_SKIN_SETTINGS: SkinSettings = Object.freeze({
  enabled: true,
  image: '',
  dim: 0.15,
  blur: 0,
})

/**
 * Accepted image references: a preset id, an absolute http(s) URL, or a
 * single wallpaper filename under the plugin route (the host route layer
 * additionally enforces traversal safety at read time).
 */
const IMAGE_PATTERN = new RegExp(
  '^(?:preset:[a-z0-9][a-z0-9._-]*'
  + `|https?://[^\\s'"]+`
  + `|${WALLPAPER_ROUTE}/[a-z0-9][a-z0-9 ._~%-]*\\.(?:${WALLPAPER_EXTENSIONS.map(ext => ext.slice(1)).join('|')})`
  + ')$',
  'i',
)

/** Whether a raw image reference is structurally acceptable for storage/apply. */
export function isAcceptableImage(image: string): boolean {
  return image === '' || IMAGE_PATTERN.test(image)
}

/** Clamp a dim alpha into [0, DIM_MAX], mapping garbage to the default. */
export function clampDim(value: unknown): number {
  const dim = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SKIN_SETTINGS.dim
  return Math.min(DIM_MAX, Math.max(0, dim))
}

/** Clamp a blur radius into [0, BLUR_MAX] whole pixels, mapping garbage to the default. */
export function clampBlur(value: unknown): number {
  const blur = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SKIN_SETTINGS.blur
  return Math.round(Math.min(BLUR_MAX, Math.max(0, blur)))
}

/**
 * Fold a partial (possibly garbage) stored document into a fully valid
 * {@link SkinSettings}: defaults fill gaps, numbers clamp, and an
 * unacceptable image reference falls back to the empty reference.
 */
export function resolveSkinSettings(value: unknown): SkinSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof SkinSettings, unknown>>
  const enabled = raw.enabled === undefined ? DEFAULT_SKIN_SETTINGS.enabled : raw.enabled === true
  const imageCandidate = typeof raw.image === 'string' ? raw.image : DEFAULT_SKIN_SETTINGS.image
  return {
    enabled,
    image: isAcceptableImage(imageCandidate) ? imageCandidate : DEFAULT_SKIN_SETTINGS.image,
    dim: clampDim(raw.dim),
    blur: clampBlur(raw.blur),
  }
}

/** One wallpaper the Host route lists and serves. */
export interface WallpaperEntry {
  /** Stable id (`preset:<id>` references it; derived from the filename stem). */
  id: string
  /** Display name for the settings grid. */
  name: string
  /** Served URL, usable directly as a CSS background url. */
  url: string
  /** Where the file lives: shipped with the plugin or dropped in by the user. */
  source: 'builtin' | 'user'
}

/**
 * Resolve the CSS url() for a stored image reference against the current
 * wallpaper list. Unknown presets and empty references fall back to the
 * shipped default so the skin never silently disappears.
 */
export function resolveImageUrl(image: string, wallpapers: readonly WallpaperEntry[] | undefined): string {
  if (image.startsWith('preset:')) {
    const id = image.slice('preset:'.length)
    const hit = wallpapers?.find(entry => entry.id === id)
    return hit === undefined ? FALLBACK_WALLPAPER_URL : hit.url
  }
  if (image === '') return FALLBACK_WALLPAPER_URL
  return isAcceptableImage(image) ? image : FALLBACK_WALLPAPER_URL
}
