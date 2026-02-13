import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Mma } from './mma';

describe('Mma', () => {
  let component: Mma;
  let fixture: ComponentFixture<Mma>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mma]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Mma);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
