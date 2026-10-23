import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

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

  protected readonly letters = [...'parket'];
  // Resolved against <base href> so it works under /parket/ on GitHub Pages.
  protected readonly floorImage = `url("${new URL('parquet.svg', this.document.baseURI).href}")`;

  protected revealCta(): void {
    this.ctaRevealed.set(true);
  }
}
