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
