/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

declare module '@qwik-city-plan' {
  const plan: import('@builder.io/qwik-city').QwikCityPlan;
  export default plan;
}
