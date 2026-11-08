export const metadata = { title: 'Toki cockpit', robots: { index: false, follow: false } };

export default function CockpitLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" />
      {children}
    </>
  );
}
