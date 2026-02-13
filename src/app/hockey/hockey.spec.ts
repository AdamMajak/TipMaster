import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Hockey } from './hockey';

describe('Hockey', () => {
  let component: Hockey;
  let fixture: ComponentFixture<Hockey>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Hockey]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Hockey);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
