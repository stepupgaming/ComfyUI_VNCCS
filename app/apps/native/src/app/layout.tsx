import type { Metadata } from "next";
import { StudioLayout } from "./studio-layout";
import "@workspace/ui/globals.css";

export const metadata: Metadata = {
  title: "VNCCS Studio",
  description: "Visual novel character creation on ComfyUI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className="overflow-hidden antialiased">
        <StudioLayout>{children}</StudioLayout>
      </body>
    </html>
  );
}
