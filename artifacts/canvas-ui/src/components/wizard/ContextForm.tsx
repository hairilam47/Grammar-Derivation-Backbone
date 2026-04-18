import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { OrganisationContext } from "@workspace/architecture-grammar";

interface ContextFormProps {
  data: OrganisationContext;
  onChange: (data: OrganisationContext) => void;
  onNext: () => void;
}

export function ContextForm({ data, onChange, onNext }: ContextFormProps) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">System Context</h1>
        <p className="text-muted-foreground text-sm">Define the operational context for the proposed architecture.</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Organisation Profile</CardTitle>
            <CardDescription>Select the governing entity type.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={data.organisationType}
              onValueChange={(val: any) => onChange({ ...data, organisationType: val })}
              className="flex gap-4"
              data-testid="radio-org-type"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Enterprise" id="org-enterprise" data-testid="radio-org-enterprise" />
                <Label htmlFor="org-enterprise">Enterprise</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Government" id="org-gov" data-testid="radio-org-government" />
                <Label htmlFor="org-gov">Government</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Sensitivity Level</CardTitle>
            <CardDescription>Identify the data classification level.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={data.sensitivityLevel}
              onValueChange={(val: any) => onChange({ ...data, sensitivityLevel: val })}
              className="flex gap-4"
              data-testid="radio-sensitivity"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Low" id="sens-low" data-testid="radio-sens-low" />
                <Label htmlFor="sens-low">Low</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Medium" id="sens-med" data-testid="radio-sens-medium" />
                <Label htmlFor="sens-med">Medium</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="High" id="sens-high" data-testid="radio-sens-high" />
                <Label htmlFor="sens-high" className="text-destructive font-bold">High</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">System Intent</CardTitle>
            <CardDescription>Determine the primary objective of the deployment.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={data.systemIntent}
              onValueChange={(val: any) => onChange({ ...data, systemIntent: val })}
              className="flex flex-col gap-3"
              data-testid="radio-intent"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NewCapability" id="intent-new" data-testid="radio-intent-new" />
                <Label htmlFor="intent-new">New Capability</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="LegacyReplacement" id="intent-legacy" data-testid="radio-intent-legacy" />
                <Label htmlFor="intent-legacy">Legacy Replacement</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Expected Lifespan</CardTitle>
            <CardDescription>Projected operational lifespan in years.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm font-bold">
              <span>1 Year</span>
              <span className="text-primary text-lg">{data.expectedLifespanYears} Years</span>
              <span>30 Years</span>
            </div>
            <Slider
              value={[data.expectedLifespanYears]}
              onValueChange={([val]) => onChange({ ...data, expectedLifespanYears: val })}
              max={30}
              min={1}
              step={1}
              data-testid="slider-lifespan"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4">
          <Button onClick={onNext} className="gap-2" data-testid="button-next-step-1">
            Proceed to Capabilities <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
