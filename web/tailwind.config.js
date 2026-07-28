/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Pulled from PREMIR's own performance-review email template —
      // keep in sync with that file's CONFIG/colors if the brand palette
      // ever changes.
      colors: {
        brand: {
          navy: "#16296b",
          blue: "#2551b0",
          sky: "#1abcfe",
          pale: "#c6d7f0",
          bg: "#ebf3fd",
          panel: "#f4f8fe",
          border: "#d9e4f5",
          borderLight: "#e1ebf7",
          text: "#1a1a2e",
          muted: "#4a5568",
          label: "#8395ad",
        },
      },
      fontFamily: {
        mono: ['"Courier New"', "Courier", "monospace"],
      },
    },
  },
  plugins: [],
};
