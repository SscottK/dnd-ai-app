import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { apiFetch, apiUpload } from "../../lib/api";
import { AuthenticatedImage } from "../sheet/AuthenticatedImage";
import { PortraitPreviewModal } from "../sheet/PortraitPreviewModal";

function portraitPreviewUrl(portraitUrl, portraitPhotoId) {
  if (!portraitUrl) return null;
  if (portraitPhotoId == null) return portraitUrl;
  const base = portraitUrl.split("?")[0];
  return `${base}?photo=${portraitPhotoId}`;
}

export function CharacterPhotoAlbum({
  characterId,
  portraitUrl,
  portraitPhotoId,
  characterName,
  token,
  onPortraitChange,
  layout = "pane",
}) {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [activePortraitId, setActivePortraitId] = useState(portraitPhotoId ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [portraitPreviewOpen, setPortraitPreviewOpen] = useState(false);
  const isPage = layout === "page";

  const loadAlbum = useCallback(async () => {
    if (!characterId || !token) return;
    try {
      const res = await apiFetch(`/characters/${characterId}/photos`, { token });
      if (!res.ok) throw new Error("Could not load album");
      const data = await res.json();
      setPhotos(data.photos || []);
      setActivePortraitId(data.portrait_photo_id ?? null);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Could not load photo album.");
    }
  }, [characterId, token]);

  useEffect(() => {
    loadAlbum();
  }, [loadAlbum]);

  useEffect(() => {
    setActivePortraitId(portraitPhotoId ?? null);
  }, [portraitPhotoId]);

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") {
        void loadAlbum();
      }
    };
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("focus", reload);
    return () => {
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("focus", reload);
    };
  }, [loadAlbum]);

  const refreshCharacter = async () => {
    const charRes = await apiFetch(`/characters/${characterId}`, { token });
    if (!charRes.ok) return;
    const character = await charRes.json();
    setActivePortraitId(character.portrait_photo_id ?? null);
    onPortraitChange?.(character);
  };

  const handleFile = async (file) => {
    if (!file || !characterId || !token) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiUpload(`/characters/${characterId}/photos`, { token, file });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not add photo");
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setActivePortraitId(data.portrait_photo_id ?? null);
      await refreshCharacter();
    } catch (err) {
      setError(err.message || "Could not add photo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleSelectPortrait = async (photoId) => {
    if (!characterId || !token || photoId === activePortraitId) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}/portrait`, {
        token,
        method: "PUT",
        body: { photo_id: photoId },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not set portrait");
      }
      const character = await res.json();
      setActivePortraitId(character.portrait_photo_id ?? photoId);
      await loadAlbum();
      onPortraitChange?.(character);
    } catch (err) {
      setError(err.message || "Could not set portrait.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!characterId || !token) return;
    const photo = photos.find((item) => item.id === photoId);
    if (
      isPage &&
      photo &&
      !window.confirm(`Delete this photo from ${characterName || "your character"}'s album?`)
    ) {
      return;
    }

    setUploading(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}/photos/${photoId}`, {
        token,
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not delete photo");
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setActivePortraitId(data.portrait_photo_id ?? null);
      await refreshCharacter();
    } catch (err) {
      setError(err.message || "Could not delete photo.");
    } finally {
      setUploading(false);
    }
  };

  const activePhoto = photos.find((photo) => photo.id === activePortraitId);
  const previewSrc =
    activePhoto?.url || portraitPreviewUrl(portraitUrl, activePortraitId);

  return (
    <div
      className={
        isPage
          ? "mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4 sm:p-6"
          : "flex h-full min-h-0 flex-col gap-2 p-1"
      }
    >
      {isPage && (
        <div className="shrink-0 space-y-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-starlight">Photo album</h2>
          <p className="text-[11px] font-mono text-ink-faint">
            Upload reference art and portraits for {characterName || "this character"}. Tap a photo
            to set the portrait shown in sessions.
          </p>
        </div>
      )}

      <div
        className={
          isPage
            ? "flex min-h-[14rem] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-void-deep/40 p-4 sm:min-h-[18rem]"
            : "flex min-h-0 flex-[2] items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-void-deep/40 p-2"
        }
      >
        {previewSrc ? (
          <button
            type="button"
            onClick={() => setPortraitPreviewOpen(true)}
            className="flex max-h-full max-w-full items-center justify-center rounded-sm focus:outline-none focus:ring-2 focus:ring-neon-cyan/60"
            title="View larger portrait"
          >
            <AuthenticatedImage
              key={`${activePortraitId ?? "none"}-${previewSrc}`}
              src={previewSrc}
              token={token}
              alt={characterName || "Character"}
              className="max-h-full max-w-full rounded-sm border border-neon-cyan/30 object-contain"
              fallbackClassName={
                isPage
                  ? "flex h-36 w-36 items-center justify-center rounded-sm border-2 border-dashed border-border text-4xl sm:h-44 sm:w-44"
                  : "flex h-28 w-28 items-center justify-center rounded-sm border-2 border-dashed border-border text-3xl"
              }
            />
          </button>
        ) : (
          <AuthenticatedImage
            key={`${activePortraitId ?? "none"}-empty`}
            src={previewSrc}
            token={token}
            alt={characterName || "Character"}
            className="max-h-full max-w-full rounded-sm border border-neon-cyan/30 object-contain"
            fallbackClassName={
              isPage
                ? "flex h-36 w-36 items-center justify-center rounded-sm border-2 border-dashed border-border text-4xl sm:h-44 sm:w-44"
                : "flex h-28 w-28 items-center justify-center rounded-sm border-2 border-dashed border-border text-3xl"
            }
          />
        )}
      </div>

      <div
        className={
          isPage
            ? "rounded-sm border border-border/60 bg-void-deep/20 p-3"
            : "min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/20 p-1.5"
        }
      >
        <p
          className={
            isPage
              ? "mb-2 text-xs font-black uppercase tracking-widest text-ink-faint"
              : "mb-1 text-[11px] font-black uppercase tracking-widest text-ink-faint sm:text-xs"
          }
        >
          Album {photos.length > 0 ? `(${photos.length}/24)` : ""}
        </p>
        {photos.length === 0 ? (
          <p className="text-xs font-mono text-ink-faint sm:text-sm">
            Add photos below, then tap one to set your portrait.
          </p>
        ) : (
          <div className={isPage ? "grid grid-cols-4 gap-2 sm:grid-cols-5" : "grid grid-cols-3 gap-1.5"}>
            {photos.map((photo) => {
              const isActive = photo.id === activePortraitId || photo.is_portrait;
              return (
                <div key={photo.id} className="group relative">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => handleSelectPortrait(photo.id)}
                    className={`block w-full overflow-hidden rounded-sm border-2 ${
                      isActive ? "border-starlight" : "border-border hover:border-neon-cyan/60"
                    }`}
                    title={isActive ? "Current portrait" : "Set as portrait"}
                  >
                    <AuthenticatedImage
                      src={photo.url}
                      token={token}
                      alt="Album photo"
                      className="aspect-square w-full object-cover"
                      fallbackClassName="aspect-square w-full bg-void-deep/80 text-sm"
                    />
                  </button>
                  {isActive && (
                    <span className="pointer-events-none absolute left-0.5 top-0.5 rounded-sm bg-starlight/90 px-1 text-[10px] font-black uppercase text-black sm:text-xs">
                      Portrait
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => handleDeletePhoto(photo.id)}
                    className={`absolute right-0.5 top-0.5 rounded-sm bg-black/80 p-0.5 text-ink-faint transition-opacity hover:text-danger ${
                      isPage ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    title="Delete photo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={
          isPage
            ? "flex shrink-0 items-center justify-center gap-2 rounded-sm border border-neon-cyan px-4 py-2 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            : "flex shrink-0 items-center justify-center gap-1 rounded-sm border border-neon-cyan px-2 py-1 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40 sm:text-sm"
        }
      >
        <ImagePlus className="h-3.5 w-3.5" />
        {uploading ? "Uploading…" : "Add photo"}
      </button>
      {error && (
        <p
          className={
            isPage
              ? "shrink-0 text-center text-xs font-mono text-danger"
              : "shrink-0 text-center text-xs font-mono text-danger sm:text-sm"
          }
        >
          {error}
        </p>
      )}
      <p
        className={
          isPage
            ? "shrink-0 text-center text-[11px] font-mono text-ink-faint"
            : "shrink-0 text-center text-[11px] font-mono text-ink-faint sm:text-xs"
        }
      >
        Up to 24 photos · JPEG, PNG, WebP, GIF · max 4 MB
      </p>
      <PortraitPreviewModal
        open={portraitPreviewOpen}
        portraitUrl={previewSrc}
        name={characterName}
        token={token}
        onClose={() => setPortraitPreviewOpen(false)}
      />
    </div>
  );
}
