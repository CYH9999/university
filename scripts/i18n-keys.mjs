// Collects every translation key referenced by the UI source.
//
// - Static keys: the first argument of `t("…")` / `i18n.t("…")` / `tr("…")`.
// - Dynamic keys: template literals such as t(`enums.priority.${p}`) become patterns
//   ("enums.priority.*") that tests expand against the dictionaries.
// - Key-shaped string literals elsewhere (nav tables, validation messages, notification
//   titles…) whose namespace is a known translation namespace.
//
// Usage: node scripts/i18n-keys.mjs [--json]
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const KEY_RE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;
const T_NAMES = new Set(["t", "tr", "tt"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") && !p.includes(`${join("src", "i18n")}`)) out.push(p);
  }
  return out;
}

function isTCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const e = node.expression;
  if (ts.isIdentifier(e)) return T_NAMES.has(e.text);
  if (ts.isPropertyAccessExpression(e)) return e.name.text === "t" && (ts.isIdentifier(e.expression) ? /^(i18n|i18next)$/.test(e.expression.text) : false);
  return false;
}

function paramsOf(arg) {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return [];
  return arg.properties.map((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null)).filter(Boolean);
}

/** String value of an object-literal property, if it is a plain string. */
function propText(obj, name) {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) {
      return ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer) ? p.initializer.text : null;
    }
  }
  return undefined;
}

/**
 * @returns {{ keys: Map<string, {files:Set<string>, params:Set<string>}>, patterns: Map<string, Set<string>>,
 *   literals: Map<string, Set<string>>, fields: Map<string, Set<string>> }}
 * `fields` are RecordForm field definitions without an explicit label: their label is `fields.<name>`.
 */
export function collect(srcDir = join(root, "src")) {
  const keys = new Map();
  const patterns = new Map();
  const literals = new Map();
  const fields = new Map();
  // Form field definitions whose text props are plain text instead of translation keys.
  const badFieldText = [];
  const add = (map, k, where, params = []) => {
    if (!map.has(k)) map.set(k, map === keys ? { files: new Set(), params: new Set() } : new Set());
    const v = map.get(k);
    if (map === keys) {
      v.files.add(where);
      params.forEach((p) => v.params.add(p));
    } else v.add(where);
  };
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(root, file);
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const name = propText(node, "name");
        const kind = propText(node, "kind");
        if (typeof name === "string" && /^[a-zA-Z]+$/.test(name) && typeof kind === "string" && kind !== "section" && propText(node, "label") === undefined) {
          add(fields, `fields.${name}`, `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
        if (typeof name === "string" && typeof kind === "string") {
          for (const prop of ["label", "placeholder", "hint", "description"]) {
            const v = propText(node, prop);
            if (typeof v === "string" && !KEY_RE.test(v)) badFieldText.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${prop}="${v}"`);
          }
        }
      }
      if (isTCall(node) && node.arguments.length) {
        const a = node.arguments[0];
        const where = `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) add(keys, a.text, where, paramsOf(node.arguments[1]));
        else if (ts.isTemplateExpression(a)) {
          let pat = a.head.text;
          for (const span of a.templateSpans) pat += `*${span.literal.text}`;
          add(patterns, pat, where);
        }
      } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && KEY_RE.test(node.text)) {
        add(literals, node.text, `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      } else if (ts.isTemplateExpression(node) && !(node.parent && isTCall(node.parent))) {
        let pat = node.head.text;
        for (const span of node.templateSpans) pat += `*${span.literal.text}`;
        if (/^[a-z][A-Za-z0-9]*\.[A-Za-z0-9_.*]*\*/.test(pat)) add(patterns, pat, `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { keys, patterns, literals, fields, badFieldText };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { keys, patterns, literals, fields } = collect();
  if (process.argv.includes("--json")) {
    const obj = {
      keys: Object.fromEntries([...keys].map(([k, v]) => [k, { params: [...v.params], files: [...v.files] }])),
      patterns: Object.fromEntries([...patterns].map(([k, v]) => [k, [...v]])),
      literals: Object.fromEntries([...literals].map(([k, v]) => [k, [...v]])),
      fields: Object.fromEntries([...fields].map(([k, v]) => [k, [...v]])),
    };
    console.log(JSON.stringify(obj, null, 1));
  } else {
    console.log(`${keys.size} static keys, ${patterns.size} dynamic patterns, ${literals.size} key-shaped literals, ${fields.size} form fields`);
  }
}
