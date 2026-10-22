import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  private readonly document = inject(DOCUMENT);

  protected readonly letters = [...'parket'];
  // Resolved against <base href> so it works under /parket/ on GitHub Pages.
  protected readonly floorImage = `url("${new URL('parquet.svg', this.document.baseURI).href}")`;
}
