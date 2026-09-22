import { component$ } from '@builder.io/qwik';
import { useDocumentHead, useLocation } from '@builder.io/qwik-city';

export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();

  return (
    <>
      <title>{head.title}</title>
      <link rel="canonical" href={loc.url.href} />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#f3efe6" />
      {head.meta.map((meta) => (
        <meta key={meta.key} {...meta} />
      ))}
      {head.links.map((link) => (
        <link key={link.key} {...link} />
      ))}
      {head.styles.map((style) => (
        <style key={style.key} dangerouslySetInnerHTML={style.style} />
      ))}
    </>
  );
});
