import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { SectionIcon } from './section-icon';
import { SECTIONS, SectionId } from './section-id';
import { SECTION_COMPONENTS } from './section-outlet';

/**
 * The one tray: always in the DOM (so the dock's aria-controls is valid), hidden and empty when
 * no section is open. Phone: above the dock; wide screens: the column beside the rail.
 * Not encapsulated, so the scrub-to-see CSS can see the sections' slider fields.
 */
@Component({
  selector: 'app-tray',
  imports: [NgComponentOutlet, SectionIcon],
  templateUrl: './tray.html',
  styleUrl: './tray.scss',
  encapsulation: ViewEncapsulation.None,
  host: { id: 'designer-tray', '[hidden]': '!section()' },
})
export class Tray {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly section = input<SectionId | null>(null);
  /** The close button was pressed. */
  readonly closed = output<void>();

  protected readonly info = computed(() => SECTIONS.find((s) => s.id === this.section()) ?? null);
  protected readonly component = computed(() => {
    const id = this.section();
    return id ? SECTION_COMPONENTS[id] : null;
  });

  /** Move focus to the heading (after a dock button opened or switched the section). */
  focusHeading(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.tray-title')?.focus();
  }

  /** True while a pointer holds a slider thumb. */
  isScrubbing(): boolean {
    return this.host.nativeElement.querySelector('app-slider-field.scrubbing') !== null;
  }
}
