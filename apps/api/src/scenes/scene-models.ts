import { energyPrice, type SceneModelKey } from "@wanderer/shared";
import type { EnergySettings, SceneModel } from "../generated/prisma/client.js";
import type { SceneImageRequest } from "./runpod-client.js";

const IMAGE_SIZE = 1024;

/** One RunPod public endpoint. Each model has its own input format, so each key has its own adapter. */
export interface SceneModelAdapter {
  endpointId: string;
  /** The `input` of the /run request. */
  input(request: SceneImageRequest): Record<string, unknown>;
}

export const SCENE_MODELS: Record<SceneModelKey, SceneModelAdapter> = {
  "flux-schnell": {
    endpointId: "black-forest-labs-flux-1-schnell",
    input: (request) => ({
      prompt: request.prompt,
      seed: -1,
      num_inference_steps: 4,
      guidance: 7,
      negative_prompt: request.negativePrompt,
      image_format: "png",
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
    }),
  },
  // Z-Image Turbo has no negative prompt. The safe words of a chat that is not 18+ are in the prompt.
  "z-image-turbo": {
    endpointId: "z-image-turbo",
    input: (request) => ({
      prompt: request.prompt,
      size: `${IMAGE_SIZE}*${IMAGE_SIZE}`,
      seed: -1,
      enable_safety_checker: !request.adult,
    }),
  },
};

/** The energy price of one scene image in hundredths: the RunPod cost with the markup of the model or the default. */
export function sceneEnergyPrice(model: SceneModel, settings: EnergySettings): number {
  return energyPrice(model.costUsd.toNumber(), model.markupPercent ?? settings.imageMarkupPercent);
}
