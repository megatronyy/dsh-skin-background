/**
 * dsh-skin-background, browser half. Applies the image-background skin
 * (wallpaper layer plus translucent surface tokens) and contributes the
 * "Skin" section to the settings page plus the configuration area on the
 * plugin's own Plugins-page detail (`plugins.bundle.config`). Settings
 * arrive through the config form bound to the `skin-background` entry, so
 * every change saved anywhere applies live.
 *
 * The context shape below is structural, mirroring the host services this
 * plugin touches (the loader provides the real Cordis context; keeping the
 * touched surface explicit keeps this external package free of
 * monorepo-internal type dependencies). dsh >= 0.1.7-rc.2: settings reads and
 * writes go through `configForms` — the old `settingsScope` service is gone.
 */
import { createElement as h } from 'react'
import { DEFAULT_SKIN_SETTINGS, PLUGIN_PACKAGE_NAME, SKIN_NAMESPACE, type SkinSettings } from '../skin-settings.ts'
import { SkinController, type ThemeOverrideService } from './SkinController.ts'
import { SkinSection, createWallpaperLoader, type SkinScopeController } from './SkinSection.tsx'
import { en, zh, type SkinDictionary } from './locales.ts'

/** Locale namespace owning this plugin's copy. */
const LOCALE_NS = 'dsh-skin'

/** The locale-service surface this plugin touches. */
interface LocaleService {
  register(namespace: string, dicts: Record<string, Record<string, string>>): unknown
  bind(namespace: string): (key: string) => string
}
/** The slots-service surface this plugin touches. */
interface SlotsService {
  inject(name: string, register: () => unknown): void
  register(options: Record<string, unknown>, component: (props: unknown) => unknown): unknown
}

/** The config-forms service (present once the settings domain is composed). */
interface ConfigFormsService {
  get(namespace: string): SkinScopeController
}

/** The client cordis context shape this plugin relies on. */
interface SkinClientContext {
  effect(callback: () => unknown, label?: string): void
  inject(services: string[], callback: (scoped: SkinClientContext) => void): void
  locale: LocaleService
  slots: SlotsService
  theme: ThemeOverrideService
  configForms?: ConfigFormsService
}

/** Required services: slots/locale for the settings section, theme for token overrides. */
export const inject = ['slots', 'locale', 'theme']

/**
 * Plugin body: dictionaries, skin lifecycle, and — once the settings scope
 * exists — the reactive settings subscription and the settings section.
 * @param ctx - client cordis context.
 */
export function apply(ctx: SkinClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en } as unknown as Record<string, Record<string, string>>), 'skin-background: dictionaries')
  const translate = ctx.locale.bind(LOCALE_NS)
  const t = translate as (key: keyof SkinDictionary) => string

  const controller = new SkinController({ document, theme: ctx.theme })
  // Defaults apply immediately; the scope subscription below replaces them
  // with the durable document as soon as it is readable.
  controller.apply(DEFAULT_SKIN_SETTINGS, undefined)
  ctx.effect(() => () => controller.dispose(), 'skin-background: skin teardown')

  const loadWallpapers = createWallpaperLoader()
  void loadWallpapers()
    .then(wallpapers => { controller.applyWallpapers(wallpapers) })
    .catch(() => { /* listing failed — the fallback wallpaper still renders */ })

  // Scoped on purpose: a host without the settings domain still gets the skin.
  ctx.inject(['configForms'], (cctx) => {
    const scope = cctx.configForms?.get(SKIN_NAMESPACE)
    if (scope === undefined) return
    const sync = (): void => {
      const snapshot = scope.getSnapshot()
      // Before the first accepted section the stored value is unknown; the
      // defaults applied above stay on screen until then.
      if (snapshot.status !== 'ready') return
      controller.apply(snapshot.value ?? DEFAULT_SKIN_SETTINGS, undefined)
    }
    sync()
    cctx.effect(() => scope.subscribe(sync), 'skin-background: settings subscription')

    cctx.slots.inject('settings.section', () => cctx.slots.register({
      name: 'settings.section',
      id: 'skin',
      order: 45,
      label: () => t('nav'),
      locale: LOCALE_NS,
      inject: () => ({ t }),
    }, () => h(SkinSection, { t, scope, loadWallpapers })))

    // The Plugins page's bundle detail renders this entry (keyed by the
    // package name) as the plugin's own configuration area: 'page' is the
    // full skin form, 'summary' a one-line placeholder.
    cctx.slots.inject('plugins.bundle.config', () => cctx.slots.register({
      name: 'plugins.bundle.config',
      key: PLUGIN_PACKAGE_NAME,
    }, (props: unknown) => {
      const view = (props as { view?: 'summary' | 'page' } | undefined)?.view
      return view === 'summary'
        ? h('span', null, t('nav'))
        : h(SkinSection, { t, scope, loadWallpapers })
    }))
  })
}

export type { SkinSettings }
