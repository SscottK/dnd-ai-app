/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      screens: {
        // True ultrawide / 1440p+ desktop — not 1080p (1920px), which matches xl/2xl.
        sheet: "2400px",
      },
    },
  },
  plugins: [],
}
