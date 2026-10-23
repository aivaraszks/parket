import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
// Only this file from state/: it has no Angular or designer imports, so the landing chunk stays small.
import { readProjectSummary } from '../designer/state/project-summary';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  host: { '(document:pointerdown)': 'revealCta()', '(document:keydown)': 'revealCta()' },
})
export class Landing {
  private readonly document = inject(DOCUMENT);

  /** The CTA fades in after the opening sequence; any tap or key shows it at once. */
  protected readonly ctaRevealed = signal(false);

  /** Read once, synchronously, so there is no flash; null on a first visit or any storage problem. */
  protected readonly summary = readProjectSummary();
  protected readonly projectCount = this.summary
    ? `${this.summary.count} ${this.summary.count === 1 ? 'project' : 'projects'} on this device`
    : '';

  protected readonly letters = [...'parket'];
  // Resolved against <base href> so it works under /parket/ on GitHub Pages.
  protected readonly floorImage = `url("${new URL('parquet.svg', this.document.baseURI).href}")`;
  protected readonly grainImage = `url("${new URL('grain.svg', this.document.baseURI).href}")`;

  protected revealCta(): void {
    this.ctaRevealed.set(true);
  }
}
