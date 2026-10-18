"use client";

/**
 * Erreur grave (base de données injoignable, mise en service en cours…) :
 * page sobre et autonome, sans dépendre de la base ni des traductions.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#fbf7f1", color: "#1f1a17", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <main style={{ maxWidth: 460, textAlign: "center" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 44, margin: 0 }}>Un instant…</p>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: "#6f655c" }}>
            Le site est momentanément indisponible. Merci de réessayer dans quelques minutes.
          </p>
          <p style={{ fontSize: 15, color: "#6f655c" }}>The website is temporarily unavailable. Please try again in a few minutes.</p>
          <button type="button" onClick={reset}
            style={{ marginTop: 16, padding: "12px 28px", borderRadius: 999, border: 0, background: "#1f1a17", color: "#fbf7f1", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
