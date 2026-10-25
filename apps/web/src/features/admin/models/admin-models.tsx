"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminEnergyView } from "@wanderer/shared";
import { ADMIN_ENERGY_KEY } from "@/features/admin/admin-energy";
import { ApiError, apiFetch } from "@/lib/api";
import { LimitsForm, MarkupPanel } from "@/features/admin/models/admin-energy-settings";
import { FreeModelsSection } from "@/features/admin/models/admin-free-models";
import { SceneModelsSection } from "@/features/admin/models/admin-scene-models";

/**
 * The admin page "Energy and models". The markup comes first, because it moves every price below it. Then the free
 * text models, the scene image models, and the daily energy with the limits.
 */
export function AdminModels() {
  const queryClient = useQueryClient();
  const energy = useQuery({ queryKey: ADMIN_ENERGY_KEY, queryFn: () => apiFetch<AdminEnergyView>("/admin/energy") });
  const changed = () => void queryClient.invalidateQueries({ queryKey: ADMIN_ENERGY_KEY });

  if (energy.error instanceof ApiError && energy.error.status === 403) {
    return <p className="m-0 text-muted">This page is for the admin.</p>;
  }
  if (energy.isPending) {
    return <p className="m-0 text-muted">Loading the models…</p>;
  }
  if (energy.isError) {
    return <p className="m-0 text-muted">The models did not load. Reload the page to try again.</p>;
  }
  const { freeModels, sceneModels, settings } = energy.data;
  return (
    <div className="flex flex-col gap-10">
      <MarkupPanel settings={settings} freeModels={freeModels} sceneModels={sceneModels} onSaved={changed} />
      <FreeModelsSection models={freeModels} onChanged={changed} />
      <SceneModelsSection models={sceneModels} settings={settings} onChanged={changed} />
      <LimitsForm settings={settings} onSaved={changed} />
    </div>
  );
}
