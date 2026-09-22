import { component$ } from '@builder.io/qwik';

export interface ExtractFormProps {
  pending?: boolean;
}

export const ExtractForm = component$<ExtractFormProps>((props) => {
  return (
    <>
      <label>
        YouTube URL
        <input
          name="youtubeUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>
      <button type="submit" disabled={props.pending}>
        {props.pending ? 'Sending…' : 'Extract audio'}
      </button>
    </>
  );
});
