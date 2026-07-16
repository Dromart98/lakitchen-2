import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "LaKitchen",
  description: "Macros, inventario y recetas inteligentes",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
