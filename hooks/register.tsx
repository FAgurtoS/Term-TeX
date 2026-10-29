import type { Register } from 'claude-code'

const DPI = 450

type Platform = 'mac' | 'linux' | 'win'

// Where things live on this machine; found once when a session starts.
let platform: Platform = 'mac'
let latexBin = 'latex'
let dvipngBin = 'dvipng'
let kpsewhichBin: string | null = 'kpsewhich'
let perlBin: string | null = null
// perl can pad pictures to the cell grid only with its Compress::Zlib module.
let perlGrid = false

// Bump when what is kept in the cache changes shape; the next start empties it.
const CACHE_GEN = 3

const TEX_YEARS = ['2030', '2029', '2028', '2027', '2026', '2025', '2024', '2023', '2022']

// Places a TeX tool may be, best first: on PATH, then the usual install spots.
function toolCandidates(name: string, plat: Platform, home: string, local: string): string[] {
  const out = [name]
  if (plat === 'mac') {
    out.push(`/Library/TeX/texbin/${name}`, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`)
  } else if (plat === 'linux') {
    out.push(`/usr/bin/${name}`, `/usr/local/bin/${name}`, `${home}/.local/bin/${name}`)
    for (const y of TEX_YEARS) {
      for (const arch of ['x86_64-linux', 'aarch64-linux']) {
        out.push(`/usr/local/texlive/${y}/bin/${arch}/${name}`, `${home}/texlive/${y}/bin/${arch}/${name}`)
      }
    }
  } else {
    out.push(`${local}/Programs/MiKTeX/miktex/bin/x64/${name}.exe`, `C:/Program Files/MiKTeX/miktex/bin/x64/${name}.exe`)
    for (const y of TEX_YEARS) out.push(`C:/texlive/${y}/bin/windows/${name}.exe`, `C:/texlive/${y}/bin/win64/${name}.exe`)
  }
  return out
}

// perl is optional (it pads pictures and measures the terminal); TeX Live for
// Windows ships one, and so does Git for Windows.
function perlCandidates(plat: Platform): string[] {
  if (plat === 'win') {
    return ['perl', 'C:/Program Files/Git/usr/bin/perl.exe', ...TEX_YEARS.map((y) => `C:/texlive/${y}/tlpkg/tlperl/bin/perl.exe`)]
  }
  return ['perl', '/usr/bin/perl', '/usr/local/bin/perl', '/opt/homebrew/bin/perl']
}

// The first candidate that runs (a bare name goes through PATH) or exists (a full path).
async function firstThatWorks($: any, candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    if (/[\\/]/.test(c)) {
      if (await $.fs.exists(c)) return c
    } else {
      const r = await $.process.run([c, '--version'], { timeoutMs: 8000 }).catch(() => null)
      if (r && r.exitCode === 0) return c
    }
  }
  return null
}

async function detectPlatform($: any): Promise<Platform> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'win'
  return (await $.fs.exists('/System/Library/CoreServices')) ? 'mac' : 'linux'
}

// Where renders are kept: ~/.cache (or $XDG_CACHE_HOME) on macOS and Linux, %LOCALAPPDATA% on Windows.
async function cacheDir($: any): Promise<string> {
  if (platform === 'win') {
    const base = (await $.env.get('LOCALAPPDATA')) ?? (await $.env.get('USERPROFILE')) ?? 'C:/Temp'
    return `${String(base).replaceAll('\\', '/')}/term-latex`
  }
  const xdg = await $.env.get('XDG_CACHE_HOME')
  if (xdg) return `${xdg}/term-latex`
  return `${(await $.env.get('HOME')) ?? ''}/.cache/term-latex`
}

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
  Box: '□', square: '□', blacksquare: '■', triangle: '△', bullet: '•', therefore: '∴', because: '∵',
  varnothing: '∅', setminus: '∖', lesssim: '≲', gtrsim: '≳', simeq: '≃', cong: '≅', doteq: '≐',
  rightleftharpoons: '⇌', uparrow: '↑', downarrow: '↓', Uparrow: '⇑', Downarrow: '⇓', longrightarrow: '⟶',
  longleftarrow: '⟵', Longrightarrow: '⟹', Longleftarrow: '⟸', hookrightarrow: '↪', lfloor: '⌊',
  rfloor: '⌋', lceil: '⌈', rceil: '⌉', sqcup: '⊔', sqcap: '⊓', bigcup: '⋃', bigcap: '⋂', nmid: '∤',
  lbrace: '{', rbrace: '}', lvert: '|', rvert: '|', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
}
const FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'det', 'max', 'min', 'lim', 'sup', 'inf', 'arg', 'dim', 'ker', 'Tr', 'tr']
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ',
  g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ',
  t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ',
  O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ', β: 'ᵝ', γ: 'ᵞ', δ: 'ᵟ', θ: 'ᶿ', φ: 'ᵠ', χ: 'ᵡ',
  '′': '′', '†': '†', '°': '°', '*': '∗',
}
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ',
  l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', β: 'ᵦ', γ: 'ᵧ', ρ: 'ᵨ', φ: 'ᵩ', χ: 'ᵪ',
}
const CAL: Record<string, string> = { L: 'ℒ', H: 'ℋ', F: 'ℱ', B: 'ℬ', E: 'ℰ', I: 'ℐ', M: 'ℳ', R: 'ℛ' }
const BB: Record<string, string> = { '1': '𝟙', R: 'ℝ', C: 'ℂ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', H: 'ℍ', P: 'ℙ' }
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
  // A sub/superscript with a Unicode form is drawn as such; one without (`_R`,
  // `^∞`) stays on the line as plain text, which beats breaking the sentence.
  const script = (arg: string, table: Record<string, string>, up: boolean): string => {
    let out = ''
    for (const ch of arg) {
      const m = table[ch]
      if (m === undefined) return (up ? '^' : '\\_') + (WORD.test(arg) || [...arg].length === 1 ? arg : `(${arg})`)
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
      base += script(a, up ? SUP : SUB, up)
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

// A formula that Unicode cannot write is not kept inline: it becomes a display equation
// (centered, with air around it), exactly as if it had been written with `$$`.
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
// dvipng never draws less than a pixel, so the corner marks that keep the padding
// come out as white dots; this perl script (zlib is in its core) makes them transparent.
const CLEAR_CORNERS = String.raw`use strict; use Compress::Zlib;
my ($in, $out) = @ARGV;
open(my $fh, '<:raw', $in) or die; local $/; my $d = <$fh>; close $fh;
my ($pos, $idat, $w, $h, $ct) = (8, '');
while ($pos < length $d) {
  my ($n, $t) = unpack('Na4', substr($d, $pos, 8));
  my $c = substr($d, $pos + 8, $n);
  if ($t eq 'IHDR') { ($w, $h, undef, $ct) = unpack('NNCC', $c) }
  $idat .= $c if $t eq 'IDAT';
  $pos += 12 + $n;
}
die "rgba only" unless $ct == 6;
my $raw = uncompress($idat); my $bpp = 4; my $stride = $w * $bpp;
my @rows; my $prev = "\0" x $stride; my $p = 0;
for my $y (0 .. $h - 1) {
  my $f = ord substr($raw, $p, 1); my @l = unpack('C*', substr($raw, $p + 1, $stride)); $p += 1 + $stride;
  my @pr = unpack('C*', $prev);
  for my $x (0 .. $stride - 1) {
    my $a = $x >= $bpp ? $l[$x - $bpp] : 0; my $b = $pr[$x]; my $c = $x >= $bpp ? $pr[$x - $bpp] : 0;
    if ($f == 1) { $l[$x] = ($l[$x] + $a) & 255 }
    elsif ($f == 2) { $l[$x] = ($l[$x] + $b) & 255 }
    elsif ($f == 3) { $l[$x] = ($l[$x] + (($a + $b) >> 1)) & 255 }
    elsif ($f == 4) { my $pa = abs($b-$c); my $pb = abs($a-$c); my $pc = abs($a+$b-2*$c);
      my $q = ($pa <= $pb && $pa <= $pc) ? $a : ($pb <= $pc ? $b : $c); $l[$x] = ($l[$x] + $q) & 255 }
  }
  push @rows, \@l; $prev = pack('C*', @l);
}
# erase the 4 corner marks (any pixel within 3px of a corner)
for my $y (0 .. $h - 1) { for my $x (0 .. $w - 1) {
  next unless ($x < 4 || $x >= $w - 4) && ($y < 4 || $y >= $h - 4);
  @{$rows[$y]}[$x*4 .. $x*4+3] = (0,0,0,0);
} }
my $new = join '', map { "\0" . pack('C*', @$_) } @rows;
my $z = compress($new);
sub chunk { my ($t, $b) = @_; pack('N', length $b) . $t . $b . pack('N', crc32($t . $b)) }
open(my $o, '>:raw', "$out.part") or die;
print $o "\x89PNG\r\n\x1a\n", chunk('IHDR', pack('NNCCCCC', $w, $h, 8, 6, 0, 0, 0)), chunk('IDAT', $z), chunk('IEND', '');
close $o;
rename("$out.part", $out) or die "rename: $!";`

const FORBIDDEN = /\\(input|include|openin|openout|read|readline|write|immediate|special|usepackage|documentclass|catcode|csname|InputIfFileExists|verbatiminput|lstinputlisting)(?![a-zA-Z])/

const DARK_INK = 'D8DEE9'
const LIGHT_INK = '1F2430'

// Whether the terminal is dark, as best it can be told: the terminal's own
// COLORFGBG, then the system's light/dark setting; null when neither says.
let autoDark: boolean | null = null
// How the ink colour was chosen, for `/math debug`.
let colorInfo = ''

async function detectAppearance($: any): Promise<boolean | null> {
  const fgbg = String((await $.env.get('COLORFGBG')) ?? '')
  if (fgbg) {
    const bg = Number(fgbg.split(';').pop())
    if (Number.isFinite(bg)) return bg <= 6 || bg === 8 // the dark entries of the 16-colour palette
  }
  try {
    if (platform === 'mac') {
      // Light mode has no AppleInterfaceStyle at all, so the command fails then.
      const r = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 5000 })
      return r.exitCode === 0 && /dark/i.test(String(r.stdout))
    }
    if (platform === 'linux') {
      const r = await $.process.run(['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'], { timeoutMs: 5000 })
      if (r.exitCode === 0) return /dark/i.test(String(r.stdout))
    }
    if (platform === 'win') {
      const r = await $.process.run(
        ['reg', 'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'],
        { timeoutMs: 5000 },
      )
      if (r.exitCode === 0) return /0x0\b/.test(String(r.stdout))
    }
  } catch {
    // no way to tell
  }
  return null
}

// The colour equations are drawn in: set by hand (`/math color`), else from the
// Claude Code theme; for "auto" and unknown themes, from the detected appearance.
async function themeColor($: any): Promise<string> {
  const manual = String((await $.store.get('color')) ?? '')
  if (manual === 'dark' || manual === 'light') {
    colorInfo = `set by hand: ${manual}`
    return manual === 'dark' ? DARK_INK : LIGHT_INK
  }
  if (/^[0-9A-Fa-f]{6}$/.test(manual)) {
    colorInfo = `set by hand: ${manual.toUpperCase()}`
    return manual.toUpperCase()
  }
  const row = (await $.config.list()).find((r: any) => r.key === 'theme')
  const name = String(row?.value ?? 'dark')
  let dark: boolean
  if (name.includes('light')) dark = false
  else if (name.includes('dark')) dark = true
  else dark = autoDark ?? true
  colorInfo = `theme "${name}"${name.includes('light') || name.includes('dark') ? '' : autoDark === null ? ', appearance unknown, assuming dark' : `, detected ${autoDark ? 'dark' : 'light'}`} -> ${dark ? 'light' : 'dark'} ink`
  return dark ? DARK_INK : LIGHT_INK
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

// Which optional packages an equation needs, judged from the commands it uses, so
// the usual equation compiles with the basic set only (each package costs time).
const NEEDS: [string, RegExp][] = [
  ['physics', /\\(ket|bra|braket|ketbra|dd|qty|pdv|dv|expval|ev|mqty|pmqty|comm|acomm|grad|curl|laplacian|vb|va|vu|vdot|mel|ip|op|dmat|smat|var|cov|fdv|pderivative|order|eval)(?![a-zA-Z])/],
  ['bm', /\\bm(?![a-zA-Z])/],
  ['mathrsfs', /\\mathscr(?![a-zA-Z])/],
  ['cancel', /\\(cancel|bcancel|xcancel|cancelto)(?![a-zA-Z])/],
  ['siunitx', /\\(SI|si|num|ang|SIrange|numrange)(?![a-zA-Z])/],
  ['tensor', /\\(tensor|indices)(?![a-zA-Z])/],
  ['upgreek', /\\up[a-z]+(?![a-zA-Z])/],
  ['esint', /\\(oiint|oiiint|varoiint|fint|ointctrclockwise|sqint)(?![a-zA-Z])/],
  ['stmaryrd', /\\(llbracket|rrbracket|oast|obar|oslash|obslash|lightning|bigsqcap|mapsfrom|Lbag|Rbag)(?![a-zA-Z])/],
  ['dsfont', /\\mathds(?![a-zA-Z])/],
  ['mhchem', /\\(ce|pu)(?![a-zA-Z])/],
  ['cases', /\\begin\{(numcases|subnumcases)\}/],
  ['units', /\\(unit|unitfrac)(?![a-zA-Z])/],
  ['nicefrac', /\\nicefrac(?![a-zA-Z])/],
  ['xfrac', /\\sfrac(?![a-zA-Z])/],
  ['accents', /\\(accentset|underaccent|undertilde)(?![a-zA-Z])/],
  ['extarrows', /\\(xlongequal|xLongleftarrow|xLongrightarrow|xlongleftarrow|xlongrightarrow)(?![a-zA-Z])/],
  ['yhmath', /\\(wideparen|widearc)(?![a-zA-Z])/],
  ['mathdots', /\\iddots(?![a-zA-Z])/],
  ['slashed', /\\slashed(?![a-zA-Z])/],
  ['mathtools', /\\(coloneqq|eqqcolon|coloneq|eqcolon|Coloneqq|mathclap|mathrlap|mathllap|prescript|xmapsto|xhook[a-z]+|xLeft[a-z]+|xRight[a-z]+|xleftrightarrow|xrightleftharpoons|smashoperator|MoveEqLeft|bigtimes)(?![a-zA-Z])|\\begin\{(dcases|rcases|multlined|[pbvBV]?matrix\*)\}/],
]
function neededPkgs(tex: string, available: string[]): string[] {
  return NEEDS.filter(([name, re]) => available.includes(name) && re.test(tex)).map(([name]) => name)
}

// dvipng builds missing bitmap fonts the first time a resolution is used, and two
// of them doing that at once break each other; so they take turns (each is ~0.1 s).
let dvipngTurn: Promise<unknown> = Promise.resolve()

// Without perl the picture cannot be padded to the cell grid, so it is drawn at
// whole cells near its natural size, choosing the pair that keeps its proportions.
function fit(wPt: number, hPt: number, c0: number, ratio: number): [number, number] {
  const aspect = hPt / wPt
  let best: [number, number] = [Math.max(1, c0), Math.max(1, Math.round(c0 * aspect * ratio))]
  let bestErr = Infinity
  for (let c = Math.max(1, c0 - 3); c <= Math.min(255, c0 + 3); c++) {
    const r = Math.min(255, Math.max(1, Math.round(c * aspect * ratio)))
    const err = Math.abs(Math.log(r / (c * ratio) / aspect)) + (0.5 * Math.abs(c - c0)) / c0
    if (err < bestErr) {
      bestErr = err
      best = [c, r]
    }
  }
  return best
}

// Equations being compiled right now, so one equation twice in a message is built once.
const inflight = new Map<string, Promise<Img | null>>()

// Compiles one equation to a PNG whose size is a whole number of terminal
// cells at `sc` times the text size: TeX pads the equation to that grid, so it
// is drawn undistorted whatever its own shape. The white corner marks keep
// dvipng from cropping the padding away.
async function render($: any, tex: string, color: string, sc: number, ratio: number): Promise<Img | null> {
  if (FORBIDDEN.test(tex)) return null
  const cw = 7 / sc // TeX points per terminal column
  const ch = 7 / ratio / sc // and per terminal row
  const key = hash(`${DPI}|${perlGrid ? 'grid' : 'tight'}|${color}|${cw.toFixed(3)}|${ch.toFixed(3)}|${pkgs.length}|${tex}`)
  if (cache.has(key)) return cache.get(key) ?? null
  const running = inflight.get(key)
  if (running) return running
  const job = compile($, tex, color, cw, ch, key)
  inflight.set(key, job)
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

async function compile($: any, source: string, color: string, cw: number, ch: number, key: string): Promise<Img | null> {
  // `\mathbb{1}` looks right in MathJax/KaTeX but amssymb draws a different glyph for it;
  // the double-struck one comes from dsfont (else a bold one).
  const tex = source.replace(/\\mathbb\s*\{\s*1\s*\}/g, pkgs.includes('dsfont') ? '\\mathds{1}' : '\\mathbf{1}')
  const dir = await cacheDir($)
  const png = `${dir}/${key}.png`
  const grid = perlGrid // pad to the cell grid (needs perl with Compress::Zlib), else a tight picture
  const ratio = cw / ch
  try {
    if (!(await $.fs.exists(png))) {
      // With every optional package, then, if that fails, with the basic ones.
      const needed = neededPkgs(tex, pkgs)
      const attempts = needed.length === pkgs.length ? [needed] : [needed, pkgs]
      for (const [n, extra] of attempts.entries()) {
        await $.fs.write(
          `${dir}/${key}.tex`,
          [
            grid ? '\\documentclass[border=0pt]{standalone}' : '\\documentclass[border=2pt]{standalone}',
            '\\usepackage{amsmath,amssymb,xcolor}',
            extra.length ? `\\usepackage{${extra.join(',')}}` : '',
            `\\definecolor{fg}{HTML}{${color}}`,
            ...(grid
              ? [
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
                ]
              : ['\\begin{document}', `\\color{fg}$\\displaystyle ${tex}$`]),
            '\\end{document}',
            '',
          ].join('\n'),
        )
        const l = await $.process.run(
          [latexBin, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', `${key}.tex`],
          { cwd: dir, timeoutMs: 20000, env: { openin_any: 'p', openout_any: 'p' } },
        )
        if (l.exitCode === 0) {
          lastError = ''
          break
        }
        lastError = String(l.stdout).split('\n').find((x: string) => x.startsWith('!')) ?? 'latex failed'
        lastError += `  [${tex.slice(0, 60)}]`
        if (n === attempts.length - 1) throw new Error(lastError)
      }
      const runDvipng = () =>
        $.process.run(
          [dvipngBin, '-T', 'tight', '-bg', 'Transparent', '-D', String(DPI), '-o', grid ? `${key}.raw.png` : `${key}.png`, `${key}.dvi`],
          { cwd: dir, timeoutMs: 30000 },
        )
      let d: any
      for (let tries = 0; tries < 2; tries++) {
        const mine = dvipngTurn.catch(() => undefined).then(runDvipng)
        dvipngTurn = mine
        d = await mine
        if (d.exitCode === 0) break
      }
      if (d.exitCode !== 0) throw new Error(`dvipng failed: ${String(d.stderr).slice(0, 120)}`)
      // The finished picture appears all at once, never half written (perl renames it).
      if (grid) {
        const c = await $.process.run([perlBin, '-e', CLEAR_CORNERS, `${key}.raw.png`, png], { cwd: dir, timeoutMs: 20000 })
        if (c.exitCode !== 0) throw new Error(`corner cleanup failed: ${String(c.stderr).slice(0, 100)}`)
      }
    }
    const { base64 } = await $.fs.read(png, { as: 'bytes' })
    const bytes = Uint8Array.fromBase64(base64)
    const view = new DataView(bytes.buffer, bytes.byteOffset)
    const toCells = (px: number, cell: number) => Math.min(255, Math.max(1, Math.round((px * 72.27) / DPI / cell)))
    const wPx = view.getUint32(16)
    const hPx = view.getUint32(20)
    let cols = toCells(wPx, cw)
    let rows = toCells(hPx, ch)
    if (!grid) {
      // A tight picture: fit it to whole cells without distorting it.
      ;[cols, rows] = fit((wPx * 72.27) / DPI, (hPx * 72.27) / DPI, cols, ratio)
    }
    const img = { b64: base64, cols, rows }
    cache.set(key, img)
    return img
  } catch (err) {
    $.ui.log(`term-latex: ${String(err)}`, { to: 'debug' })
    lastError = String(err).replace(/^Error: /, '')
    // Only a LaTeX error is final; a process that was killed or a busy disk is tried again.
    if (String(err).includes('latex') || String(err).startsWith('Error: !')) cache.set(key, null)
    return null
  }
}

// Ratio of a terminal cell's width to its height (about 0.46 in Ghostty),
// measured at session start; 0.5 until then or when the terminal cannot say.
let cellRatio = 0.5

// Finds the tty of the process tree we run under and asks it for its size in
// cells and pixels (TIOCGWINSZ). perl, since macOS's python3 is a stub.
const MEASURE = [
  'exit if $^O eq "MSWin32";',
  'my $pid = getppid();',
  'for (1..10) {',
  '  my $t = `ps -o tty= -p $pid`; $t =~ s/\\s+//g;',
  "  if ($t ne '' && $t ne '??' && $t ne '?') {",
  '    open(my $f, "<", "/dev/$t") or last;',
  '    my $b = "\\0" x 8;',
  '    ioctl($f, $^O eq "darwin" ? 0x40087468 : 0x5413, $b) or last;',
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
    if (!perlBin) return null
    const r = await $.process.run([perlBin, '-e', MEASURE], { timeoutMs: 5000 })
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

// Finds the TeX tools (and perl) on this machine, names what is missing, and says
// which optional packages are installed.
async function scanTeX($: any): Promise<{ missing: string[]; pkgs: string[] }> {
  platform = await detectPlatform($)
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  const local = String((await $.env.get('LOCALAPPDATA')) ?? '').replaceAll('\\', '/')
  const missing: string[] = []
  const latex = await firstThatWorks($, toolCandidates('latex', platform, home, local))
  const dvipng = await firstThatWorks($, toolCandidates('dvipng', platform, home, local))
  if (latex) latexBin = latex
  else missing.push('latex')
  if (dvipng) dvipngBin = dvipng
  else missing.push('dvipng')
  perlBin = await firstThatWorks($, perlCandidates(platform))
  perlGrid = false
  if (perlBin) {
    const z = await $.process.run([perlBin, '-MCompress::Zlib', '-e', '1'], { timeoutMs: 8000 }).catch(() => null)
    perlGrid = !!z && z.exitCode === 0
  }
  kpsewhichBin = await firstThatWorks($, toolCandidates('kpsewhich', platform, home, local))
  let found: string[] = []
  if (missing.length === 0 && kpsewhichBin) {
    const k = await $.process
      .run([kpsewhichBin, ...[...REQUIRED, ...OPTIONAL].map((n) => `${n}.sty`)], { timeoutMs: 10000 })
      .catch(() => null)
    found = String(k?.stdout ?? '').split('\n').map((l: string) => l.trim().split(/[\\/]/).pop() ?? '')
    for (const pkg of REQUIRED) if (!found.includes(`${pkg}.sty`)) missing.push(`${pkg}.sty`)
  }
  return { missing, pkgs: OPTIONAL.filter((n) => found.includes(`${n}.sty`)) }
}

export const register: Register = (on) => {
  let enabled = true
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'math',
      description: 'LaTeX math as images: /math on | off | size N | color C | ratio R | copy [N] | list | reset | debug',
    })
    enabled = (await $.store.get('enabled')) !== false
    const saved = Number(await $.store.get('scale'))
    if (saved >= 0.5 && saved <= 5) scale = saved
    $.ui.status(enabled ? '∑ math' : undefined)
    // A missing TeX install is reported once, and again only if what is missing changes.
    const tex = await scanTeX($)
    pkgs = tex.pkgs
    const dir = await cacheDir($)
    // The cache layout changed (resolution, naming): the first start after that empties it.
    const wipe = (await $.store.get('cacheGen')) !== CACHE_GEN
    // Pictures are kept 30 days; the files made while building them (.tex, .log, .dvi, ...) one day.
    const sweep = wipe
      ? 'opendir(my $d,$ARGV[0]) or exit; for (readdir $d) { my $f="$ARGV[0]/$_"; unlink $f if -f $f }'
      : 'opendir(my $d,$ARGV[0]) or exit; for (readdir $d) { my $f="$ARGV[0]/$_"; next unless -f $f; my $keep = ($f =~ /\\.png$/ && $f !~ /\\.raw\\.png$/) ? 30 : 1; unlink $f if -M $f > $keep }'
    if (perlBin) {
      await $.process.run([perlBin, '-e', sweep, dir]).catch(() => undefined)
    } else if (platform !== 'win') {
      const runs = wipe
        ? [['find', dir, '-type', 'f', '-delete']]
        : [
            ['find', dir, '-type', 'f', '-name', '*.png', '!', '-name', '*.raw.png', '-mtime', '+30', '-delete'],
            ['find', dir, '-type', 'f', '(', '!', '-name', '*.png', '-o', '-name', '*.raw.png', ')', '-mtime', '+1', '-delete'],
          ]
      for (const argv of runs) await $.process.run(argv).catch(() => undefined)
    }
    if (wipe) await $.store.set('cacheGen', CACHE_GEN)
    autoDark = await detectAppearance($)
    const manual = Number(await $.store.get('ratio'))
    cellRatio = manual > 0.3 && manual < 0.8 ? manual : ((await measureCell($)) ?? 0.5)
    const noGrid = !perlBin ? 'perl was not found' : !perlGrid ? 'perl has no Compress::Zlib module' : ''
    const perlHint =
      platform === 'linux'
        ? 'Debian/Ubuntu: sudo apt install perl-modules; Fedora: sudo dnf install perl-IO-Compress.'
        : platform === 'win' ? 'TeX Live or Git for Windows bring a perl.' : ''
    const perlWarned = await $.store.get('perlWarned')
    if (noGrid && perlWarned !== noGrid) {
      $.ui.toast(`term-latex: ${noGrid}; equations are drawn at their natural size, a little less exact. ${perlHint}`.trim())
      await $.store.set('perlWarned', noGrid)
    } else if (!noGrid && perlWarned) {
      await $.store.delete('perlWarned')
    }
    const missing = tex.missing.join(', ')
    const warned = await $.store.get('depsWarned')
    if (missing && warned !== missing) {
      const hint =
        platform === 'mac' ? 'Install MacTeX.' : platform === 'linux' ? 'Install TeX Live (texlive-latex-extra, dvipng).' : 'Install MiKTeX or TeX Live.'
      $.ui.toast(`term-latex: missing ${missing}; equations stay as text. ${hint}`)
      await $.store.set('depsWarned', missing)
    } else if (!missing && warned) {
      await $.store.delete('depsWarned')
    }
    return next(e)
  })

  on('command.run', { command: 'math' }, async ($, e) => {
    const [a = '', n = ''] = e.args.trim().split(/\s+/)
    if (a === 'ratio') {
      if (n === 'auto') {
        await $.store.delete('ratio')
        return { text: 'cell ratio is measured again at the next session start' }
      }
      const v = Number(n.replace(',', '.'))
      if (!(v > 0.3 && v < 0.8)) {
        return { text: `cell ratio (width/height) is ${cellRatio.toFixed(3)}; /math ratio 0.46 sets it, /math ratio auto measures it` }
      }
      cellRatio = v
      await $.store.set('ratio', v)
      cache.clear()
      $.ui.invalidate('ui.render')
      return { text: `cell ratio ${v} (remembered)` }
    }
    if (a === 'color') {
      const v = n.replace(/^#/, '')
      if (v === 'auto') {
        await $.store.delete('color')
      } else if (v === 'dark' || v === 'light' || /^[0-9A-Fa-f]{6}$/.test(v)) {
        await $.store.set('color', v)
      } else {
        return { text: `ink colour: ${colorInfo || 'not drawn yet'}. /math color dark | light | auto | RRGGBB` }
      }
      cache.clear()
      $.ui.invalidate('ui.render')
      return { text: v === 'auto' ? 'ink colour follows the theme again' : `ink colour ${v} (remembered)` }
    }
    if (a === 'reset') {
      autoDark = await detectAppearance($)
      cache.clear()
      $.ui.invalidate('ui.render')
      return { text: 'Equation cache of this session cleared; redrawing.' }
    }
    if (a === 'debug') return { text: [lastLayout || 'No equation drawn yet.', colorInfo && `Ink: ${colorInfo}`, lastError && `Last LaTeX error: ${lastError}`].filter(Boolean).join('\n') }
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
    // Every equation of the message compiles at the same time.
    const drawn = pieces.map((p) => (p.kind === 'math' ? render($, p.tex, color, scale, cellRatio) : null))
    const out: any[] = []
    for (const [i, p] of pieces.entries()) {
      if (p.kind === 'text') {
        out.push(<Markdown key={`t${i}`} text={p.text} />)
        continue
      }
      remember(p.tex)
      const room = Math.max(8, (e.viewport?.columns ?? 100) - 4)
      let img = await drawn[i]
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
