import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Tennis } from './tennis';

describe('Tennis', () => {
  let component: Tennis;
  let fixture: ComponentFixture<Tennis>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Tennis]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Tennis);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
