import { describe, expect, test } from 'claude-code/testing'

// What the engine answers beneath the plugin in a session. The hooks beneath
// are registered before the test first uses `$` (ops answer `{ value }`).
const setup = (on: any, store: Record<string, unknown> = {}) => {
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: 'dark' }] }))
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.render', { component: 'AssistantMessage' }, () => ({ type: 'Text', props: {}, children: ['engine'] }))
}

const mountText = ($: any, text: string) =>
  $.ui.mount({
    plugin: 'terminal-math',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport: { columns: 100, rows: 30 },
  })

describe('inline math becomes Unicode', () => {
  test('superscripts and greek', async ($, on) => {
    setup(on)
    const ui = await mountText($, 'Sea $x^2 + y^2 = z^2$ y $\\alpha_i$ listo')
    expect((await ui.find({ text: /x² \+ y² = z²/ }))?.text).toContain('αᵢ')
  })

  test('accents, fractions, roots', async ($, on) => {
    setup(on)
    const ui = await mountText($, 'Con $\\hat{H}$, $\\frac{a+b}{c}$ y $\\sqrt{x+1}$')
    const t = (await ui.find({ text: /\(a\+b\)\/c/ }))?.text ?? ''
    expect(t).toContain('Ĥ')
    expect(t).toContain('√(x+1)')
  })
})

describe('prices and code are left alone', () => {
  test('dollar amounts', async ($, on) => {
    setup(on)
    const ui = await mountText($, 'Cuesta $5 y $10 en total')
    expect((await ui.find({ text: 'engine' }))?.text).toBe('engine')
  })

  test('inline code and fences', async ($, on) => {
    setup(on)
    const ui = await mountText($, 'Usa `$x^2$` tal cual y\n```\n$$y$$\n```')
    expect((await ui.find({ text: 'engine' }))?.text).toBe('engine')
  })
})

describe('/math command', () => {
  test('off leaves messages untouched and is remembered', async ($, on) => {
    const store: Record<string, unknown> = {}
    setup(on, store)
    const off = await $.command.run({ command: 'math', args: 'off tras esto', origin: { kind: 'composer' } })
    expect(String((off as any).text)).toContain('off')
    expect(store.enabled).toBe(false)
    const ui = await mountText($, 'Sea $x^2$')
    expect((await ui.find({ text: 'engine' }))?.text).toBe('engine')
  })
})

describe('session start', () => {
  test('warns once when TeX is missing, and stays quiet the second time', async ($, on) => {
    const store: Record<string, unknown> = {}
    const toasts: string[] = []
    setup(on, store)
    on('command.register', () => ({ value: { command: 'math' } }))
    on('env.get', () => ({ value: '/tmp/none' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
    on('fs.exists', () => ({ value: false }))
    on('store.delete', ($: any, e: any) => {
      delete store[e.key]
      return { value: undefined }
    })
    on('ui.toast', ($: any, e: any) => {
      toasts.push(String(e.text))
      return { value: undefined }
    })
    on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
    const start = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as any
    await $.session.start(start)
    await $.session.start(start)
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toContain('latex')
  })
})

describe('/math copy', () => {
  test('copies the LaTeX of the last equation drawn', async ($, on) => {
    const store: Record<string, unknown> = {}
    let copied = ''
    setup(on, store)
    on('env.get', () => ({ value: '/tmp/none' }))
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: { base64: '' } }))
    on('ui.copy', ($: any, e: any) => {
      copied = String(e.text)
      return { value: { isCopied: true } }
    })
    await mountText($, 'Mira $$\\frac{a}{b}$$ y luego $$x^2$$')
    const r = await $.command.run({ command: 'math', args: 'copy 2', origin: { kind: 'composer' } })
    expect(copied).toBe('\\frac{a}{b}')
    expect(String((r as any).text)).toContain('Copied')
  })
})

describe('/math size', () => {
  test('is remembered and rejects nonsense', async ($, on) => {
    const store: Record<string, unknown> = {}
    setup(on, store)
    await $.command.run({ command: 'math', args: 'size 2,5', origin: { kind: 'composer' } })
    expect(store.scale).toBe(2.5)
    const bad = await $.command.run({ command: 'math', args: 'size 99', origin: { kind: 'composer' } })
    expect(String((bad as any).text)).toContain('between')
    expect(store.scale).toBe(2.5)
  })
})
