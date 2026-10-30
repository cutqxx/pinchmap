const KNOWN_TEXT_LIMIT = 5;

export interface ExternalChangeHandlers {
  isEditingText(): boolean;
  reload(text: string): void;
  onReloadDeferred(): void;
}

export class ExternalChangeGate {
  private knownTexts: string[] = [];
  private deferredText: string | null = null;

  constructor(private readonly handlers: ExternalChangeHandlers) {}

  startFrom(text: string): void {
    this.knownTexts = [];
    this.deferredText = null;
    this.noteKnownText(text);
  }

  noteKnownText(text: string): void {
    this.knownTexts = [...this.knownTexts.filter((known) => known !== text), text].slice(-KNOWN_TEXT_LIMIT);
  }

  hasDeferredReload(): boolean {
    return this.deferredText !== null;
  }

  receive(text: string): void {
    if (this.dropKnownTextsOlderThan(text)) return;
    if (this.handlers.isEditingText()) {
      this.deferredText = text;
      this.knownTexts = [text];
      this.handlers.onReloadDeferred();
      return;
    }
    this.reload(text);
  }

  resumeAfterTextEdit(): void {
    if (this.deferredText === null || this.handlers.isEditingText()) return;
    this.reload(this.deferredText);
  }

  private dropKnownTextsOlderThan(text: string): boolean {
    const index = this.knownTexts.lastIndexOf(text);
    if (index === -1) return false;
    this.knownTexts = this.knownTexts.slice(index);
    return true;
  }

  private reload(text: string): void {
    this.deferredText = null;
    this.knownTexts = [text];
    this.handlers.reload(text);
  }
}
