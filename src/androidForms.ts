// Android-only: the form, validation, and display rules of records the user enters, derived from the
// declared field types and optionality alone (never from feature prose). One source for the interface
// contract, the task notes, and the stamp rule, so every document names the same formats and messages.

export interface AndroidFormField {
  readonly name: string
  readonly valueType: string
  readonly optional: boolean
  readonly min?: number | null
  readonly max?: number | null
}

const PICKER_MAX_OPTIONS = 24

// A whole-number field with both declared bounds and a small span is chosen from a picker of min..max, never typed.
export function androidPickerOptions(field: AndroidFormField): number[] | null {
  if (field.valueType !== "whole-number" || field.min == null || field.max == null) return null
  if (!Number.isInteger(field.min) || !Number.isInteger(field.max) || field.max - field.min + 1 > PICKER_MAX_OPTIONS) return null
  return Array.from({ length: field.max - field.min + 1 }, (_, index) => field.min! + index)
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((item, index) => item === b[index])

// A feature choice list whose options are exactly the picker's min..max is that picker's choice list (declared options, never prose).
export function androidChoiceMatchesPicker(options: readonly string[], fields: readonly AndroidFormField[]): boolean {
  return fields.some(field => { const picker = androidPickerOptions(field); return picker !== null && sameList(options, picker.map(String)) })
}

function boundRule(field: AndroidFormField, label: string): string {
  const { min, max } = field
  if (min != null && max != null) return `; a value below ${min} or above ${max} is rejected with "${label} must be between ${min} and ${max}"`
  if (min != null) return `; a value below ${min} is rejected with "${label} must be at least ${min}"`
  if (max != null) return `; a value above ${max} is rejected with "${label} must be at most ${max}"`
  return ""
}

export const ANDROID_DISPLAY_FORMATS = "a date as yyyy-MM-dd, a date and time as yyyy-MM-dd HH:mm in the clock's zone, a time of day as HH:mm (24-hour, zero-padded)"
const ENTERED_TYPES = ["text", "long-text", "number", "whole-number", "date", "date-time", "time"]

function fieldRule(field: AndroidFormField): string | null {
  const label = field.name
  const empty = field.optional ? `an empty ${label} is allowed and stored as no value` : `an empty ${label} (after trimming) is rejected with "${label} is required"`
  switch (field.valueType) {
    case "text":
    case "long-text": return `${label}: text, trimmed; ${empty}`
    case "whole-number": {
      const picker = androidPickerOptions(field)
      if (picker) return `${label}: a single-select picker (not a text field) whose options are ${picker.join(", ")}, each option a button with testTag "field-" plus the field's slug plus "-option-" plus its value and the chosen one marked selected; the add form starts with the choice list's initial option (else ${picker[0]}) selected and the edit form with the stored value, so the picker always holds a value and has no empty rule; a stored value outside ${picker[0]}..${picker[picker.length - 1]} is rejected with "${label} must be between ${picker[0]} and ${picker[picker.length - 1]}"`
      return `${label}: a whole number matching ^[0-9]{1,9}$ (digits only: no sign, decimal point, or spaces); ${empty}; any other text is rejected with "${label} must be a whole number"${boundRule(field, label)}`
    }
    case "number": return `${label}: a number matching ^[0-9]+([.][0-9]+)?$, parsed with a '.' decimal point whatever the device locale (a negative value is rejected unless the behavior states that negative values are valid); ${empty}; any other text is rejected with "${label} must be a number"${boundRule(field, label)}`
    case "date": return `${label}: a text field in the ISO format yyyy-MM-dd; the add form starts with LocalDate.now(container.clock) in that format and the edit form with the stored day; it is valid only when LocalDate.parse accepts it (so 2026-13-40 and abc are rejected with "${label} must be a date as yyyy-MM-dd"); ${empty}`
    case "date-time": return `${label}: a text field in the format yyyy-MM-dd HH:mm in clock.zone, starting at the clock's current minute (the stored value when editing); text that does not parse in that format is rejected with "${label} must be a date and time as yyyy-MM-dd HH:mm"; ${empty}`
    case "time": return `${label}: a text field in the format HH:mm (24-hour); valid only when LocalTime.parse accepts it, otherwise rejected with "${label} must be a time as HH:mm"; ${empty}`
    default: return null
  }
}

// The one validation list of a form that creates or edits records.
export function androidFormRules(dataName: string, fields: readonly AndroidFormField[], input: { readonly edits: boolean; readonly creates?: boolean; readonly itemPage: boolean }): string[] {
  const entered = fields.filter(field => ENTERED_TYPES.includes(field.valueType))
  if (!entered.length) return []
  return [
    `Form (${dataName}): ${input.itemPage ? "the form is part of the item page" : `the form is an inline section of the main screen above the list, with no dialog and no Navigation 3 destination${input.creates === false ? "" : ', so its confirming button also adds the record there'}`}; each field is a text field (unless its rule below makes it a picker) whose visible label equals its name and whose testTag is "field-" plus the field's slug; the confirming button is labelled "Save" (testTag "save")${input.itemPage ? " and the cancelling one \"Cancel\"" : ""}. Exception, one rule for every label: when an acceptance signal or the PRD quotes the exact label of a field or button of this form (an 'Add Steps' button, an 'Edit Steps' field, a 'Save Changes' button), use that quoted label with the same testTag; the generic names apply only to a label nobody quotes. ${input.edits ? `The per-row control that opens the edit form carries testTag "edit-" plus the record id. An edit form lets the user change only the fields the edit behavior says change; every other field, if any, is shown read-only (disabled, with its stored value). ` : ""} A field a feature stamps itself (a creation or completion moment the user does not type) is not in the form.`,
    `Field rules (every field the user enters, one rule each; this one list is the Save rejection rule, the failure behavior, and the set of cases the focused test asserts): ${entered.map(fieldRule).filter(Boolean).join("; ")}. A stricter rule the feature's behavior states for a field (a minimum, a maximum, a fixed set of options) is checked by the same Save with the same kind of message and counts in this list.`,
    `Rejection: Save validates every field in the order listed, shows each failed field's message as that field's supporting text (testTag "error-" plus the field's slug), writes nothing, and keeps the form open with every typed value; fixing the field and pressing Save again is the retry, and a successful Save closes the form. ${input.edits ? "An edit form starts from the stored values, and a rejected Save leaves the stored record unchanged. " : ""}Row and detail display: ${ANDROID_DISPLAY_FORMATS}; a displayed number is formatted with Locale.ROOT and RoundingMode.HALF_UP to the decimal places the behavior or an acceptance signal states (a number field that holds an amount or price and states none shows exactly 2), and a label with its value is one Text such as "Label: value" carrying a testTag (the label's lowercase hyphenated slug, for example "average" for an "Average" label; a list row's values are "row-" plus the record id plus "-" plus the field's slug; the empty-list message is "empty-state" and a load error "load-error").`,
  ]
}

export const ANDROID_DELETE_PROMPT = `Delete prompt: removing a record first shows an AlertDialog whose confirm button is labelled "Delete" and whose dismiss button is labelled "Cancel"; only "Delete" removes the record, and "Cancel" leaves it and closes the prompt.`
