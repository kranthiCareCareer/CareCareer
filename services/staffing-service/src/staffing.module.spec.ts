import { Test } from '@nestjs/testing';
import { describe, it, expect } from 'vitest';

import { StaffingModule } from './staffing.module.js';

describe('StaffingModule', () => {
  it('should compile the module', async () => {
    const module = await Test.createTestingModule({
      imports: [StaffingModule],
    }).compile();
    expect(module).toBeDefined();
  });
});
