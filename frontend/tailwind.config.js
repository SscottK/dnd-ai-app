/** @type {import('tailwindcss').Config} */
// Tailwind v4 reads theme/variants from CSS (@theme, @custom-variant in index.css).
// This file is unused by the PostCSS pipeline; kept only for tooling that still looks for it.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
}
