/* LaTeX in an answer, turned into something a person can read.

   Models asked a question with any arithmetic in it answer in LaTeX, and the
   markdown renderer has no idea what that is. A Russian audit came back with
   this on screen, verbatim:

     [ ROI = \frac{\text{Дополнительная валовая прибыль} -
     \text{Затраты}}{\text{Затраты}} \times 100% ]

   Rendering it properly would mean KaTeX: a dependency, a stylesheet, and
   formulas typeset inside a 12px row of an audit table. Nobody reading this
   screen is checking the algebra — they are reading what the model said about
   a brand, and the formula is furniture that has to not be in the way.

   So it is rewritten as plain text. Deliberately conservative: commands we
   have seen are translated, anything else is left alone and visible. A
   mangled formula is worse than an untouched one, because untouched at least
   looks like what the model actually wrote. */

/* Read a {...} group starting at `open`, respecting nesting. Returns the
   contents and the index just past the closing brace, or null if unbalanced —
   in which case the caller leaves the text as it found it. */
function readGroup(s: string, open: number): { body: string; end: number } | null {
  if (s[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return { body: s.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/* \text{...} and \mathrm{...} are pure wrappers: the words inside are the
   words the model meant. Applied repeatedly because they nest inside \frac. */
function unwrap(s: string, command: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf(command + "{", i);
    if (at === -1) return out + s.slice(i);
    const group = readGroup(s, at + command.length);
    if (!group) return out + s.slice(i);
    out += s.slice(i, at) + group.body;
    i = group.end;
  }
  return out;
}

/* \frac{a}{b} becomes (a) / (b). Parenthesised because a numerator that is
   itself a subtraction reads as the wrong sum without them: "a - b / c" is
   not what "\frac{a - b}{c}" says. */
function fractions(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf("\\frac{", i);
    if (at === -1) return out + s.slice(i);
    const num = readGroup(s, at + 5);
    const den = num && readGroup(s, num.end);
    if (!num || !den) return out + s.slice(i);
    out += s.slice(i, at) + `(${num.body.trim()}) / (${den.body.trim()})`;
    i = den.end;
  }
  return out;
}

const SYMBOLS: [RegExp, string][] = [
  [/\\times/g, "×"], [/\\cdot/g, "·"], [/\\div/g, "÷"],
  [/\\leq?\b/g, "≤"], [/\\geq?\b/g, "≥"], [/\\neq\b/g, "≠"],
  [/\\approx/g, "≈"], [/\\pm/g, "±"], [/\\%/g, "%"],
  [/\\left|\\right/g, ""],
  // Thin spaces and line breaks inside formulas.
  [/\\[,;:!]/g, " "], [/\\\\/g, "\n"],
];

export function plainMath(text: string): string {
  if (!text || !text.includes("\\")) return text;

  let out = text;
  for (let pass = 0; pass < 4 && out.includes("\\frac{"); pass++) {
    out = fractions(out);
  }
  for (let pass = 0; pass < 4; pass++) {
    const before = out;
    out = unwrap(unwrap(out, "\\text"), "\\mathrm");
    if (out === before) break;
  }
  for (const [pattern, replacement] of SYMBOLS) {
    out = out.replace(pattern, replacement);
  }

  // Display delimiters. \[ \] and \( \) are unambiguous. A bare [ ... ] is
  // only treated as one when what it wraps still shows signs of being a
  // formula — an equals sign or an arithmetic symbol we just substituted —
  // because a square bracket in prose is usually a citation or an aside.
  out = out.replace(/\\\[|\\\]|\\\(|\\\)/g, "");
  out = out.replace(/\[\s*([^\[\]\n]{3,200}?)\s*\]/g, (whole, inner: string) =>
    /[=×·÷≤≥≠≈±]/.test(inner) ? inner : whole);

  return out.replace(/[ \t]{2,}/g, " ");
}
