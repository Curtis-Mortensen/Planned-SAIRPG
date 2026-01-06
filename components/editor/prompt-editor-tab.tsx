"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/stores/game-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface PromptSettings {
  verbosity: number;
  tone: number;
  challenge: number;
  temperature: number;
  max_tokens: number;
  lore?: string;
}

interface PromptData {
  id: string | null;
  moduleName: string;
  name: string;
  version: string;
  content: string;
  settings: PromptSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function PromptEditorTab() {
  const selectedModule = useGameStore((s) => s.selectedModule);
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoreExpanded, setIsLoreExpanded] = useState(false);

  // Local state for editing
  const [verbosity, setVerbosity] = useState(3);
  const [tone, setTone] = useState(3);
  const [challenge, setChallenge] = useState(3);
  const [lore, setLore] = useState("");
  const [promptContent, setPromptContent] = useState("");

  // Load prompt data when module changes
  useEffect(() => {
    if (!selectedModule) return;

    const loadPrompt = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/prompts?module=${selectedModule}`);
        if (response.ok) {
          const data: PromptData = await response.json();
          setPromptData(data);
          
          // Initialize local state
          setVerbosity(data.settings.verbosity ?? 3);
          setTone(data.settings.tone ?? 3);
          setChallenge(data.settings.challenge ?? 3);
          setLore(data.settings.lore ?? "");
          setPromptContent(data.content);
          setHasChanges(false);
        } else {
          // Module doesn't have a prompt yet - show placeholder
          setPromptData(null);
        }
      } catch (error) {
        console.error("Failed to load prompt:", error);
        // Module doesn't have a prompt yet - show placeholder
        setPromptData(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadPrompt();
  }, [selectedModule]);

  const handleSave = async () => {
    if (!selectedModule || !promptData) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/prompts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleName: selectedModule,
          content: promptContent,
          settings: {
            verbosity,
            tone,
            challenge,
            temperature: promptData.settings.temperature,
            max_tokens: promptData.settings.max_tokens,
            lore,
          },
        }),
      });

      if (response.ok) {
        const updated = await response.json();
        setPromptData(updated);
        setHasChanges(false);
        toast.success("Prompt saved successfully");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      console.error("Failed to save prompt:", error);
      toast.error("Failed to save prompt configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!promptData) return;
    
    setVerbosity(promptData.settings.verbosity ?? 3);
    setTone(promptData.settings.tone ?? 3);
    setChallenge(promptData.settings.challenge ?? 3);
    setLore(promptData.settings.lore ?? "");
    setPromptContent(promptData.content);
    setHasChanges(false);
    toast.info("Changes discarded");
  };

  const markAsChanged = () => {
    if (!hasChanges) setHasChanges(true);
  };

  if (!selectedModule) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Select a module to edit its prompt</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Loading prompt configuration...</p>
      </div>
    );
  }

  if (!promptData) {
    const moduleNames: Record<string, string> = {
      narrator: "Narrator Module",
      "valid-input": "Valid Input Module",
      "meta-nesting": "Meta Nesting Module", 
      "meta-event": "Meta Event Module",
      time: "Time Module",
      npc: "NPC Module",
      difficulty: "Difficulty Module",
    };

    const displayName = moduleNames[selectedModule] || selectedModule;
    
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4 gap-4">
        <div className="text-center">
          <h3 className="font-semibold text-lg mb-2">{displayName}</h3>
          <p className="text-muted-foreground text-sm">
            {selectedModule === "narrator" 
              ? "This module is not configured yet. Check back soon!"
              : "This module is coming soon. Stay tuned for updates!"
            }
          </p>
        </div>
      </div>
    );
  }

  const getToneLabel = (value: number) => {
    if (value <= 1.5) return "Light";
    if (value <= 2.5) return "Casual";
    if (value <= 3.5) return "Balanced";
    if (value <= 4.5) return "Serious";
    return "Mature";
  };

  const getVerbosityLabel = (value: number) => {
    const labels = ["Minimal", "Terse", "Brief", "Balanced", "Detailed", "Verbose"];
    return labels[Math.round(value - 1)] ?? "Balanced";
  };

  const getChallengeLabel = (value: number) => {
    const labels = ["Trivial", "Easy", "Relaxed", "Balanced", "Difficult", "Brutal"];
    return labels[Math.round(value - 1)] ?? "Balanced";
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div>
          <h2 className="font-semibold text-lg">
            {selectedModule.charAt(0).toUpperCase() + selectedModule.slice(1)} Module
          </h2>
          <p className="text-muted-foreground text-sm">
            Configure the system prompt and behavior settings
          </p>
        </div>

        {/* Verbosity Slider */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="verbosity" className="font-medium text-sm">
                Verbosity
              </Label>
              <span className="font-mono text-muted-foreground text-xs">
                {verbosity} - {getVerbosityLabel(verbosity)}
              </span>
            </div>
            <Slider
              id="verbosity"
              min={1}
              max={5}
              step={1}
              value={[verbosity]}
              onValueChange={(value) => {
                setVerbosity(value[0]);
                markAsChanged();
              }}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">
              Controls response length (1=minimal, 5=verbose)
            </p>
          </div>
        </Card>

        {/* Tone Slider */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="tone" className="font-medium text-sm">
                Tone
              </Label>
              <span className="font-mono text-muted-foreground text-xs">
                {tone} - {getToneLabel(tone)}
              </span>
            </div>
            <Slider
              id="tone"
              min={1}
              max={5}
              step={1}
              value={[tone]}
              onValueChange={(value) => {
                setTone(value[0]);
                markAsChanged();
              }}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">
              Story atmosphere (1=light & whimsical, 5=dark & mature)
            </p>
          </div>
        </Card>

        {/* Challenge Slider */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="challenge" className="font-medium text-sm">
                Challenge
              </Label>
              <span className="font-mono text-muted-foreground text-xs">
                {challenge} - {getChallengeLabel(challenge)}
              </span>
            </div>
            <Slider
              id="challenge"
              min={1}
              max={5}
              step={1}
              value={[challenge]}
              onValueChange={(value) => {
                setChallenge(value[0]);
                markAsChanged();
              }}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">
              Difficulty level (1=easy successes, 5=brutal consequences)
            </p>
          </div>
        </Card>

        {/* Lore File - Collapsible */}
        <Card className="p-4">
          <Collapsible open={isLoreExpanded} onOpenChange={setIsLoreExpanded}>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <Label className="font-medium text-sm">Lore File</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {lore.length} characters
                </span>
                {isLoreExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <Textarea
                value={lore}
                onChange={(e) => {
                  setLore(e.target.value);
                  markAsChanged();
                }}
                placeholder="Enter world lore, setting details, themes, and background information..."
                className="min-h-[200px] font-mono text-xs"
              />
              <p className="mt-2 text-muted-foreground text-xs">
                World-building context injected into the system prompt
              </p>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* System Prompt - Read Only Display */}
        <Card className="p-4">
          <div className="space-y-3">
            <Label className="font-medium text-sm">System Prompt (Read-Only)</Label>
            <Textarea
              value={promptContent}
              readOnly
              className="min-h-[300px] cursor-default font-mono text-xs opacity-75"
            />
            <p className="text-muted-foreground text-xs">
              The core system prompt template. Advanced editing coming soon.
            </p>
          </div>
        </Card>
      </div>

      {/* Save/Reset Footer */}
      <div className="border-t bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-xs">
            {hasChanges ? "Unsaved changes" : "No changes"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || isSaving}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}



