# terminal-math

A Claude Code mod that draws LaTeX math in assistant messages as real, centered
images in the terminal. Inline `$...$` becomes Unicode inside the sentence;
display math (`$$...$$`, `\[...\]`) is compiled with LaTeX and drawn as a picture.

## Requirements
- **Terminal with the kitty graphics protocol**: Ghostty or kitty. Elsewhere the
  equations stay as readable text.
- **TeX**: MacTeX or TeX Live, providing `latex`, `dvipng` and the packages
  `standalone`, `amsmath`, `xcolor`. macOS paths are expected at
  `/Library/TeX/texbin`. If something is missing, a toast says so once.
- **perl** (ships with macOS) to measure the terminal's cell size.
- Optional LaTeX packages are loaded when installed (a full MacTeX has them all):
  mathtools, bm, mathrsfs, cancel, physics, siunitx, tensor, upgreek, esint, stmaryrd,
  dsfont, mhchem, cases, units, nicefrac, xfrac, accents, extarrows, yhmath, mathdots, slashed.

## Use
- On by default. `/math on|off` toggles it and is remembered across sessions.
- `/math size N` sets how large equations are drawn (default 1.75, remembered); `/math debug` shows the last layout.
- `/math copy [N]` copies the LaTeX of the last (or N-th last) equation drawn; `/math list` shows the last five. Selecting an equation with the mouse copies the terminal's picture cells, not the LaTeX.
- Inline formulas Unicode cannot express (limits, nested powers, matrices) are
  drawn as an image on their own line.
- Prices such as `$5 and $10` and code (inline or fenced) are never touched.

## How it works and what it touches
- Everything runs locally; nothing goes over the network.
- Renders are cached in `~/.cache/claude-terminal-math` and dropped after 30 days.
- LaTeX runs with shell escape off and restricted file access, and formulas that
  use file or definition primitives (`\input`, `\write`, `\usepackage`...) are not compiled.
- Image colour follows the Claude Code theme (light or dark).

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
