import { Component, AfterViewInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  selector: 'app-mma',
  standalone: true,
  templateUrl: './mma.html',
  styleUrls: ['./mma.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Mma implements AfterViewInit {

  // prepínač pre lokálny fallback alebo live widget
  isLive = false; // false = fallback (localhost), true = live (Firebase)

  ngAfterViewInit(): void {
    if (!this.isLive) return; // lokálne iba fallback

    // Dynamicky načítanie scriptu
    if (!document.querySelector('script[src*="widgets.api-sports.io"]')) {
      const script = document.createElement('script');
      script.src = 'https://widgets.api-sports.io/2.0.3/widgets.js';
      script.async = true;
      script.onload = () => {
        (window as any).APISportsWidgets?.init?.();
      };
      document.body.appendChild(script);
    } else {
      // Script už existuje, re-init widget
      (window as any).APISportsWidgets?.init?.();
    }
  }

}
