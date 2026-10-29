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

// A fake machine: which commands run when called by bare name, which files exist,
// what the environment holds; every process the mod starts is recorded.
type Machine = { bare?: string[]; files?: string[]; env?: Record<string, string>; pkgs?: string }
const PNG = (() => {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, 800)
  new DataView(b.buffer).setUint32(20, 150)
  return btoa(String.fromCharCode(...b))
})()

const machine = (on: any, m: Machine, store: Record<string, unknown> = {}) => {
  const runs: { argv: string[]; cwd?: string }[] = []
  const toasts: string[] = []
  const made = new Set<string>()
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: 'dark' }] }))
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('store.delete', ($: any, e: any) => (delete store[e.key], { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', ($: any, e: any) => (toasts.push(String(e.text)), { value: undefined }))
  on('command.register', () => ({ value: { command: 'math' } }))
  on('env.get', ($: any, e: any) => ({ value: m.env?.[e.name] }))
  // This test engine reads 'C:/...' as a path relative to the cwd; a real Windows has it absolute.
  on('fs.exists', ($: any, e: any) => ({
    value: (m.files ?? []).some((f) => e.path === f || e.path.endsWith(`/${f}`)) || [...made].some((f) => e.path.endsWith(f)),
  }))
  on('fs.write', ($: any, e: any) => (made.add(e.path), { value: undefined }))
  on('fs.read', () => ({ value: { base64: PNG } }))
  on('process.run', ($: any, e: any) => {
    const [cmd, arg] = e.argv
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (arg === '--version') return { value: { exitCode: (m.bare ?? []).includes(cmd) ? 0 : 127, stdout: '', stderr: '' } }
    if (cmd.endsWith('kpsewhich') || cmd.endsWith('kpsewhich.exe')) {
      return { value: { exitCode: 0, stdout: m.pkgs ?? 'standalone.sty\namsmath.sty\nxcolor.sty\n', stderr: '' } }
    }
    // the picture a tool "makes" exists from then on
    if (e.argv.includes('-o')) made.add(`${e.init?.cwd}/${e.argv[e.argv.indexOf('-o') + 1]}`)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AssistantMessage' }, () => ({ type: 'Text', props: {}, children: ['engine'] }))
  return { runs, toasts, made }
}
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as any

describe('platforms', () => {
  test('no TeX at all: warns once, with a hint for the platform', async ($, on) => {
    const { toasts } = machine(on, { env: { HOME: '/home/f' } })
    await $.session.start(START)
    await $.session.start(START)
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toContain('latex, dvipng')
    expect(toasts[0]).toContain('TeX Live')
  })

  test('macOS: finds MacTeX outside PATH and compiles there', async ($, on) => {
    const bin = '/Library/TeX/texbin'
    const { runs, toasts } = machine(on, {
      env: { HOME: '/Users/f' },
      files: ['/System/Library/CoreServices', `${bin}/latex`, `${bin}/dvipng`, `${bin}/kpsewhich`, '/usr/bin/perl'],
    })
    await $.session.start(START)
    expect(toasts.length).toBe(0)
    await mountText($, 'Mira $$x^2 + y^2$$')
    const used = runs.map((r) => r.argv[0])
    expect(used).toContain(`${bin}/latex`)
    expect(used).toContain(`${bin}/dvipng`)
    expect(used).toContain('/usr/bin/perl') // pads the picture to the cell grid
    expect(runs.find((r) => r.argv[0] === `${bin}/latex`)?.cwd).toBe('/Users/f/.cache/claude-terminal-math')
  })

  test('Linux: TeX on PATH, cache under XDG_CACHE_HOME', async ($, on) => {
    const { runs, toasts } = machine(on, {
      bare: ['latex', 'dvipng', 'kpsewhich', 'perl'],
      env: { HOME: '/home/f', XDG_CACHE_HOME: '/home/f/.xdg' },
    })
    await $.session.start(START)
    expect(toasts.length).toBe(0)
    await mountText($, 'Mira $$x^2 + y^2$$')
    const latex = runs.find((r) => r.argv[0] === 'latex' && r.argv[1] !== '--version')
    expect(latex?.cwd).toBe('/home/f/.xdg/claude-terminal-math')
    expect(runs.some((r) => r.argv[0] === 'dvipng' && r.argv[1] !== '--version')).toBe(true)
  })

  test('Linux: TeX Live installed under /usr/local/texlive is found', async ($, on) => {
    const tl = '/usr/local/texlive/2025/bin/x86_64-linux'
    const { runs, toasts } = machine(on, {
      env: { HOME: '/home/f' },
      files: [`${tl}/latex`, `${tl}/dvipng`, `${tl}/kpsewhich`],
    })
    await $.session.start(START)
    expect(toasts.length).toBe(0)
    await mountText($, 'Mira $$x^2$$')
    expect(runs.some((r) => r.argv[0] === `${tl}/latex`)).toBe(true)
  })

  test('Windows: MiKTeX or TeX Live found, no perl needed, picture left tight', async ($, on) => {
    const tl = 'C:/texlive/2025/bin/windows'
    const { runs, toasts } = machine(on, {
      env: { OS: 'Windows_NT', LOCALAPPDATA: 'C:\\Users\\F\\AppData\\Local' },
      files: [`${tl}/latex.exe`, `${tl}/dvipng.exe`, `${tl}/kpsewhich.exe`],
    })
    await $.session.start(START)
    expect(toasts).toEqual([])
    await mountText($, 'Mira $$x^2$$')
    const latex = runs.find((r) => r.argv[0] === `${tl}/latex.exe`)
    expect(latex?.cwd).toBe('C:/Users/F/AppData/Local/claude-terminal-math')
    const dvipng = runs.find((r) => r.argv[0] === `${tl}/dvipng.exe`)
    expect(dvipng?.argv.join(' ')).not.toContain('.raw.png') // straight to the final picture
    expect(runs.some((r) => r.argv.some((a) => a.includes('Compress::Zlib')))).toBe(false)
    expect(runs.some((r) => r.argv[0] === 'find')).toBe(false) // Windows find is another program
  })

  test('manual cell ratio is kept and used', async ($, on) => {
    const store: Record<string, unknown> = {}
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich'], env: { HOME: '/home/f' } }, store)
    await $.session.start(START)
    const r = await $.command.run({ command: 'math', args: 'ratio 0,5', origin: { kind: 'composer' } })
    expect(String((r as any).text)).toContain('0.5')
    expect(store.ratio).toBe(0.5)
    const bad = await $.command.run({ command: 'math', args: 'ratio 9', origin: { kind: 'composer' } })
    expect(String((bad as any).text)).toContain('/math ratio auto')
  })
})
