// Product text (the product name) written into generated kit files. Each helper makes the value a plain literal in one target format.

export function xmlText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!)
}

// Inside "...": no format! call takes the product name, so braces need no escaping.
export function rustString(value: string): string {
  return value.replace(/[\\"]/g, "\\$&")
}

// Inside "...": `$` would start a string template.
export function kotlinString(value: string): string {
  return value.replace(/[\\"$]/g, "\\$&")
}

// An android:label value: aapt2 reads backslash escapes and a leading @ or ? as a resource reference.
export function androidXmlString(value: string): string {
  return xmlText(value.replace(/[\\'"]/g, "\\$&").replace(/^[@?]/, "\\$&"))
}

// A whole shell word, single-quoted.
export function shellWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

// A systemd unit value: `%` starts a specifier.
export function systemdValue(value: string): string {
  return value.replaceAll("%", "%%")
}

// A .desktop entry value: backslash starts an escape.
export function desktopValue(value: string): string {
  return value.replaceAll("\\", "\\\\")
}

// Inside a JS/TS template literal.
export function templateText(value: string): string {
  return value.replace(/\\|`|\$\{/g, match => `\\${match}`)
}

// Rust keywords plus the SQL words SQLite will not take as a bare column name.
const RESERVED_IDENTIFIERS = new Set([
  "abstract", "as", "async", "await", "become", "box", "break", "const", "continue", "crate", "do", "dyn", "else", "enum", "extern", "false",
  "final", "fn", "for", "gen", "if", "impl", "in", "let", "loop", "macro", "match", "mod", "move", "mut", "override", "priv", "pub", "ref",
  "return", "self", "static", "struct", "super", "trait", "true", "try", "type", "typeof", "unsafe", "unsized", "use", "virtual", "where",
  "while", "yield",
  "add", "all", "alter", "and", "between", "by", "case", "check", "collate", "column", "commit", "constraint", "create", "cross", "default",
  "delete", "desc", "distinct", "drop", "end", "escape", "except", "exists", "foreign", "from", "full", "group", "having", "index", "inner",
  "insert", "intersect", "into", "is", "isnull", "join", "left", "limit", "natural", "not", "notnull", "null", "of", "offset", "on", "or",
  "order", "outer", "primary", "references", "right", "select", "set", "table", "then", "to", "transaction", "union", "unique", "update",
  "using", "values", "when", "with",
])

// The one snake_case spelling of a declared field name (SQL column, Rust field, settings key), used by every document and kit.
export function fieldIdentifier(name: string): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value"
  const lead = /^[0-9]/.test(base) ? `field_${base}` : base
  return RESERVED_IDENTIFIERS.has(lead) ? `${lead}_value` : lead
}
