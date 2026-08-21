// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SKIN_ACTIVE_CLASS } from '../src/client/SkinController.ts'
import type { SkinScopeController, SkinScopeSnapshot } from '../src/client/SkinSection.tsx'

/**
 * Wiring test for the client entry: dictionaries, the default skin, the
 * scoped settings subscription, and the settings-section registration.
 */
interface RegisteredSection {
  options: Record<string, unknown>
  component: () => unknown
}

interface FakeClientContext {
  effect(callback: () => unknown, label?: string): void
  inject(services: string[], callback: (scoped: FakeClientContext) => void): void
  locale: {
    register(namespace: string, dicts: Record<string, Record<string, string>>): unknown
    bind(namespace: string): (key: string) => string
  }
  slots: {
    inject(name: string, register: () => unknown): void
    register(options: Record<string, unknown>, component: () => unknown): unknown
  }
  theme: { overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void }
  settingsScope?: { bind(spec: { namespace: string }): SkinScopeController }
}

function mountClient(documents: Record<string, unknown>): {
  ctx: FakeClientContext
  sections: RegisteredSection[]
  scope: FakeScope
  registrations: { name: string }[]
} {
  const sections: RegisteredSection[] = []
  const registrations: { name: string }[] = []
  const scope = new FakeScope(documents)
  const localeDicts: Record<string, Record<string, string>> = {}
  const base: FakeClientContext = {
    effect(callback) { const dispose = callback(); return void dispose },
    inject(services, callback) {
      if (!services.includes('settingsScope')) return
      const scoped: FakeClientContext = Object.create(base)
      scoped.settingsScope = { bind: () => scope }
      scoped.slots = {
        inject: (name, register) => { registrations.push({ name }); register() },
        register: (options, component) => {
          sections.push({ options, component })
          return () => {}
        },
      }
      callback(scoped)
    },
    locale: {
      register: (namespace, dicts) => { localeDicts[namespace] = dicts.zh; return () => {} },
      bind: (namespace) => (key) => `${namespace}:${key}`,
    },
    slots: {
      inject: (name, register) => { registrations.push({ name }); register() },
      register: (options, component) => { sections.push({ options, component }); return () => {} },
    },
    theme: { overrideTokens: () => () => {} },
  }
  return { ctx: base, sections, scope, registrations }
}

class FakeScope implements SkinScopeController {
  private listeners = new Set<() => void>()
  private snapshot: SkinScopeSnapshot

  constructor(documents: Record<string, unknown>) {
    this.snapshot = { value: documents as never, user: {}, revision: 1 }
  }

  getSnapshot(): SkinScopeSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async set(): Promise<void> {}
  async unset(): Promise<void> {}

  /** Change the durable document and notify subscribers. */
  publish(documents: Record<string, unknown>): void {
    this.snapshot = { value: documents as never, user: {}, revision: this.snapshot.revision + 1 }
    for (const listener of this.listeners) listener()
  }
}

describe('client apply', () => {
  it('registers dictionaries, applies defaults, subscribes to the scope, and registers the section', async () => {
    const { apply } = await import('../src/client/index.ts')
    const harness = mountClient({ enabled: true, image: '', dim: 0.35, blur: 0 })
    apply(harness.ctx as never)

    // Default skin is on with the shipped fallback wallpaper.
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--dsh-skin-image')).toContain('aurora-dawn.svg')

    // The settings section registered with its label and id.
    const section = harness.sections.find(entry => entry.options.id === 'skin')
    expect(section).toBeDefined()
    expect(section?.options.name).toBe('settings.section')
    expect(typeof section?.options.order).toBe('number')
    expect(typeof section?.component).toBe('function')
    const label = section?.options.label as () => string
    expect(label()).toBe('dsh-skin:nav')

    // A settings change re-applies the skin live.
    harness.scope.publish({ enabled: false, image: '', dim: 0.35, blur: 0 })
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(false)
  })
})
