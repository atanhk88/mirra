import "./globals.css";
import SiteNav from "@/components/SiteNav";

export const metadata = {
  title: "Mirra — You, animated.",
  description:
    "Upload a full-body photo and get a Disney/Pixar-style 3D avatar that idles, reacts, and celebrates with you.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
