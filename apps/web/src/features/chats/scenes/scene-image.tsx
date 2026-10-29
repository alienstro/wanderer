"use client";

import { useMutation } from "@tanstack/react-query";
import type { SceneView } from "@wanderer/shared";
import { BoltIcon, ImageIcon } from "@/components/ui/icons";
import { useRefreshEnergy } from "@/features/energy";
import { ApiError, apiFetch, fileSrc } from "@/lib/api";

/** The text for a failed scene image. An AI error of the model has its own text in the chat page. */
export function sceneErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : null;
  if (code === "scene_limit") {
    return "You made the most scene images for today. Try again tomorrow.";
  }
  if (code === "scene_busy") {
    return "A scene image is already on its way. Wait for it.";
  }
  if (code === "scene_timeout") {
    return "The scene image took too long. Try again.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "You asked for many scene images in a short time. Wait a minute, then try again.";
  }
  return "The scene image did not generate. Try again.";
}

/**
 * Starts one scene image. The API makes the image in a few seconds, then the page adds it to the chat. The energy
 * loads again after each job, because the API takes the price first and gives it back on a failure.
 */
export function useSceneJob(chatId: string, onMade: (scene: SceneView) => void, onError: (error: unknown) => void) {
  const refreshEnergy = useRefreshEnergy();
  return useMutation({
    mutationFn: () => apiFetch<SceneView>(`/chats/${chatId}/scenes`, { method: "POST" }),
    onSuccess: onMade,
    onError,
    onSettled: refreshEnergy,
  });
}

interface GenerateSceneProps {
  busy: boolean;
  disabled: boolean;
  /** The energy price of one scene image. It is undefined while the energy loads. */
  price?: number;
  onClick: () => void;
}

/**
 * The "Generate scene" button in the message bar: the icon and the price side by side. It is disabled while a job runs, so a second
 * click starts nothing. A low balance does not disable it: a click shows the reason.
 */
export function GenerateSceneButton({ busy, disabled, price, onClick }: GenerateSceneProps) {
  return (
    <button
      type="button"
      className="composer-tool composer-tool-wide"
      title={price === undefined ? "Generate scene" : `Generate scene: ${price} energy`}
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={onClick}
    >
      {busy ? <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <ImageIcon />}
      <span className="sr-only">{busy ? "Making the scene…" : "Generate scene"}</span>
      {!busy && price !== undefined && (
        <>
          {/* The price shows next to the icon before the click, so the user knows the cost. */}
          <span aria-hidden="true" className="inline-flex items-center gap-px text-[12px] font-semibold text-muted">
            {price}
            <BoltIcon />
          </span>
          <span className="sr-only">, {price} energy</span>
        </>
      )}
    </button>
  );
}

/** One scene image in the chat. A click opens the full size in a new tab. */
export function SceneImage({ scene }: { scene: SceneView }) {
  const src = fileSrc(scene.url);
  return (
    <figure className="m-0 self-center">
      <a href={src} target="_blank" rel="noreferrer" className="block">
        <img
          src={src}
          alt="Scene image"
          width={1024}
          height={1024}
          loading="lazy"
          className="block h-auto w-full max-w-[512px] rounded-[16px] border border-line"
        />
      </a>
    </figure>
  );
}

/** The scenes that show after the message at `position`: up to the next message, so a deleted message keeps its scenes. */
export function scenesAfter(scenes: SceneView[], position: number, nextPosition: number | undefined): SceneView[] {
  return scenes.filter((scene) => scene.afterPosition >= position && (nextPosition === undefined || scene.afterPosition < nextPosition));
}
