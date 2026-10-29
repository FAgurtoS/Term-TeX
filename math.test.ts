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
    plugin: 'term-tex',
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
type Machine = { bare?: string[]; files?: string[]; env?: Record<string, string>; pkgs?: string; noZlib?: boolean; dark?: boolean; theme?: string }
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
  const writes: { path: string; text: string }[] = []
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: m.theme ?? 'dark' }] }))
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
  on('fs.write', ($: any, e: any) => (made.add(e.path), writes.push({ path: e.path, text: String(e.text ?? e.content ?? '') }), { value: undefined }))
  on('fs.read', () => ({ value: { base64: PNG } }))
  on('process.run', ($: any, e: any) => {
    const [cmd, arg] = e.argv
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (arg === '-MCompress::Zlib') return { value: { exitCode: m.noZlib ? 2 : 0, stdout: '', stderr: '' } }
    if (cmd === 'defaults') return { value: { exitCode: m.dark ? 0 : 1, stdout: m.dark ? 'Dark\n' : '', stderr: '' } }
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
  return { runs, toasts, made, writes }
}
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as any

describe('platforms', () => {
  test('no TeX at all: warns once, with a hint for the platform', async ($, on) => {
    const { toasts } = machine(on, { env: { HOME: '/home/f' } })
    await $.session.start(START)
    await $.session.start(START)
    const tex = toasts.filter((t) => t.includes('missing latex'))
    expect(tex.length).toBe(1)
    expect(tex[0]).toContain('TeX Live')
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
    expect(runs.find((r) => r.argv[0] === `${bin}/latex`)?.cwd).toBe('/Users/f/.cache/term-tex')
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
    expect(latex?.cwd).toBe('/home/f/.xdg/term-tex')
    expect(runs.some((r) => r.argv[0] === 'dvipng' && r.argv[1] !== '--version')).toBe(true)
  })

  test('Linux: TeX Live installed under /usr/local/texlive is found', async ($, on) => {
    const tl = '/usr/local/texlive/2025/bin/x86_64-linux'
    const { runs, toasts } = machine(on, {
      env: { HOME: '/home/f' },
      files: [`${tl}/latex`, `${tl}/dvipng`, `${tl}/kpsewhich`, '/usr/bin/perl'],
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
    expect(toasts.length).toBe(1) // only: no perl, pictures at their natural size
    expect(toasts[0]).toContain('perl was not found')
    await mountText($, 'Mira $$x^2$$')
    const latex = runs.find((r) => r.argv[0] === `${tl}/latex.exe`)
    expect(latex?.cwd).toBe('C:/Users/F/AppData/Local/term-tex')
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

const inkOf = (writes: { path: string; text: string }[]) =>
  writes.find((w) => w.path.endsWith('.tex'))?.text.match(/definecolor\{fg\}\{HTML\}\{(\w+)\}/)?.[1]

describe('ink colour', () => {
  const base = { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } }

  test('light and dark themes pick their own ink', async ($, on) => {
    const { writes } = machine(on, { ...base, theme: 'light-daltonized' })
    await $.session.start(START)
    await mountText($, 'Mira $$x^2$$')
    expect(inkOf(writes)).toBe('1F2430')
  })

  test('theme "auto": the terminal says it is light (COLORFGBG)', async ($, on) => {
    const { writes } = machine(on, { ...base, theme: 'auto', env: { ...base.env, COLORFGBG: '0;15' } })
    await $.session.start(START)
    await mountText($, 'Mira $$x^2$$')
    expect(inkOf(writes)).toBe('1F2430')
  })

  test('theme "auto": a dark terminal gets the light ink', async ($, on) => {
    const { writes } = machine(on, { ...base, theme: 'auto', env: { ...base.env, COLORFGBG: '15;0' } })
    await $.session.start(START)
    await mountText($, 'Mira $$x^2$$')
    expect(inkOf(writes)).toBe('D8DEE9')
  })

  test('theme "auto" on a Mac in light mode, with no terminal hint', async ($, on) => {
    const { writes } = machine(on, { ...base, theme: 'auto', files: ['/System/Library/CoreServices'], dark: false })
    await $.session.start(START)
    await mountText($, 'Mira $$x^2$$')
    expect(inkOf(writes)).toBe('1F2430')
  })

  test('/math color overrides the theme, and "auto" gives the choice back', async ($, on) => {
    const store: Record<string, unknown> = {}
    const { writes } = machine(on, { ...base, theme: 'dark' }, store)
    await $.session.start(START)
    await $.command.run({ command: 'math', args: 'color #ff8800', origin: { kind: 'composer' } })
    expect(store.color).toBe('ff8800')
    await mountText($, 'Mira $$x^2$$')
    expect(inkOf(writes)).toBe('FF8800')
    await $.command.run({ command: 'math', args: 'color auto', origin: { kind: 'composer' } })
    expect(store.color).toBeUndefined()
    const bad = await $.command.run({ command: 'math', args: 'color purple', origin: { kind: 'composer' } })
    expect(String((bad as any).text)).toContain('/math color dark')
  })
})

describe('perl and the cache', () => {
  const base = { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } }

  test('perl without Compress::Zlib: warns once and draws tight pictures', async ($, on) => {
    const { toasts, runs } = machine(on, { ...base, noZlib: true })
    await $.session.start(START)
    await $.session.start(START)
    const t = toasts.filter((x) => x.includes('Compress::Zlib'))
    expect(t.length).toBe(1)
    expect(t[0]).toContain('perl-modules')
    await mountText($, 'Mira $$x^2$$')
    const dvipng = runs.find((r) => r.argv[0] === 'dvipng' && r.argv[1] !== '--version')
    expect(dvipng?.argv.join(' ')).not.toContain('.raw.png')
  })

  test('the cache is emptied once when its layout changes, then only swept', async ($, on) => {
    const store: Record<string, unknown> = {}
    const { runs } = machine(on, base, store)
    await $.session.start(START)
    expect(store.cacheGen).toBe(3)
    const first = runs.filter((r) => r.argv[0] === 'perl' && r.argv[1] === '-e').map((r) => r.argv[2])
    expect(first.some((c) => c.includes('unlink $f if -f $f }') && !c.includes('$keep'))).toBe(true)
    runs.length = 0
    await $.session.start(START)
    const second = runs.filter((r) => r.argv[0] === 'perl' && r.argv[1] === '-e').map((r) => r.argv[2])
    expect(second.some((c) => c.includes('$keep'))).toBe(true)
    expect(second.some((c) => c.includes('unlink $f if -f $f }') && !c.includes('$keep'))).toBe(false)
  })
})

describe('the double-struck one', () => {
  test('inline \\mathbb{1} becomes 𝟙 in the line', async ($, on) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const ui = await mountText($, 'La identidad es $\\mathbb{1}$ y ya.')
    expect((await ui.find({ text: /𝟙/ }))?.text).toContain('La identidad es 𝟙 y ya.')
  })

  test('display \\mathbb{1} is compiled as \\mathds{1} with dsfont', async ($, on) => {
    const { writes } = machine(on, {
      bare: ['latex', 'dvipng', 'kpsewhich', 'perl'],
      env: { HOME: '/home/f' },
      pkgs: 'standalone.sty\namsmath.sty\nxcolor.sty\ndsfont.sty\n',
    })
    await $.session.start(START)
    await mountText($, 'Completitud: $$\\sum_n |n\\rangle\\langle n| = \\mathbb{1}$$')
    const tex = writes.find((w) => w.path.endsWith('.tex'))?.text ?? ''
    expect(tex).toContain('\\mathds{1}')
    expect(tex).not.toContain('\\mathbb{1}')
    expect(tex).toContain('dsfont')
  })

  test('without dsfont it falls back to a bold one', async ($, on) => {
    const { writes } = machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    await $.session.start(START)
    await mountText($, 'Completitud: $$\\mathbb{1}$$')
    expect(writes.find((w) => w.path.endsWith('.tex'))?.text).toContain('\\mathbf{1}')
  })
})

describe('formulas that need LaTeX are display equations', () => {
  test('an inline matrix is centered with air around it, like a $$ block', async ($, on) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const inline = await mountText($, 'La rotación es $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ y ya.')
    const display = await mountText($, 'La rotación es\n\n$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$\n\ny ya.')
    const box = (tree: unknown) => JSON.stringify(tree).match(/"alignItems":"center"[^}]*"marginY":1|"marginY":1[^}]*"alignItems":"center"/)
    expect(box(await inline.drawn())).not.toBeNull()
    expect(box(await display.drawn())).not.toBeNull()
  })

  test('a short formula stays in the line', async ($, on) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const ui = await mountText($, 'Con $E = mc^2$ y $|\\psi\\rangle$ seguimos.')
    expect((await ui.find({ text: /E = mc²/ }))?.text).toContain('|ψ⟩ seguimos.')
  })
})

describe('old-style LaTeX still reads as text', () => {
  test('{\\rm eff} in a superscript stays in the line', async ($, on) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const ui = await mountText($, 'El potencial $V^{\\rm eff}$ cumple $dV^{\\rm eff}/dR = \\frac{1}{3}(\\kappa T + 2f - R f_R)$ siempre.')
    const t = (await ui.find({ text: /Vᵉᶠᶠ/ }))?.text ?? ''
    expect(t).toContain('El potencial Vᵉᶠᶠ cumple dVᵉᶠᶠ/dR = 1/3(κT + 2f - R f')
    expect(t).toContain('siempre.')
  })

  test('size commands and \\bf do not send a formula to LaTeX', async ($, on) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const ui = await mountText($, 'Con $\\bigl(x\\bigr)$ y ${\\bf v}$ y $\\left\\lVert x \\right\\rVert$ listo.')
    expect((await ui.find({ text: /\(x\)/ }))?.text).toContain('listo.')
  })
})

describe('what Unicode can write stays in the line', () => {
  const lineOf = async ($: any, on: any, tex: string) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const ui = await mountText($, `Antes $${tex}$ después.`)
    return (await ui.find({ text: /después\./ }))?.text ?? ''
  }
  const cases: [string, string][] = [
    ['\\gcd(a,b)', 'gcd(a,b)'],
    ['\\Pr(A\\mid B)', 'Pr(A | B)'],
    ['\\binom{n}{k}', 'C(n,k)'],
    ['\\sqrt[3]{x}', '∛x'],
    ['{a+b \\over c}', '(a+b)/c'],
    ['\\mathbb{E}[X]', '𝔼[X]'],
    ['\\mathfrak{g}', '𝔤'],
    ['\\mathcal{O}(\\epsilon^2)', '𝒪(ε²)'],
    ['\\overline{xy}', 'x̅y̅'],
    ['^{235}\\mathrm{U}', '²³⁵U'],
    ['e^{i\\pi}', 'e^(iπ)'],
    ['T^{\\mu\\nu}', 'T^μν'],
    ['\\lambda_{\\rm eff}', 'λ\\_eff'],
  ]
  for (const [tex, out] of cases) {
    test(`$${tex}$ -> ${out}`, async ($, on) => {
      expect(await lineOf($, on, tex)).toContain(`Antes ${out} después.`)
    })
  }

  test('things that really need LaTeX still become an equation', async ($, on) => {
    machine(on, { bare: ['latex', 'dvipng', 'kpsewhich', 'perl'], env: { HOME: '/home/f' } })
    const ui = await mountText($, 'Antes $\\underbrace{a+b}_{n}$ después.')
    expect(await ui.find({ type: 'Image' })).toBeDefined() // drawn as a picture, not squeezed into the line
  })
})
