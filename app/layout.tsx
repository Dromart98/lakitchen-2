import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "Lakitchen", description: "Macros, inventario y recetas inteligentes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
