// Canvas Enhancements — per-lens named layers panel.
//
// Renders a small aside with the list of layers for the current lens.
// Each row shows an eye/eye-off toggle, a rename button (label acts as
// the rename trigger via window.prompt), and a delete button. An "Add
// layer" button sits at the bottom and prompts for a name.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN.
//   - All mutations go through the layer helpers in acwViewState so
//     the assertValid boundary is always crossed before persistence.
//   - Node assignment (layerIds) is exposed in NodePropertiesPanel,
//     not here; this panel is purely about layer management.
import { useEffect, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  addLensLayer,
  deleteLensLayer,
  getLensLayerVisibility,
  getLensLayers,
  renameLensLayer,
  subscribeViewState,
  toggleLensLayerVisibility,
} from "@/acw/acwViewState";

const PANEL_TITLE = "Layers";
const ADD_LAYER_LABEL = "Add layer";
const ADD_LAYER_PROMPT = "Name for the new layer";
const NO_LAYERS_NOTICE =
  "No layers defined. Add one to group nodes by concern.";
const DELETE_LAYER_LABEL = "Delete layer";
const TOGGLE_VIS_LABEL = "Toggle layer visibility";
const RENAME_LAYER_PROMPT = "New name for the layer";

assertAllAcwPlaceholderLanguage([
  PANEL_TITLE,
  ADD_LAYER_LABEL,
  ADD_LAYER_PROMPT,
  NO_LAYERS_NOTICE,
  DELETE_LAYER_LABEL,
  TOGGLE_VIS_LABEL,
  RENAME_LAYER_PROMPT,
]);

export interface LayersPanelProps {
  readonly lensId: string;
}

export function LayersPanel({ lensId }: LayersPanelProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  const layers = getLensLayers(lensId);
  const visibility = getLensLayerVisibility(lensId);

  function onAddLayer() {
    if (typeof window === "undefined") return;
    const raw = window.prompt(ADD_LAYER_PROMPT, "");
    if (raw === null) return;
    const name = raw.trim();
    if (name.length === 0) return;
    addLensLayer(lensId, name);
  }

  function onRenameLayer(layerId: string, currentName: string) {
    if (typeof window === "undefined") return;
    const raw = window.prompt(RENAME_LAYER_PROMPT, currentName);
    if (raw === null) return;
    const name = raw.trim();
    if (name.length === 0 || name === currentName) return;
    renameLensLayer(lensId, layerId, name);
  }

  return (
    <aside
      data-testid="acw-studio-layers-panel"
      className="es-props"
      style={{ minWidth: 180 }}
    >
      <header className="es-props-head">
        <h3 className="es-props-title">{PANEL_TITLE}</h3>
      </header>
      {layers.length === 0 ? (
        <p className="es-props-sealed">{NO_LAYERS_NOTICE}</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {layers.map((layer) => {
            const vis = visibility[layer.id] !== false;
            return (
              <li
                key={layer.id}
                data-testid={`acw-studio-layer-row-${layer.id}`}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <button
                  type="button"
                  onClick={() => toggleLensLayerVisibility(lensId, layer.id)}
                  title={TOGGLE_VIS_LABEL}
                  aria-label={TOGGLE_VIS_LABEL}
                  aria-pressed={vis}
                  data-testid={`acw-studio-layer-vis-${layer.id}`}
                  className="es-cnode-btn"
                  style={{ flexShrink: 0 }}
                >
                  {vis ? (
                    <Eye className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <EyeOff className="w-3 h-3" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onRenameLayer(layer.id, layer.name)}
                  data-testid={`acw-studio-layer-name-${layer.id}`}
                  className="es-cnode-btn"
                  style={{
                    flex: 1,
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {layer.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteLensLayer(lensId, layer.id)}
                  title={DELETE_LAYER_LABEL}
                  aria-label={DELETE_LAYER_LABEL}
                  data-testid={`acw-studio-layer-delete-${layer.id}`}
                  className="es-cnode-btn"
                  data-tone="danger"
                  style={{ flexShrink: 0 }}
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={onAddLayer}
          data-testid="acw-studio-layers-add"
          className="es-cnode-btn"
          style={{ width: "100%" }}
        >
          {ADD_LAYER_LABEL}
        </button>
      </div>
    </aside>
  );
}
