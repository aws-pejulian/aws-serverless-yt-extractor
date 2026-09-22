import { createDOM } from '@builder.io/qwik/testing';
import { expect, test } from 'vitest';
import { ExtractForm } from '../src/frontend/src/components/extract-form';

test('renders the YouTube URL and email fields', async () => {
  const { screen, render } = await createDOM();
  await render(<ExtractForm />);

  expect(screen.querySelector('input[name="youtubeUrl"]')).toBeTruthy();
  expect(screen.querySelector('input[name="email"]')).toBeTruthy();
  expect(screen.outerHTML).toContain('YouTube URL');
  expect(screen.outerHTML).toContain('Extract audio');
});

test('shows a pending submit label', async () => {
  const { screen, render } = await createDOM();
  await render(<ExtractForm pending />);

  const button = screen.querySelector('button');
  expect(button?.textContent).toContain('Sending');
  expect(button?.hasAttribute('disabled')).toBe(true);
});
