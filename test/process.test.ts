import { describe, expect, it } from 'vitest';
import { runProcess } from '../src/backend/process.js';

describe('runProcess', () => {
  it('passes arguments without a shell', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', 'a; rm -rf /']);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe('a; rm -rf /');
  });
});
