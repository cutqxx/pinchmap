/** A branch described by text alone: no IDs, no state. */
export interface BranchDraft {
  readonly text: string;
  readonly children: readonly BranchDraft[];
}
