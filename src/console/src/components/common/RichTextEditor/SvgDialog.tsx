import { Shapes, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ModalHeader } from "@/components/common/ModalHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { sanitizeSvg, svgLabels } from "./svgSafe";

/** Where the label being edited sits, in the preview box's own coordinates. */
interface Spot {
  index: number;
  value: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Insert or edit an inline SVG drawing.
 *
 * Two tabs, because the two things an author does with a diagram are not the
 * same job: paste the markup once, then correct the wording in it many times.
 * The preview is where the wording is corrected — click a label and type over
 * it. Editing the labels through the markup means hunting for a word between
 * coordinates, which is how typos survive.
 */
export function SvgDialog({
  open,
  onOpenChange,
  initial,
  initialTab = "code",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The drawing being edited, or "" when inserting a new one. */
  initial: string;
  /** Which job the caller came to do: paste markup, or fix the wording. */
  initialTab?: "code" | "preview";
  onSubmit: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(initial);
  const [tab, setTab] = useState<string>(initialTab);
  const [spot, setSpot] = useState<Spot | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode(initial);
      setTab(initial ? initialTab : "code");
      setSpot(null);
    }
  }, [open, initial, initialTab]);

  // What the server would keep. The preview shows this, not the raw paste, so
  // a drawing that loses half its parts on save says so here instead.
  const safe = sanitizeSvg(code);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [spot]);

  function openLabel(target: EventTarget) {
    const box = boxRef.current;
    const svg = box?.querySelector("svg");
    if (!box || !svg || !(target instanceof Element)) return;
    const label = target.closest("text, tspan");
    if (!label) return;
    const index = svgLabels(svg).indexOf(label as SVGElement);
    if (index < 0) return;
    const rect = label.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    setSpot({
      index,
      value: label.textContent ?? "",
      left: rect.left - frame.left,
      top: rect.top - frame.top,
      // A one-word label gives a box too small to type in.
      width: Math.max(rect.width, 80),
      height: Math.max(rect.height, 20),
    });
  }

  /** Writes the edited wording back into the markup, which stays the source. */
  function commitLabel() {
    if (!spot) return;
    const doc = new DOMParser().parseFromString(safe, "image/svg+xml");
    const svg = doc.documentElement;
    const label = svgLabels(svg)[spot.index];
    if (label) {
      label.textContent = spot.value;
      setCode(svg.outerHTML);
    }
    setSpot(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")} className="max-w-3xl">
        <ModalHeader
          icon={Shapes}
          title={t("editor.svg.title")}
          subject={t("editor.svg.subject")}
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="code">{t("editor.svg.tab_code")}</TabsTrigger>
            <TabsTrigger value="preview" disabled={!safe}>
              {t("editor.svg.tab_preview")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="code">
            <Textarea
              aria-label={t("editor.svg.tab_code")}
              className="min-h-[18rem] font-mono text-xs"
              placeholder={t("editor.svg.code_ph")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("editor.svg.code_hint")}
            </p>
          </TabsContent>
          <TabsContent value="preview">
            {/* The box is the positioning frame: the input for a label sits on
                top of the drawing, at the label's own place. It cannot live
                inside the box itself, which React fills from markup. */}
            <div className="relative" ref={boxRef}>
              <div
                className="svg-preview rounded-md border bg-background p-4"
                // The labels are the only interactive parts; a click anywhere
                // else lands here and is ignored.
                onClick={(e) => openLabel(e.target)}
                dangerouslySetInnerHTML={{ __html: safe }}
              />
              {spot && (
                <input
                  ref={inputRef}
                  className="absolute z-10 rounded-sm border border-primary bg-background px-1 text-sm shadow-sm"
                  style={{
                    left: spot.left,
                    top: spot.top,
                    width: spot.width,
                    height: spot.height,
                  }}
                  value={spot.value}
                  onChange={(e) => setSpot({ ...spot, value: e.target.value })}
                  onBlur={commitLabel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitLabel();
                    if (e.key === "Escape") setSpot(null);
                  }}
                />
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("editor.svg.preview_hint")}
            </p>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!safe}
            onClick={() => {
              onSubmit(safe);
              onOpenChange(false);
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
