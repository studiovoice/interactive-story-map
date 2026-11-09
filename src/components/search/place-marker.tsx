"use client"

import { XIcon } from "lucide-react"
import { MapMarker } from "@/components/map/map-marker"
import type { PlaceResult } from "@/lib/geocoding/types"

/** Where a place search landed: a small pin with the place's name. */
export function PlaceMarker({ place, onClear }: { place: PlaceResult; onClear: () => void }) {
  return (
    <MapMarker lngLat={place.center} anchor="bottom">
      <div className="flex flex-col items-center">
        <span className="mb-0.5 flex items-center gap-1 rounded-full border bg-popover py-0.5 pr-1 pl-2 text-[11px] font-medium whitespace-nowrap text-popover-foreground shadow-md">
          {place.name}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remove search marker"
          >
            <XIcon className="size-3" />
          </button>
        </span>
        <span className="size-3 rounded-full border-2 border-background bg-info shadow" />
      </div>
    </MapMarker>
  )
}
