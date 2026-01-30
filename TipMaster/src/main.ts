// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { TestWidgetComponent } from './app/Test/test-widget.component';

bootstrapApplication(TestWidgetComponent)
  .catch(err => console.error(err));
