import type { Register } from 'claude-code'

const LATEX = '/Library/TeX/texbin/latex'
const DVIPNG = '/Library/TeX/texbin/dvipng'
const DPI = 600

type Piece =
  | { kind: 'text'; text: string; code?: true }
  | { kind: 'math'; tex: string; raw: string }

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}
const SYMBOLS: Record<string, string> = {
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', pm: '±', mp: '∓',
  times: '×', cdot: '·', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫',
  oint: '∮', to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', mapsto: '↦', in: '∈', notin: '∉',
  subset: '⊂', supset: '⊃', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
  ldots: '…', cdots: '⋯', dots: '…', hbar: 'ℏ', ell: 'ℓ', propto: '∝', sim: '∼', equiv: '≡',
  langle: '⟨', rangle: '⟩', dagger: '†', circ: '∘', degree: '°', emptyset: '∅', neg: '¬',
  land: '∧', lor: '∨', wedge: '∧', vee: '∨', oplus: '⊕', otimes: '⊗', perp: '⊥', parallel: '∥',
  mid: '|', ll: '≪', gg: '≫', angle: '∠', prime: '′', star: '⋆', ast: '∗', div: '÷',
  lbrace: '{', rbrace: '}', lvert: '|', rvert: '|', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
}
const FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'det', 'max', 'min', 'lim', 'sup', 'inf', 'arg', 'dim', 'ker', 'Tr', 'tr']
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ',
  g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ',
  t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ', '′': '′', '†': '†', '°': '°', '*': '*',
}
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ',
  l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
}
const CAL: Record<string, string> = { L: 'ℒ', H: 'ℋ', F: 'ℱ', B: 'ℬ', E: 'ℰ', I: 'ℐ', M: 'ℳ', R: 'ℛ' }
const BB: Record<string, string> = { R: 'ℝ', C: 'ℂ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', H: 'ℍ', P: 'ℙ' }
const ACCENT: Record<string, string> = { slashed: '\u0338', vec: '⃗', hat: '̂', bar: '̄', overline: '̄', tilde: '̃', dot: '̇', ddot: '̈' }
const WORD = /^[\p{L}\p{N}\p{M}.]+$/u

// Converts the LaTeX of an inline formula to plain Unicode, or null when it
// cannot be written faithfully in one line of text (the caller then draws it
// as an image instead).
function toUnicode(tex: string): string | null {
  let i = 0
  let ok = true
  const fail = (): string => {
    ok = false
    return ''
  }
  const script = (arg: string, table: Record<string, string>): string => {
    let out = ''
    for (const ch of arg) {
      const m = table[ch]
      if (m === undefined) return fail()
      out += m
    }
    return out
  }
  const group = (s: string): string => (WORD.test(s) ? s : `(${s})`)
  function arg(): string {
    while (tex[i] === ' ') i++
    if (i >= tex.length) return fail()
    if (tex[i] === '{') {
      i++
      const r = seq(true)
      if (tex[i] !== '}') return fail()
      i++
      return r
    }
    if (tex[i] === '\\') return command()
    return tex[i++]
  }
  function command(): string {
    i++ // the backslash
    let name = ''
    if (/[a-zA-Z]/.test(tex[i] ?? '')) {
      while (/[a-zA-Z]/.test(tex[i] ?? '')) name += tex[i++]
    } else {
      name = tex[i++] ?? ''
    }
    // A space ending a letter-command (`\\partial \\psi`) is not printed in LaTeX.
    const glue = () => {
      let j = i
      while (tex[j] === ' ') j++
      if (j > i && /[a-zA-Z\\]/.test(tex[j] ?? '')) i = j
    }
    if (GREEK[name] || name === 'partial' || name === 'nabla' || name === 'hbar' || name === 'ell') {
      glue()
      return GREEK[name] ?? SYMBOLS[name]
    }
    if (SYMBOLS[name]) return SYMBOLS[name]
    if (FUNCS.includes(name)) return /[a-zA-Z\\]/.test(tex[i] ?? '') ? name + ' ' : name
    if (ACCENT[name]) {
      const base = arg()
      return [...base].length === 1 ? base + ACCENT[name] : fail()
    }
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac': {
        const n = arg()
        const d = arg()
        return n.length + d.length > 24 ? fail() : `${group(n)}/${group(d)}`
      }
      case 'sqrt': {
        if (tex[i] === '[') return fail()
        return '√' + group(arg())
      }
      case 'text': case 'mathrm': case 'textrm': case 'mathit': case 'operatorname':
      case 'mathbf': case 'boldsymbol': case 'bm': case 'mathsf': case 'textbf':
        return arg()
      case 'mathcal': {
        const a = arg()
        return CAL[a] ?? (/^[A-Za-z]$/.test(a) ? a : fail())
      }
      case 'mathbb': {
        const a = arg()
        return BB[a] ?? (/^[A-Za-z]$/.test(a) ? a : fail())
      }
      case 'left': case 'right':
        if (tex[i] === '.') i++
        return ''
      case ',': case ';': case ':': case ' ': return ' '
      case '!': return ''
      case 'quad': case 'qquad': return '  '
      case '{': case '}': case '|': case '%': case '&': case '#': case '$':
        return name === '|' ? '‖' : name
      default:
        return fail()
    }
  }
  function atom(): string {
    const c = tex[i]
    let base: string
    if (c === '\\') base = command()
    else if (c === '{') {
      i++
      base = seq(true)
      if (tex[i] !== '}') return fail()
      i++
    } else if (c === '^' || c === '_') {
      return fail()
    } else {
      i++
      base = c === "'" ? '′' : c === '~' ? ' ' : c === '*' ? '∗' : c
    }
    while (ok && (tex[i] === '^' || tex[i] === '_')) {
      const up = tex[i++] === '^'
      const a = arg()
      if (!ok) return ''
      base += script(a, up ? SUP : SUB)
    }
    return base
  }
  function seq(inGroup: boolean): string {
    let out = ''
    while (i < tex.length && ok) {
      if (tex[i] === '}') return inGroup ? out : fail()
      out += atom()
    }
    return out
  }
  const result = seq(false)
  return ok ? result.replace(/ {2,}/g, ' ').trim() : null
}

// Inline `$...$` (pandoc rules: no space inside the delimiters, no digit right
// after the closing one, so `$5 and $10` stays a price). Inline code is left alone.
function inlineScan(chunk: string, push: (p: Piece) => void) {
  const inline = /(?<![\\$])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?!\d)/g
  const run = (t: string) => {
    let from = 0
    let buf = ''
    for (const m of t.matchAll(inline)) {
      buf += t.slice(from, m.index)
      const u = toUnicode(m[1])
      if (u !== null) {
        buf += u
      } else {
        if (buf) push({ kind: 'text', text: buf })
        buf = ''
        push({ kind: 'math', tex: m[1].trim(), raw: m[0] })
      }
      from = (m.index ?? 0) + m[0].length
    }
    buf += t.slice(from)
    if (buf) push({ kind: 'text', text: buf })
  }
  let at = 0
  for (const c of chunk.matchAll(/`[^`\n]*`/g)) {
    run(chunk.slice(at, c.index))
    push({ kind: 'text', text: c[0], code: true })
    at = (c.index ?? 0) + c[0].length
  }
  run(chunk.slice(at))
}

// Splits a message into text and math pieces. Fenced code is left alone; an
// unclosed `$$` (still streaming) stays text.
function split(text: string): Piece[] {
  const pieces: Piece[] = []
  const push = (p: Piece) => pieces.push(p)
  const fence = /```[\s\S]*?(```|$)/g
  const math = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g
  let last = 0
  const scan = (chunk: string) => {
    let at = 0
    for (const m of chunk.matchAll(math)) {
      const tex = (m[1] ?? m[2] ?? '').trim()
      inlineScan(chunk.slice(at, m.index), push)
      if (tex) push({ kind: 'math', tex, raw: m[0] })
      else push({ kind: 'text', text: m[0] })
      at = (m.index ?? 0) + m[0].length
    }
    inlineScan(chunk.slice(at), push)
  }
  for (const f of text.matchAll(fence)) {
    scan(text.slice(last, f.index))
    push({ kind: 'text', text: f[0], code: true })
    last = (f.index ?? 0) + f[0].length
  }
  scan(text.slice(last))
  // Neighbouring text stays one block, so a paragraph, a list or a code span
  // is not cut into separate lines; only a drawn equation breaks the text.
  const merged: Piece[] = []
  for (const p of pieces) {
    const prev = merged[merged.length - 1]
    if (p.kind === 'text' && prev?.kind === 'text') merged[merged.length - 1] = { kind: 'text', text: prev.text + p.text }
    else merged.push(p)
  }
  return merged
}

function hash(s: string): string {
  let h1 = 5381
  let h2 = 52711
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = ((h1 * 33) ^ c) >>> 0
    h2 = ((h2 * 31) + c * 2654435761) >>> 0
  }
  return h1.toString(36) + h2.toString(36)
}

// File access, shell and macro-definition primitives: never compiled.
const FORBIDDEN = /\\(input|include|openin|openout|read|readline|write|immediate|special|usepackage|documentclass|catcode|csname|InputIfFileExists|verbatiminput|lstinputlisting)(?![a-zA-Z])/

async function themeColor($: any): Promise<string> {
  const row = (await $.config.list()).find((r: any) => r.key === 'theme')
  return String(row?.value ?? 'dark').includes('light') ? '1F2430' : 'D8DEE9'
}

type Img = { b64: string; cols: number; rows: number }

// How much larger than the terminal's own text an equation is drawn; `/math size N`.
let scale = 1.75
// What the last equation was laid out as, for `/math debug`.
let lastLayout = ''
// The last LaTeX error, for `/math debug`.
let lastError = ''
// Optional LaTeX packages found on this machine, loaded before every equation.
let pkgs: string[] = []

const cache = new Map<string, Img | null>()

// LaTeX sources of the equations drawn so far, oldest first, for `/math copy`.
const recent: string[] = []
function remember(tex: string) {
  if (!recent.includes(tex)) {
    recent.push(tex)
    if (recent.length > 50) recent.shift()
  }
}

// Compiles one equation to a PNG whose size is a whole number of terminal
// cells at `sc` times the text size: TeX pads the equation to that grid, so it
// is drawn undistorted whatever its own shape. The white corner marks keep
// dvipng from cropping the padding away.
async function render($: any, tex: string, color: string, sc: number, ratio: number): Promise<Img | null> {
  if (FORBIDDEN.test(tex)) return null
  const cw = 7 / sc // TeX points per terminal column
  const ch = 7 / ratio / sc // and per terminal row
  const key = hash(`${DPI}|${color}|${cw.toFixed(3)}|${ch.toFixed(3)}|${pkgs.length}|${tex}`)
  if (cache.has(key)) return cache.get(key) ?? null
  const home = (await $.env.get('HOME')) ?? ''
  const dir = `${home}/.cache/claude-terminal-math`
  const png = `${dir}/${key}.png`
  try {
    if (!(await $.fs.exists(png))) {
      // With every optional package, then, if that fails, with the basic ones.
      for (const extra of pkgs.length ? [pkgs, []] : [[]]) {
        await $.fs.write(
          `${dir}/${key}.tex`,
          [
            '\\documentclass[border=0pt]{standalone}',
            '\\usepackage{amsmath,amssymb,xcolor}',
            extra.length ? `\\usepackage{${extra.join(',')}}` : '',
            `\\definecolor{fg}{HTML}{${color}}`,
            '\\newsavebox{\\eqbox}',
            `\\newdimen\\cellw \\cellw=${cw.toFixed(4)}pt`,
            `\\newdimen\\cellh \\cellh=${ch.toFixed(4)}pt`,
            '\\def\\cornermark{{\\color{white}\\rule{0.3pt}{0.3pt}}}',
            '\\begin{document}',
            `\\sbox{\\eqbox}{\\color{fg}$\\displaystyle ${tex}$}`,
            '\\dimen0=\\wd\\eqbox \\advance\\dimen0 by 6pt',
            '\\dimen1=\\ht\\eqbox \\advance\\dimen1 by \\dp\\eqbox \\advance\\dimen1 by 4pt',
            '\\count1=\\numexpr(\\number\\dimen0+\\number\\cellw/2-1)/\\number\\cellw\\relax',
            '\\count2=\\numexpr(\\number\\dimen1+\\number\\cellh/2-1)/\\number\\cellh\\relax',
            '\\dimen2=\\count1\\cellw \\dimen3=\\count2\\cellh',
            '\\vbox to \\dimen3{\\hbox to \\dimen2{\\cornermark\\hss\\cornermark}\\vss\\hbox to \\dimen2{\\hss\\usebox{\\eqbox}\\hss}\\vss\\hbox to \\dimen2{\\cornermark\\hss\\cornermark}}',
            '\\end{document}',
            '',
          ].join('\n'),
        )
        const l = await $.process.run(
          [LATEX, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', `${key}.tex`],
          { cwd: dir, timeoutMs: 20000, env: { openin_any: 'p', openout_any: 'p' } },
        )
        if (l.exitCode === 0) {
          lastError = ''
          break
        }
        lastError = String(l.stdout).split('\n').find((x: string) => x.startsWith('!')) ?? 'latex failed'
        lastError += `  [${tex.slice(0, 60)}]`
        if (extra.length === 0) throw new Error(lastError)
      }
      const d = await $.process.run(
        [DVIPNG, '-T', 'tight', '-bg', 'Transparent', '-D', String(DPI), '-o', `${key}.png`, `${key}.dvi`],
        { cwd: dir, timeoutMs: 20000 },
      )
      if (d.exitCode !== 0) throw new Error('dvipng failed')
    }
    const { base64 } = await $.fs.read(png, { as: 'bytes' })
    const bytes = Uint8Array.fromBase64(base64)
    const view = new DataView(bytes.buffer, bytes.byteOffset)
    const toCells = (px: number, cell: number) => Math.min(255, Math.max(1, Math.round((px * 72.27) / DPI / cell)))
    const img = { b64: base64, cols: toCells(view.getUint32(16), cw), rows: toCells(view.getUint32(20), ch) }
    cache.set(key, img)
    return img
  } catch (err) {
    $.ui.log(`terminal-math: ${String(err)}`, { to: 'debug' })
    cache.set(key, null)
    return null
  }
}

// Ratio of a terminal cell's width to its height (about 0.46 in Ghostty),
// measured at session start; 0.5 until then or when the terminal cannot say.
let cellRatio = 0.5

// Finds the tty of the process tree we run under and asks it for its size in
// cells and pixels (TIOCGWINSZ). perl, since macOS's python3 is a stub.
const MEASURE = [
  'my $pid = getppid();',
  'for (1..10) {',
  '  my $t = `ps -o tty= -p $pid`; $t =~ s/\\s+//g;',
  "  if ($t ne '' && $t ne '??') {",
  '    open(my $f, "<", "/dev/$t") or last;',
  '    my $b = "\\0" x 8;',
  '    ioctl($f, 0x40087468, $b) or last;',
  '    print join(" ", unpack("S4", $b)), "\\n";',
  '    last;',
  '  }',
  '  $pid = `ps -o ppid= -p $pid`; $pid =~ s/\\s+//g;',
  '  last if $pid < 2;',
  '}',
].join('\n')

// The terminal's cell width over its cell height; null when it does not report pixels.
async function measureCell($: any): Promise<number | null> {
  try {
    const r = await $.process.run(['/usr/bin/perl', '-e', MEASURE], { timeoutMs: 5000 })
    const [rows, cols, xpix, ypix] = String(r.stdout).trim().split(/\s+/).map(Number)
    if (!rows || !cols || !xpix || !ypix) return null
    const ratio = xpix / cols / (ypix / rows)
    return ratio > 0.3 && ratio < 0.8 ? ratio : null
  } catch {
    return null
  }
}

const REQUIRED = ['standalone', 'amsmath', 'xcolor']
const OPTIONAL = [
  'mathtools', 'bm', 'mathrsfs', 'cancel', 'physics', 'siunitx', 'tensor', 'upgreek', 'esint',
  'stmaryrd', 'dsfont', 'mhchem', 'cases', 'units', 'nicefrac', 'xfrac', 'accents', 'extarrows',
  'yhmath', 'mathdots', 'slashed',
]

// Names what is missing from the TeX install, and which optional packages it has.
async function scanTeX($: any): Promise<{ missing: string[]; pkgs: string[] }> {
  const missing: string[] = []
  if (!(await $.fs.exists(LATEX))) missing.push('latex')
  if (!(await $.fs.exists(DVIPNG))) missing.push('dvipng')
  let found: string[] = []
  if (missing.length === 0) {
    const k = await $.process
      .run(['/Library/TeX/texbin/kpsewhich', ...[...REQUIRED, ...OPTIONAL].map((n) => `${n}.sty`)], { timeoutMs: 10000 })
      .catch(() => null)
    found = String(k?.stdout ?? '').split('\n').map((l: string) => l.trim().split('/').pop() ?? '')
    for (const pkg of REQUIRED) if (!found.includes(`${pkg}.sty`)) missing.push(`${pkg}.sty`)
  }
  return { missing, pkgs: OPTIONAL.filter((n) => found.includes(`${n}.sty`)) }
}

export const register: Register = (on) => {
  let enabled = true
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'math',
      description: 'LaTeX math as images: /math on | off | size N | copy [N] | list | debug',
    })
    enabled = (await $.store.get('enabled')) !== false
    const saved = Number(await $.store.get('scale'))
    if (saved >= 0.5 && saved <= 5) scale = saved
    $.ui.status(enabled ? '∑ math' : undefined)
    const home = (await $.env.get('HOME')) ?? ''
    // Old renders are dropped when a session opens; nothing has to run at close.
    await $.process
      .run(['find', `${home}/.cache/claude-terminal-math`, '-type', 'f', '-mtime', '+30', '-delete'])
      .catch(() => undefined)
    cellRatio = (await measureCell($)) ?? 0.5
    // A missing TeX install is reported once, and again only if what is missing changes.
    const tex = await scanTeX($)
    pkgs = tex.pkgs
    const missing = tex.missing.join(', ')
    const warned = await $.store.get('depsWarned')
    if (missing && warned !== missing) {
      $.ui.toast(`terminal-math: missing ${missing}; equations stay as text. Install MacTeX/TeX Live.`)
      await $.store.set('depsWarned', missing)
    } else if (!missing && warned) {
      await $.store.delete('depsWarned')
    }
    return next(e)
  })

  on('command.run', { command: 'math' }, async ($, e) => {
    const [a = '', n = ''] = e.args.trim().split(/\s+/)
    if (a === 'debug') return { text: [lastLayout || 'No equation drawn yet.', lastError && `Last LaTeX error: ${lastError}`].filter(Boolean).join('\n') }
    if (a === 'size') {
      const v = Number(n.replace(',', '.'))
      if (!(v >= 0.5 && v <= 5)) return { text: `size is ${scale}; use /math size N with N between 0.5 and 5` }
      scale = v
      await $.store.set('scale', v)
      $.ui.invalidate('ui.render')
      return { text: `equation size ${v} (remembered)` }
    }
    if (a === 'copy' || a === 'list') {
      if (recent.length === 0) return { text: 'No equations drawn yet.' }
      if (a === 'list') {
        const last = recent.slice(-5).reverse()
        return { text: last.map((t, i) => `${i + 1}. ${t}`).join('\n') + '\n(/math copy N copies number N)' }
      }
      const tex = recent[recent.length - (Number(n) || 1)]
      if (!tex) return { text: `There is no equation number ${n}; /math list shows the last five.` }
      const r = await $.ui.copy({ text: tex })
      return { text: r.isCopied ? `Copied LaTeX: ${tex}` : `Could not copy: ${r.reason}` }
    }
    enabled = a === 'on' ? true : a === 'off' ? false : a === '' ? !enabled : enabled
    await $.store.set('enabled', enabled)
    $.ui.status(enabled ? '∑ math' : undefined)
    $.ui.invalidate('ui.render') // redraw the messages already on screen
    return { text: `math rendering ${enabled ? 'on' : 'off'} (remembered)` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text: string = e.props.text
    if (!enabled || !text.includes('$') && !text.includes('\\[')) return next(e)
    const pieces = split(text)
    const changed = pieces.some((p) => p.kind === 'math') || pieces.map((p) => (p.kind === 'text' ? p.text : '')).join('') !== text
    if (!changed) return next(e)

    const { Box, Markdown, Image, Text } = $.ui.resolve(e)
    const color = await themeColor($)
    const out: any[] = []
    for (const [i, p] of pieces.entries()) {
      if (p.kind === 'text') {
        out.push(<Markdown key={`t${i}`} text={p.text} />)
        continue
      }
      remember(p.tex)
      const room = Math.max(8, (e.viewport?.columns ?? 100) - 4)
      let img = await render($, p.tex, color, scale, cellRatio)
      // Wider than the pane: draw it again smaller instead of stretching it.
      if (img && img.cols > room) img = (await render($, p.tex, color, (scale * room * 0.97) / img.cols, cellRatio)) ?? img
      if (img) {
        lastLayout = `viewport ${e.viewport?.columns ?? '?'}x${e.viewport?.rows ?? '?'}, room ${room}, drawn ${img.cols}x${img.rows} cells, scale ${scale}, cell ratio ${cellRatio.toFixed(3)}, ${pkgs.length} extra packages`
      }
      out.push(
        img ? (
          <Box key={`m${i}`} flexDirection="column" alignItems="center" marginY={1}>
            <Image source={{ png: img.b64 }} columns={img.cols} rows={img.rows} alt={p.raw} />
          </Box>
        ) : (
          <Markdown key={`m${i}`} text={p.raw} />
        ),
      )
    }
    // The engine's own message keeps its first column for the bullet; so do we.
    return e.props.isFirstOfReply ? (
      <Box flexDirection="row">
        <Text>⏺ </Text>
        <Box flexDirection="column" flexGrow={1}>{out}</Box>
      </Box>
    ) : (
      <Box flexDirection="column" paddingLeft={2}>{out}</Box>
    )
  })
}
