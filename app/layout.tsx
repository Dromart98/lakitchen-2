import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme-preference";
import "./styles.css";

export const metadata: Metadata = {
  title: "LaKitchen",
  description: "Macros, inventario y recetas inteligentes",
  icons: { icon: "/icon.svg" },
};

const themeInitializerScript = `
(function() {
  try {
    var key = "${THEME_STORAGE_KEY}";
    var preference = window.localStorage.getItem(key);
    if (preference !== "light" && preference !== "dark" && preference !== "system") {
      preference = "light";
    }
    var theme = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializerScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
