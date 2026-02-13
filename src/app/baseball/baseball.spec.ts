import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Baseball } from './baseball';

describe('Baseball', () => {
  let component: Baseball;
  let fixture: ComponentFixture<Baseball>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Baseball]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Baseball);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
