import type { Config } from "tailwindcss";

export default {
  content: ["./popup.html", "./options.html", "./sidepanel.html", "./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f8fb",
          100: "#e9edf3",
          500: "#65758b",
          700: "#354154",
          900: "#151b26"
        },
        signal: {
          500: "#1f9d8a",
          600: "#147f70"
        },
        berry: {
          500: "#b9386f",
          600: "#942856"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(21, 27, 38, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
