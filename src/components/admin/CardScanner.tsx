"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** N° de carte (12 chiffres) contenu dans le QR code (adresse …/f/<n°>) ou tapé tel quel. */
const cardFrom = (text: string) => text.match(/\/f\/(\d{12})/)?.[1] ?? (/^\d{12}$/.test(text.replace(/\s/g, "")) ? text.replace(/\s/g, "") : null);

/**
 * Lecture du QR code de la carte avec l'appareil photo (tablette, téléphone, webcam).
 * Détecteur natif du navigateur (Chrome Android) si disponible, sinon jsQR.
 */
export function CardScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let stop = false;
    let detector: Detector | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (BD) detector = new BD({ formats: ["qr_code"] });
        const jsQR = detector ? null : (await import("jsqr")).default;
        while (!stop) {
          let text: string | null = null;
          if (v.readyState >= 2) {
            if (detector) {
              text = (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
            }
          }
          const n = text && cardFrom(text);
          if (n) {
            navigator.vibrate?.(80);
            router.push(`/admin/fidelite/carte/${n}`);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("Appareil photo indisponible : autorisez-le dans le navigateur, ou tapez le numéro de la carte.");
        setOn(false);
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, router]);

  return (
    <div>
      {on ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
          <button type="button" onClick={() => setOn(false)} className="absolute end-3 top-3 rounded-full bg-white px-4 py-2 font-semibold">Arrêter</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setError(""); setOn(true); }} className="btn-dark w-full text-lg">📷 Scanner la carte avec l'appareil photo</button>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
    </div>
  );
}
