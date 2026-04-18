import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import type { ProjectMetadata } from "@/governance/types";

interface FreezeMetadataFormProps {
  initial: ProjectMetadata;
  onConfirm: (metadata: ProjectMetadata) => void;
  onCancel: () => void;
}

export function FreezeMetadataForm({
  initial,
  onConfirm,
  onCancel,
}: FreezeMetadataFormProps) {
  const [projectName, setProjectName] = useState(initial.projectName);
  const [approvingAuthority, setApprovingAuthority] = useState(
    initial.approvingAuthority,
  );

  const ready =
    projectName.trim().length > 0 && approvingAuthority.trim().length > 0;

  return (
    <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          Pre-Freeze
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Identify the Decision
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          These fields appear on the artefacts but are not part of the
          architectural decision itself. They do not affect the version.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <Lock className="w-4 h-4" /> Decision Metadata
          </CardTitle>
          <CardDescription>
            Required to issue the Architecture Decision Snapshot and Execution
            Constraint Profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name" className="text-xs uppercase tracking-widest text-muted-foreground">
              Project Name
            </Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Claims Modernisation Programme"
              data-testid="input-project-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="authority" className="text-xs uppercase tracking-widest text-muted-foreground">
              Approving Authority
            </Label>
            <Input
              id="authority"
              value={approvingAuthority}
              onChange={(e) => setApprovingAuthority(e.target.value)}
              placeholder="e.g. Architecture Review Board"
              data-testid="input-authority"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={onCancel}
          className="gap-2"
          data-testid="button-cancel-freeze"
        >
          <ArrowLeft className="w-4 h-4" /> Cancel
        </Button>
        <Button
          onClick={() =>
            onConfirm({
              projectName: projectName.trim(),
              approvingAuthority: approvingAuthority.trim(),
            })
          }
          disabled={!ready}
          className="gap-2"
          data-testid="button-confirm-freeze-metadata"
        >
          Continue to Freeze <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
