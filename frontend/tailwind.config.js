/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Fires on ~2K (2560) even with common 125% OS scaling (~2048 CSS px).
        // Stays off for 1080p (1920 CSS px at 100%).
        sheet: "2000px",
      },
    },
  },
  plugins: [],
}
