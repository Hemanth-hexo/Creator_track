import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#ecefff",
          500: "#4f5fe0",
          600: "#3f4ec9",
          700: "#333fa3",
        },
      },
    },
  },
  plugins: [],
};

export default config;
