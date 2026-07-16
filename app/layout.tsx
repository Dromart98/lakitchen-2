import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./styles.css";

export const metadata: Metadata = {
  title: "LaKitchen",
  description: "Macros, inventario y recetas inteligentes",
  icons: { icon: "/icon.svg" },
};

const themeScript = `
(function() {
  try {
    var preference = window.localStorage.getItem("lakitchen.theme.preference");
    var theme = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
