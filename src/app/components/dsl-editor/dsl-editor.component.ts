import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONS } from '../../icons';
import { DiagramStore } from '../../services/diagram-store';

@Component({
  selector: 'nsd-dsl-editor',
  imports: [FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="panel-head">
      <fa-icon [icon]="icons.terminal" />
      <span>Pseudo-code</span>
      <span class="grow"></span>
      @if (store.parseError(); as err) {
        <span class="status bad" [title]="err.message"><fa-icon [icon]="icons.warning" /> Line {{ err.line }}</span>
      } @else {
        <span class="status ok"><fa-icon [icon]="icons.ok" /> Synced</span>
      }
    </header>
    <div class="editor">
      <div class="gutter" #gutter aria-hidden="true">
        @for (n of lineNumbers(); track n) {
          <div [class.err]="store.parseError()?.line === n">{{ n }}</div>
        }
      </div>
      <textarea
        #area
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        wrap="off"
        [value]="text()"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
        (scroll)="syncScroll()"
        aria-label="Diagram pseudo-code"
      ></textarea>
    </div>
    @if (store.parseError(); as err) {
      <div class="error"><strong>Line {{ err.line }}:</strong> {{ err.message }}</div>
    }
  `,
  styleUrl: './dsl-editor.component.css',
})
export class DslEditorComponent {
  readonly store = inject(DiagramStore);
  readonly icons = ICONS;
  readonly text = signal(this.store.dslText());
  readonly lineNumbers = computed(() => Array.from({ length: this.text().split('\n').length }, (_, i) => i + 1));

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');
  private readonly gutter = viewChild.required<ElementRef<HTMLDivElement>>('gutter');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Visual edits / undo / loads re-serialize the diagram: they win over
    // text typed but not yet applied, so drop any pending update.
    effect(() => {
      this.store.externalRevision();
      untracked(() => {
        this.cancelPending();
        this.text.set(this.store.dslText());
      });
    });
  }

  onInput(ev: Event): void {
    this.text.set((ev.target as HTMLTextAreaElement).value);
    this.schedule();
  }

  private schedule(): void {
    this.cancelPending();
    const revision = this.store.externalRevision();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // An external change landed after this text was typed: don't overwrite it.
      if (this.store.externalRevision() === revision) this.store.applyText(this.text());
    }, 250);
  }

  private cancelPending(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  onKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    const el = this.area().nativeElement;
    if (ev.key === 'Tab') {
      ev.preventDefault();
      el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end');
      this.text.set(el.value);
      this.schedule();
    } else if (ev.key === 'Enter') {
      // keep indentation of the current line, indent after "{"
      ev.preventDefault();
      const before = el.value.slice(0, el.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      let indent = /^\s*/.exec(line)![0];
      if (line.trimEnd().endsWith('{')) indent += '  ';
      el.setRangeText('\n' + indent, el.selectionStart, el.selectionEnd, 'end');
      this.text.set(el.value);
      this.schedule();
    }
  }

  syncScroll(): void {
    this.gutter().nativeElement.scrollTop = this.area().nativeElement.scrollTop;
  }
}
