# terminal-math

A Claude Code mod that draws LaTeX math in assistant messages as real, centered
images in the terminal. Inline `$...$` becomes Unicode inside the sentence;
display math (`$$...$$`, `\[...\]`) is compiled with LaTeX and drawn as a picture.

## Requirements
- **A terminal with the kitty graphics protocol.** Ghostty, kitty or WezTerm. Elsewhere the
  equations stay as readable text (inline formulas still become Unicode).
- **TeX** providing `latex`, `dvipng` and the packages `standalone`, `amsmath`, `xcolor`.
  If something is missing, a toast says so once.
- **perl** (optional, found automatically) pads each equation to the terminal's cell grid and
  measures the terminal. It needs its `Compress::Zlib` module (Debian/Ubuntu: `perl-modules`;
  Fedora: `perl-IO-Compress`). Without perl, or without that module, equations are drawn at
  their natural size, slightly less exact, and a toast says why once.
- Optional LaTeX packages are loaded per equation when installed (a full TeX has them all):
  mathtools, bm, mathrsfs, cancel, physics, siunitx, tensor, upgreek, esint, stmaryrd,
  dsfont, mhchem, cases, units, nicefrac, xfrac, accents, extarrows, yhmath, mathdots, slashed.

## Platforms
| | TeX is looked for | perl | cache |
|---|---|---|---|
| **macOS** (tested) | PATH, `/Library/TeX/texbin`, Homebrew | `/usr/bin/perl` | `~/.cache/claude-terminal-math` |
| **Linux** (not yet tested on a real machine) | PATH, `/usr/bin`, `/usr/local/texlive/<year>/bin/<arch>` | system perl | `$XDG_CACHE_HOME` or `~/.cache` |
| **Windows** (best effort, untested) | PATH, MiKTeX, `C:/texlive/<year>/bin/windows` | TeX Live's or Git's perl, if any | `%LOCALAPPDATA%` |

- Linux packages (Debian/Ubuntu): `texlive-latex-extra texlive-science dvipng perl`.
- Windows: the graphics protocol needs WezTerm (Windows Terminal does not draw kitty images).
  With MiKTeX, allow it to install missing packages on the fly, or a first run may stall.
- If the cell shape is measured wrong (no perl, an odd terminal): `/math ratio 0.46`
  sets the width/height ratio of one cell by hand; `/math ratio auto` measures again.

## Use
- On by default. `/math on|off` toggles it and is remembered across sessions.
- `/math color C` sets the ink colour. `/math ratio R` sets the cell shape by hand. `/math size N` sets how large equations are drawn (default 1.75, remembered); `/math debug` shows the last layout.
- `/math copy [N]` copies the LaTeX of the last (or N-th last) equation drawn; `/math list` shows the last five. Selecting an equation with the mouse copies the terminal's picture cells, not the LaTeX.
- Inline formulas Unicode cannot express (limits, nested powers, matrices) are
  drawn as an image on their own line.
- Prices such as `$5 and $10` and code (inline or fenced) are never touched.

## How it works and what it touches
- Everything runs locally; nothing goes over the network.
- Renders are cached (see Platforms for where). Pictures are dropped after 30 days and the
  files made while building them after one day.
- LaTeX runs with shell escape off and restricted file access, and formulas that
  use file or definition primitives (`\input`, `\write`, `\usepackage`...) are not compiled.
- Image colour follows the Claude Code theme. For the `auto` theme the mod asks the terminal
  (`COLORFGBG`) and then the system's light/dark setting (macOS, GNOME, Windows), and assumes
  dark if neither says. Wrong guess, or a terminal that differs from the system? `/math color
  dark|light|RRGGBB` sets the ink by hand and `/math color auto` gives the choice back.

## Install
```
/plugin install terminal-math --marketplace FAgurtoS/claude-terminal-math
```
Answer `y` to add the marketplace, then pick a scope.

## Load it from a folder
- One session: `claude --plugin-dir /path/to/terminal-math`
- Every session: `export CLAUDE_CODE_PLUGIN_DIRS="$HOME/.claude/mods/terminal-math"` in `~/.zshrc`

## Develop
- `claude plugin validate .` and `claude plugin test .`

## Remove it
Delete this folder, the `CLAUDE_CODE_PLUGIN_DIRS` line if you added it, and
optionally `~/.cache/claude-terminal-math`. Nothing else was changed.

## License
MIT, see `LICENSE`.
