export const metadata = {
  title: "Venn – Eventos",
  description: "Listado filtrable por Timestamp Inicio"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}

