import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Basketball } from './basketball';

describe('Basketball', () => {
  let component: Basketball;
  let fixture: ComponentFixture<Basketball>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Basketball]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Basketball);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
