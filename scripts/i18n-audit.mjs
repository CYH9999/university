// Finds user-facing text that bypasses the translation system: JSX text, text-bearing
// JSX attributes (placeholder, title, aria-label, label, alt…), toast messages and
// Arabic literals outside src/i18n. Usage: node scripts/i18n-audit.mjs
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEXT_ATTRS = new Set(["placeholder", "title", "aria-label", "label", "alt", "description", "hint", "emptyText", "confirmLabel", "tooltip"]);
// Text that is not language-specific: symbols, units, product names, keyboard keys, code.
const ALLOWED = [/^[\s\W\d_]*$/u, /^(UniOS|English|العربية|Ctrl|Shift|Alt|Esc|Enter|Tab|PDF|CSV|JSON|ZIP|SVG|HTML|MD|URL|GPA|CTF|SHA-256|\.excalidraw|IQD|USD|EUR|GBP|TRY|SAR|AED|JOD|KB|MB|GB|B|EN|AR|OK|⌘|K|N|T|S|B)$/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

export function audit(srcDir = join(root, "src")) {
  const findings = [];
  for (const file of walk(srcDir)) {
    if (file.includes(join("src", "i18n"))) continue;
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(root, file);
    const report = (node, kind, value) => {
      const v = value.replace(/\s+/g, " ").trim();
      if (!v || ALLOWED.some((re) => re.test(v))) return;
      findings.push({ where: `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, kind, text: v });
    };
    const visit = (node) => {
      if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) report(node, "jsx-text", node.text);
      if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(sf);
        const init = node.initializer;
        const lit = ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) ? init.expression : null;
        if (lit && TEXT_ATTRS.has(name) && /\p{L}/u.test(lit.text)) report(node, `attr:${name}`, lit.text);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "toast") {
        const a = node.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) report(node, "toast", a.text);
      }
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[؀-ۿ]/.test(node.text)) report(node, "arabic-literal", node.text);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = audit();
  for (const x of f) console.log(`${x.where}\t${x.kind}\t${x.text}`);
  console.log(`\n${f.length} findings`);
}
