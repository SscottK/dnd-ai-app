import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

function pdfApiPath(pdfUrl) {
  if (!pdfUrl) return null;
  if (pdfUrl.startsWith("/api/v1")) {
    return pdfUrl.slice("/api/v1".length);
  }
  return pdfUrl;
}

export function AuthenticatedPdfFrame({ pdfUrl, token, title = "Character sheet PDF", className = "" }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const objectUrlRef = useRef(null);

  useEffect(() => {
    if (!pdfUrl || !token) {
      setLoading(false);
      setError("Not signed in.");
      return;
    }

    let active = true;

    const revokeCurrent = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const loadPdf = async () => {
      setLoading(true);
      setError("");
      revokeCurrent();
      setBlobUrl(null);
      try {
        const path = pdfApiPath(pdfUrl);
        const response = await apiFetch(path, { token });
        if (!response.ok) {
          throw new Error(
            response.status === 401 ? "Not authenticated" : "Could not load PDF"
          );
        }
        const blob = await response.blob();
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load PDF");
          setBlobUrl(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPdf();

    return () => {
      active = false;
      revokeCurrent();
    };
  }, [pdfUrl, token]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-void text-xs font-mono text-zinc-500 ${className}`}>
        Loading PDF...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-void p-6 text-center ${className}`}>
        <p className="text-xs font-mono text-danger">{error}</p>
      </div>
    );
  }

  return (
    <iframe
      title={title}
      src={blobUrl}
      className={className}
    />
  );
}

export async function openAuthenticatedPdfInTab(pdfUrl, token) {
  const path = pdfApiPath(pdfUrl);
  const response = await apiFetch(path, { token });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Not authenticated" : "Could not open PDF");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
