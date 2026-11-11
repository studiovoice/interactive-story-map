"use client"

import { MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { resetSettings, updateSettings, useSettings } from "@/lib/settings"
import { StartViewSetting } from "./start-view-setting"

/** Header gear menu. Add new preferences as another <Section> / row. */
export function SettingsMenu() {
  const settings = useSettings()
  const { theme, setTheme } = useTheme()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <SettingsIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 pt-3 pb-2">
          <h2 className="text-sm font-semibold">Settings</h2>
          <p className="text-xs text-muted-foreground">Saved in this browser.</p>
        </div>
        <Separator />

        <Section title="Appearance">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={theme}
            onValueChange={(v) => v && setTheme(v)}
            className="w-full"
            aria-label="Theme"
          >
            <ToggleGroupItem value="light" className="flex-1">
              <SunIcon /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" className="flex-1">
              <MoonIcon /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="flex-1">
              <MonitorIcon /> System
            </ToggleGroupItem>
          </ToggleGroup>
        </Section>
        <Separator />

        <Section title="Map">
          <StartViewSetting />
          <SwitchRow
            id="setting-approx-areas"
            label="Show approximate areas"
            description="Circles around points whose location is approximate or hidden for privacy."
            checked={settings.showApproxAreas}
            onChange={(v) => updateSettings({ showApproxAreas: v })}
          />
        </Section>
        <Separator />

        <div className="flex justify-end px-2 py-1.5">
          <Button variant="ghost" size="xs" onClick={resetSettings}>
            Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 px-4 py-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}
