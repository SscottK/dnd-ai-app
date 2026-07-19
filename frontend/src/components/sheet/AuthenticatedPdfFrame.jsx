import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

function pdfApiPath(pdfUrl) {
  if (!pdfUrl) return null;
  if (pdfUrl.startsWith("/api/v1")) {
    return pdfUrl.slice("/api/v1".length);
  }
  return pdfUrl;
}

async function fetchPdfBlob(pdfUrl, token) {
  const path = pdfApiPath(pdfUrl);
  const response = await apiFetch(path, { token });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = typeof payload.detail === "string" ? payload.detail : "";
    } catch {
      /* ignore */
    }
    if (response.status === 401) {
      throw new Error("Not authenticated");
    }
    if (response.status === 404) {
      throw new Error(
        detail || "PDF file is missing on the server. Use Replace PDF to upload it again."
      );
    }
    throw new Error(detail || "Could not load PDF");
  }
  const buffer = await response.arrayBuffer();
  return new Blob([buffer], { type: "application/pdf" });
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
        const blob = await fetchPdfBlob(pdfUrl, token);
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
        Loading PDF…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-void p-6 text-center ${className}`}>
        <p className="max-w-md text-xs font-mono text-danger">{error}</p>
        <p className="max-w-md text-[10px] font-mono text-zinc-500">
          If this character was imported before server storage was persistent, re-upload the PDF with
          Replace PDF.
        </p>
      </div>
    );
  }

  return (
    <iframe
      title={title}
      src={`${blobUrl}#view=FitH`}
      className={className}
    />
  );
}

/**
 * Open PDF in a new tab. Opens a blank tab synchronously first so browsers
 * do not block the popup after the authenticated fetch completes.
 */
export async function openAuthenticatedPdfInTab(pdfUrl, token) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await fetchPdfBlob(pdfUrl, token);
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.href = url;
    } else {
      // Popup blocked — fall back to same-tab navigation of the blob.
      window.location.assign(url);
    }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    if (preview && !preview.closed) {
      preview.close();
    }
    throw err;
  }
}
