import type { SemanticBlueprint } from "../../src/schema"
import { feature, ops } from "./gtkRecords"

const base = {
  targetUsers: ["Home users"],
  nonGoals: ["Cloud sync"],
  externalServices: [],
  platformNeeds: ["local-storage"],
  qualityRequirements: ["Keyboard-operable controls with visible status and accessible labels."],
  productConstraints: ["Everything stays on the device."],
} satisfies Partial<SemanticBlueprint>

// A read-only search feature, a whole-number year bounded by today's year, edit and remove from a detail view.
export const wineCellarBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Wine Cellar",
  summary: "An offline list of wine bottles with a name, a vintage year and a bottle count, with search, add, edit and remove.",
  goals: ["Know what is in the cellar"],
  features: [
    feature("Bottle list", "Show every bottle; selecting a row opens its detail.", "The list shows the stored bottles.", { usesData: ["Bottles"], dataOperations: ops("Bottles", "read"), usesPlatformNeeds: ["local-storage"] }),
    feature("Add bottle", "Add a bottle with a required name and a vintage year that is a whole number between 1800 and the current calendar year.", "A valid bottle appears in the list.", { usesData: ["Bottles"], dataOperations: ops("Bottles", "create"), buildsOn: ["Bottle list"] }),
    feature("Edit bottle", "Edit a bottle from its detail view with the same rules as adding.", "An edited bottle shows the new values.", { usesData: ["Bottles"], dataOperations: ops("Bottles", "read", "edit"), buildsOn: ["Bottle list"] }),
    feature("Remove bottle", "Remove a bottle from its detail view.", "A removed bottle leaves the list.", { usesData: ["Bottles"], dataOperations: ops("Bottles", "delete"), buildsOn: ["Bottle list"] }),
    feature("Search bottles", "A search field narrows the list to bottles whose name contains the text; a no-match message shows when nothing matches.", "Searching shows the matching rows.", { usesData: ["Bottles"], dataOperations: ops("Bottles", "read"), narrowsListBy: "text", buildsOn: ["Bottle list"] }),
  ],
  dataObjects: [
    { name: "Bottles", purpose: "One record per bottle.", sensitivity: "personal", retentionIntent: "Keep until the user removes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Name", valueType: "text", optional: false },
      { name: "Vintage year", valueType: "whole-number", optional: false, min: 1000, max: 9999 },
      { name: "Bottle count", valueType: "whole-number", optional: false },
    ] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Bottle list", "Add bottle", "Edit bottle", "Remove bottle", "Search bottles"], outsideFeatures: "none" }],
}

// The only update is a one-way mark action: no edit form and no detail view.
export const giftIdeasBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Gift Ideas",
  summary: "An offline list of gift ideas per person that can be added and marked bought.",
  goals: ["Remember gift ideas"],
  features: [
    feature("Unbought idea list", "Show the ideas not yet bought; an empty list shows an empty-state message.", "The list shows only unbought ideas.", { usesData: ["Gift ideas"], dataOperations: ops("Gift ideas", "read"), usesPlatformNeeds: ["local-storage"] }),
    feature("Add gift idea", "Add an idea with a required person name and description.", "A valid idea appears in the list.", { usesData: ["Gift ideas"], dataOperations: ops("Gift ideas", "create"), buildsOn: ["Unbought idea list"] }),
    feature("Mark idea bought", "A Mark bought button on each row sets the bought flag.", "A bought idea leaves the list.", { usesData: ["Gift ideas"], dataOperations: ops("Gift ideas", "update"), buildsOn: ["Unbought idea list"] }),
  ],
  dataObjects: [
    { name: "Gift ideas", purpose: "One record per idea.", sensitivity: "personal", retentionIntent: "Keep until the user removes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Person name", valueType: "text", optional: false },
      { name: "Description", valueType: "text", optional: false },
      { name: "Bought", valueType: "flag", optional: false },
    ] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Unbought idea list", "Add gift idea", "Mark idea bought"], outsideFeatures: "none" }],
}

// A flag filter (not a search), a mark action for the done flag, a removal, no edit form and no temporary files or streams.
export const choreChartBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Chore Chart",
  summary: "An offline list of chores with a name, a person and a done flag, with add, mark done, remove and a not-done filter.",
  goals: ["Share the housework"],
  features: [
    feature("Chore list", "Show every chore with its name, person and done state; an empty list shows 'No chores yet. Add one.'.", "The list shows the stored chores.", { usesData: ["Chores"], dataOperations: ops("Chores", "read"), usesPlatformNeeds: ["local-storage"] }),
    feature("Add chore", "Add a chore with a required name and person; it starts not done.", "A valid chore appears in the list.", { usesData: ["Chores"], dataOperations: ops("Chores", "create"), buildsOn: ["Chore list"] }),
    feature("Mark chore done", "A done toggle on each row sets the done flag.", "A marked chore shows as done.", { usesData: ["Chores"], dataOperations: ops("Chores", "update"), buildsOn: ["Chore list"] }),
    feature("Remove chore", "Remove a chore after the user confirms in a dialog.", "A removed chore leaves the list.", { usesData: ["Chores"], dataOperations: ops("Chores", "delete"), buildsOn: ["Chore list"] }),
    feature("Show only not-done chores", "An on/off toggle shows only the chores that are not done.", "With the toggle on only not-done chores show.", { usesData: ["Chores"], dataOperations: ops("Chores", "read"), narrowsListBy: "flag", buildsOn: ["Chore list"] }),
  ],
  dataObjects: [
    { name: "Chores", purpose: "One record per chore.", sensitivity: "personal", retentionIntent: "Keep until the user removes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Name", valueType: "text", optional: false },
      { name: "Person", valueType: "text", optional: false },
      { name: "Done", valueType: "flag", optional: false },
    ] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Chore list", "Add chore", "Mark chore done", "Remove chore", "Show only not-done chores"], outsideFeatures: "none" }],
}
