import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

function mediaApiPath(url) {
  if (!url) return null;
  if (url.startsWith("/api/v1")) {
    return url.slice("/api/v1".length);
  }
  return url;
}

export function AuthenticatedImage({
  src,
  token,
  alt = "",
  className = "",
  fallbackClassName = "",
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(false);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    if (!src || !token) {
      setBlobUrl(null);
      setError(!src);
      return;
    }

    let active = true;

    const revokeCurrent = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const loadImage = async () => {
      revokeCurrent();
      setBlobUrl(null);
      setError(false);
      try {
        const path = mediaApiPath(src);
        const response = await apiFetch(path, { token });
        if (!response.ok) throw new Error("Load failed");
        const blob = await response.blob();
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch {
        if (active) setError(true);
      }
    };

    loadImage();

    return () => {
      active = false;
      revokeCurrent();
    };
  }, [src, token]);

  if (error || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-void-deep/80 font-black uppercase text-ink-faint ${fallbackClassName || className}`}
        aria-hidden={!alt}
      >
        {alt?.charAt(0) || "?"}
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div
        className={`animate-pulse bg-void-deep/60 ${fallbackClassName || className}`}
        aria-label={`Loading ${alt}`}
      />
    );
  }

  return <img src={blobUrl} alt={alt} className={className} />;
}
