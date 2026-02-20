import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Soccer } from './soccer';

describe('Soccer', () => {
  let component: Soccer;
  let fixture: ComponentFixture<Soccer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Soccer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Soccer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
