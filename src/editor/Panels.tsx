// The side panels: Add (the palette), Floors, Items, and the Inspector for the selected item.

import { useMemo, useState } from "react";
import * as THREE from "three";
import {
  Badge,
  Button,
  ButtonGroup,
  Field,
  Icon,
  IconButton,
  List,
  ListRow,
  NumberInput,
  SearchInput,
  Segmented,
  Select,
  Slider,
  Text,
  TextInput,
  Tile,
  TileGrid,
  Toggle,
} from "../ui.ts";
import { PAINT } from "../world/defaults.ts";
import { openingPreset } from "../world/geometry.ts";
import type {
  AprilTagParams,
  DoorOpening,
  HillParams,
  HoleParams,
  Item,
  MeshAsset,
  OpeningKind,
  Quat,
  Rgb,
  RoomParams,
  StairsParams,
  Vec3,
} from "../world/types.ts";
import { assetEntries, BUILT_IN, type PaletteEntry, view } from "./palette.ts";
import {
  addFloor,
  addItem,
  addItems,
  duplicateItem,
  removeFloor,
  removeItem,
  select,
  setActiveFloor,
  setDrawingPath,
  setMover,
  setNavTool,
  updateFloor,
  updateItem,
  updateNav,
  useEditor,
} from "./store.ts";

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
};
const heading: React.CSSProperties = {
  fontSize: 11,
  textTransform: "var(--label-case)" as React.CSSProperties["textTransform"],
  letterSpacing: "var(--track-label)",
  color: "var(--muted-fg)",
  margin: "6px 0 0",
};

// ── Add ──

export function AddPanel({ assets, onImport }: { assets: MeshAsset[]; onImport: () => void }) {
  const [query, setQuery] = useState("");
  const floor = useEditor((s) => s.project.activeFloor);
  const entries = useMemo(() => [...BUILT_IN, ...assetEntries(assets)], [assets]);
  const shown = entries.filter((e) => e.title.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(shown.map((e) => e.group))];
  const add = (entry: PaletteEntry) => {
    if (entry.tool) {
      setNavTool(entry.tool);
      return;
    }
    const at: Vec3 = [view.center[0], view.center[1], 0];
    if (entry.makeMany) addItems(entry.makeMany(floor, at));
    else addItem(entry.make(floor, at));
  };
  return (
    <div style={section} data-testid="add-panel">
      <SearchInput value={query} onChange={setQuery} placeholder="Search assets" />
      <Button icon="upload" onClick={onImport} data-testid="import-open">Import a GLB…</Button>
      {groups.map((group) => (
        <div key={group}>
          <p style={heading}>{group}</p>
          <TileGrid min={78}>
            {shown.filter((e) => e.group === group).map((entry) => (
              <Tile
                key={entry.key}
                title={entry.title}
                data-testid={`add-${entry.key}`}
                icon={entry.thumb ? undefined : entry.icon}
                media={entry.thumb
                  ? (
                    <img
                      src={entry.thumb}
                      alt=""
                      style={{ width: 52, height: 52, objectFit: "contain" }}
                    />
                  )
                  : undefined}
                onClick={() => add(entry)}
              />
            ))}
          </TileGrid>
        </div>
      ))}
    </div>
  );
}

// ── Floors ──

export function FloorsPanel() {
  const floors = useEditor((s) => s.project.floors);
  const active = useEditor((s) => s.project.activeFloor);
  const items = useEditor((s) => s.project.items);
  const sorted = [...floors].sort((a, b) => b.elevation - a.elevation);
  return (
    <div style={section} data-testid="floors-panel">
      <Text small muted>
        New items go on the selected floor; the others are drawn faded and can't be picked.
      </Text>
      <List divided>
        {sorted.map((floor) => (
          <ListRow
            key={floor.id}
            icon="layers"
            data-testid={`floor-${floor.id}`}
            title={floor.name}
            subtitle={`${floor.elevation.toFixed(2)} m · ${
              items.filter((i) => i.floor === floor.id).length
            } items`}
            selected={floor.id === active}
            onClick={() => setActiveFloor(floor.id)}
            actions={floors.length > 1
              ? (
                <IconButton
                  icon="trash"
                  label={`Remove ${floor.name}`}
                  size="sm"
                  variant="ghost"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    removeFloor(floor.id);
                  }}
                />
              )
              : undefined}
          />
        ))}
      </List>
      <Button icon="plus" onClick={addFloor} data-testid="add-floor">Add a floor above</Button>
      {floors.filter((f) => f.id === active).map((floor) => (
        <div key={floor.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={heading}>Selected floor</p>
          <Field label="Name">
            <TextInput
              value={floor.name}
              onChange={(name: string) =>
                updateFloor(floor.id, { name })}
            />
          </Field>
          <Toggle
            value={Boolean(floor.slab)}
            onChange={(on: boolean) =>
              updateFloor(floor.id, {
                slab: on ? { thickness: 0.3, sizeX: 30, sizeY: 30, center: [0, 0] } : undefined,
              })}
            label="Solid slab (holes cut into it)"
          />
          {floor.slab && (
            <Range
              label="Slab thickness"
              value={floor.slab.thickness}
              min={0.05}
              max={5}
              step={0.05}
              unit="m"
              onChange={(thickness) =>
                updateFloor(floor.id, { slab: { ...floor.slab!, thickness } })}
            />
          )}
          <Field label="Elevation">
            <NumberInput
              value={floor.elevation}
              step={0.1}
              unit="m"
              onChange={(elevation: number) => updateFloor(floor.id, { elevation })}
            />
          </Field>
        </div>
      ))}
    </div>
  );
}

// ── Items ──

export function ItemsPanel() {
  const items = useEditor((s) => s.project.items);
  const active = useEditor((s) => s.project.activeFloor);
  const selected = useEditor((s) => s.selected);
  const onFloor = items.filter((i) => i.floor === active);
  return (
    <div style={section}>
      {onFloor.length === 0 && (
        <Text small muted>Nothing on this floor yet: add something from Add.</Text>
      )}
      <List divided>
        {onFloor.map((item) => (
          <ListRow
            key={item.id}
            icon={item.kind === "mesh" ? "cube" : item.kind === "room" ? "home" : "pin"}
            title={item.name}
            subtitle={item.kind + (item.mover ? " · moving" : "")}
            selected={item.id === selected}
            onClick={() => select(item.id)}
          />
        ))}
      </List>
    </div>
  );
}

// ── Inspector ──

const OPENING_LABELS: Record<OpeningKind, string> = {
  door: "Door",
  double: "Double door",
  window: "Window",
  crawl: "Crawl hatch",
  arch: "Archway",
};

const toYaw = (q: Quat) =>
  Math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
const fromYaw = (yaw: number): Quat => [0, 0, Math.sin(yaw / 2), Math.cos(yaw / 2)];
const deg = (rad: number) => Math.round((rad * 180) / Math.PI * 10) / 10;

function Vec({ label, value, onChange, step = 0.1, unit = "m" }: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
  step?: number;
  unit?: string;
}) {
  return (
    <Field label={label}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {(["x", "y", "z"] as const).map((axis, i) => (
          <NumberInput
            key={axis}
            size="sm"
            value={value[i]}
            step={step}
            precision={2}
            unit={axis}
            aria-label={`${label} ${axis} (${unit})`}
            onChange={(v: number) => onChange(value.map((old, j) => (i === j ? v : old)) as Vec3)}
          />
        ))}
      </div>
    </Field>
  );
}

function Swatches({ value, onChange }: { value: Rgb; onChange: (c: Rgb) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {Object.entries(PAINT).map(([name, color]) => (
        <button
          key={name}
          type="button"
          title={name}
          aria-label={name}
          onClick={() => onChange(color)}
          style={{
            width: 24,
            height: 24,
            borderRadius: "var(--radius-sm)",
            // the world's paint, shown as itself
            background: new THREE.Color(...color).getStyle(),
            border: color.every((c, i) => c === value[i])
              ? "2px solid var(--primary)"
              : "1px solid var(--border)",
            cursor: "pointer",
          }}
        />
      ))}
    </div>
  );
}

function Range({ label, value, min, max, step, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        format={(v: number) => `${Number(v.toFixed(3))}${unit ? ` ${unit}` : ""}`}
        onChange={onChange}
      />
    </Field>
  );
}

function StairsEditor({ item }: { item: Extract<Item, { kind: "stairs" }> }) {
  const p = item.params;
  const set = (change: Partial<StairsParams>) =>
    updateItem(
      item.id,
      (i) => ({ ...i, params: { ...p, ...change } } as Item),
      `stairs-${item.id}`,
    );
  return (
    <>
      <Range
        label="Step height"
        value={p.stepHeight}
        min={0.05}
        max={0.4}
        step={0.01}
        unit="m"
        onChange={(stepHeight) => set({ stepHeight })}
      />
      <Range
        label="Step depth"
        value={p.stepDepth}
        min={0.15}
        max={0.8}
        step={0.01}
        unit="m"
        onChange={(stepDepth) => set({ stepDepth })}
      />
      <Range
        label="Width"
        value={p.width}
        min={0.4}
        max={4}
        step={0.05}
        unit="m"
        onChange={(width) => set({ width })}
      />
      <Range
        label="Steps"
        value={p.steps}
        min={1}
        max={30}
        step={1}
        onChange={(steps) => set({ steps })}
      />
      <Toggle
        value={Boolean(p.openRisers)}
        onChange={(openRisers: boolean) => set({ openRisers })}
        label="Open risers (gaps between steps, ladder-like)"
        data-testid="open-risers"
      />
      {p.openRisers && (
        <Range
          label="Tread thickness"
          value={p.treadThickness ?? 0.04}
          min={0.01}
          max={Math.max(0.02, p.stepHeight * 0.9)}
          step={0.005}
          unit="m"
          onChange={(treadThickness) => set({ treadThickness })}
        />
      )}
      <Field label="Shape">
        <Segmented
          size="sm"
          value={p.style ?? "straight"}
          items={[
            { value: "straight", label: "Straight" },
            { value: "switchback", label: "Switchback" },
            { value: "spiral", label: "Spiral" },
          ]}
          onChange={(style: string) => set({ style: style as StairsParams["style"] })}
          data-testid="stairs-style"
        />
      </Field>
      {p.style === "spiral" && (
        <>
          <Range
            label="Turn"
            value={p.spiralTurn ?? 360}
            min={90}
            max={720}
            step={15}
            unit="°"
            onChange={(spiralTurn) => set({ spiralTurn })}
          />
          <Range
            label="Center post"
            value={p.spiralCore ?? 0.1}
            min={0.05}
            max={0.6}
            step={0.01}
            unit="m"
            onChange={(spiralCore) => set({ spiralCore })}
          />
        </>
      )}
      <Field label="Railing">
        <Segmented
          size="sm"
          value={p.railing ?? "none"}
          items={[
            { value: "none", label: "None" },
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
            { value: "both", label: "Both" },
          ]}
          onChange={(railing: string) => set({ railing: railing as StairsParams["railing"] })}
          data-testid="stairs-railing"
        />
      </Field>
      {p.railing && p.railing !== "none" && p.style !== "spiral" && (
        <Field label="Railing style">
          <Segmented
            size="sm"
            value={p.railingStyle ?? "posts"}
            items={[
              { value: "posts", label: "Posts + rail" },
              { value: "panel", label: "Solid panel" },
              { value: "cables", label: "Cables" },
            ]}
            onChange={(railingStyle: string) =>
              set({ railingStyle: railingStyle as StairsParams["railingStyle"] })}
          />
        </Field>
      )}
      <Text small muted>
        Rise {(p.steps * p.stepHeight).toFixed(2)} m over {(p.steps * p.stepDepth).toFixed(2)}{" "}
        m (slope {deg(Math.atan2(p.stepHeight, p.stepDepth))}°)
      </Text>
      <Swatches value={p.color} onChange={(color) => set({ color })} />
    </>
  );
}

function HillEditor({ item }: { item: Extract<Item, { kind: "hill" }> }) {
  const p = item.params;
  const set = (change: Partial<HillParams>) =>
    updateItem(item.id, (i) => ({ ...i, params: { ...p, ...change } } as Item), `hill-${item.id}`);
  return (
    <>
      <Range
        label="Bump height"
        value={p.amplitude}
        min={0.05}
        max={3}
        step={0.05}
        unit="m"
        onChange={(amplitude) => set({ amplitude })}
      />
      <Range
        label="Roughness"
        value={p.roughness}
        min={0}
        max={0.9}
        step={0.05}
        onChange={(roughness) => set({ roughness })}
      />
      <Range
        label="Bumpiness"
        value={p.frequency}
        min={0.5}
        max={10}
        step={0.25}
        onChange={(frequency) => set({ frequency })}
      />
      <Range
        label="Detail (octaves)"
        value={p.octaves}
        min={1}
        max={7}
        step={1}
        onChange={(octaves) => set({ octaves })}
      />
      <Range
        label="Size X"
        value={p.sizeX}
        min={2}
        max={60}
        step={0.5}
        unit="m"
        onChange={(sizeX) => set({ sizeX })}
      />
      <Range
        label="Size Y"
        value={p.sizeY}
        min={2}
        max={60}
        step={0.5}
        unit="m"
        onChange={(sizeY) => set({ sizeY })}
      />
      <Range
        label="Resolution"
        value={p.resolution}
        min={16}
        max={192}
        step={8}
        onChange={(resolution) => set({ resolution })}
      />
      <Field label="Seed">
        <div style={{ display: "flex", gap: 6 }}>
          <NumberInput value={p.seed} step={1} onChange={(seed: number) => set({ seed })} />
          <IconButton
            icon="refresh"
            label="New seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 10000) })}
          />
        </div>
      </Field>
      <Toggle
        value={p.edgeFade}
        onChange={(edgeFade: boolean) => set({ edgeFade })}
        label="Fade to the ground at the edges"
      />
      <Swatches value={p.color} onChange={(color) => set({ color })} />
    </>
  );
}

function RoomEditor({ item }: { item: Extract<Item, { kind: "room" }> }) {
  const p = item.params;
  const set = (change: Partial<RoomParams>) =>
    updateItem(item.id, (i) => ({ ...i, params: { ...p, ...change } } as Item), `room-${item.id}`);
  const setDoor = (index: number, change: Partial<DoorOpening>) =>
    set({ doors: p.doors.map((d, i) => (i === index ? { ...d, ...change } : d)) });
  return (
    <>
      <Range
        label="Width (x)"
        value={p.width}
        min={1}
        max={30}
        step={0.1}
        unit="m"
        onChange={(width) => set({ width })}
      />
      <Range
        label="Depth (y)"
        value={p.depth}
        min={1}
        max={30}
        step={0.1}
        unit="m"
        onChange={(depth) => set({ depth })}
      />
      <Range
        label="Height"
        value={p.height}
        min={1}
        max={8}
        step={0.05}
        unit="m"
        onChange={(height) => set({ height })}
      />
      <Range
        label="Wall thickness"
        value={p.wallThickness}
        min={0.05}
        max={0.5}
        step={0.01}
        unit="m"
        onChange={(wallThickness) => set({ wallThickness })}
      />
      <Toggle
        value={p.ceiling}
        onChange={(ceiling: boolean) => set({ ceiling })}
        label="Ceiling"
        data-testid="room-ceiling"
      />
      <Toggle value={p.floor} onChange={(floor: boolean) => set({ floor })} label="Floor slab" />
      <p style={heading}>Doors and windows</p>
      {p.doors.map((door, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingBottom: 6,
            borderBottom: "1px solid var(--hair)",
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Badge>{OPENING_LABELS[door.kind ?? "door"]}</Badge>
            <Segmented
              size="sm"
              value={door.wall}
              items={["north", "south", "east", "west"].map((w) => ({
                value: w,
                label: w[0].toUpperCase(),
              }))}
              onChange={(wall: string) => setDoor(index, { wall: wall as DoorOpening["wall"] })}
            />
            <IconButton
              icon="trash"
              size="sm"
              variant="ghost"
              label="Remove opening"
              onClick={() => set({ doors: p.doors.filter((_, i) => i !== index) })}
            />
          </div>
          <Range
            label="Offset"
            value={door.offset}
            min={-10}
            max={10}
            step={0.1}
            unit="m"
            onChange={(offset) => setDoor(index, { offset })}
          />
          <Range
            label="Opening width"
            value={door.width}
            min={0.3}
            max={6}
            step={0.05}
            unit="m"
            onChange={(width) => setDoor(index, { width })}
          />
          <Range
            label="Sill height"
            value={door.bottom ?? 0}
            min={0}
            max={Math.max(0, p.height - 0.3)}
            step={0.05}
            unit="m"
            onChange={(bottom) => setDoor(index, { bottom })}
          />
          <Range
            label="Top"
            value={door.height}
            min={0.3}
            max={p.height}
            step={0.05}
            unit="m"
            onChange={(height) => setDoor(index, { height })}
          />
        </div>
      ))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(Object.keys(OPENING_LABELS) as OpeningKind[]).map((kind) => (
          <Button
            key={kind}
            size="sm"
            icon="plus"
            data-testid={`add-opening-${kind}`}
            onClick={() => set({ doors: [...p.doors, openingPreset(kind, "north")] })}
          >
            {OPENING_LABELS[kind]}
          </Button>
        ))}
      </div>
      <Swatches value={p.color} onChange={(color) => set({ color })} />
    </>
  );
}

function HoleEditor({ item }: { item: Extract<Item, { kind: "hole" }> }) {
  const p = item.params;
  const set = (change: Partial<HoleParams>) =>
    updateItem(item.id, (i) => ({ ...i, params: { ...p, ...change } } as Item), `hole-${item.id}`);
  const slab = useEditor((s) => s.project.floors.find((f) => f.id === item.floor)?.slab);
  return (
    <>
      <Range
        label="Size X"
        value={p.sizeX}
        min={0.2}
        max={20}
        step={0.1}
        unit="m"
        onChange={(sizeX) => set({ sizeX })}
      />
      <Range
        label="Size Y"
        value={p.sizeY}
        min={0.2}
        max={20}
        step={0.1}
        unit="m"
        onChange={(sizeY) => set({ sizeY })}
      />
      <Range
        label="Depth"
        value={p.depth}
        min={0.05}
        max={Math.max(0.1, slab?.thickness ?? 3)}
        step={0.05}
        unit="m"
        onChange={(depth) => set({ depth })}
      />
      <Text small muted>
        {slab
          ? p.depth >= slab.thickness
            ? "Cuts all the way through the floor."
            : "A pit: it keeps a bottom."
          : "This floor has no slab to cut: turn one on in Floors."}
      </Text>
    </>
  );
}

function AprilTagEditor({ item }: { item: Extract<Item, { kind: "apriltag" }> }) {
  const p = item.params;
  const set = (change: Partial<AprilTagParams>) =>
    updateItem(item.id, (i) => ({ ...i, params: { ...p, ...change } } as Item), `tag-${item.id}`);
  return (
    <>
      <Field label="Tag id (tag36h11)">
        <NumberInput
          value={p.id}
          min={0}
          max={99}
          step={1}
          onChange={(id: number) => set({ id: Math.round(id) })}
        />
      </Field>
      <Range
        label="Tag size (black square)"
        value={p.size}
        min={0.05}
        max={1}
        step={0.01}
        unit="m"
        onChange={(size) => set({ size })}
      />
    </>
  );
}

function MoverEditor({ item }: { item: Item }) {
  const drawing = useEditor((s) => s.drawingPath === item.id);
  const mover = item.mover;
  if (!mover) {
    return (
      <Button
        icon="activity"
        data-testid="make-mover"
        onClick={() => {
          setMover(item.id, {
            waypoints: [[item.position[0], item.position[1], item.position[2]]],
            speed: 0.5,
            mode: "loop",
            heading: "path",
          });
          setDrawingPath(item.id);
        }}
      >
        Make it a moving object
      </Button>
    );
  }
  const set = (change: Partial<typeof mover>) => setMover(item.id, { ...mover, ...change });
  return (
    <>
      <ButtonGroup>
        <Button
          size="sm"
          icon="pointer"
          pressed={drawing}
          data-testid="draw-path"
          onClick={() => setDrawingPath(drawing ? null : item.id)}
        >
          {drawing ? "Done adding points" : "Click to add points"}
        </Button>
        <Button
          size="sm"
          icon="eraser"
          onClick={() => set({ waypoints: mover.waypoints.slice(0, 1) })}
        >
          Clear
        </Button>
        <Button size="sm" icon="close" variant="ghost" onClick={() => setMover(item.id, undefined)}>
          Stop moving
        </Button>
      </ButtonGroup>
      {drawing && (
        <Text small tone="warn">Click on the ground to add the next point of the path.</Text>
      )}
      <Range
        label="Speed"
        value={mover.speed}
        min={0.05}
        max={3}
        step={0.05}
        unit="m/s"
        onChange={(speed) => set({ speed })}
      />
      <Field label="Path">
        <Segmented
          size="sm"
          value={mover.mode}
          items={[{ value: "loop", label: "Loop" }, { value: "pingpong", label: "Back and forth" }]}
          onChange={(mode: string) => set({ mode: mode as typeof mover.mode })}
        />
      </Field>
      <Field label="Facing">
        <Segmented
          size="sm"
          value={mover.heading}
          items={[{ value: "path", label: "Along the path" }, { value: "fixed", label: "Fixed" }]}
          onChange={(heading: string) => set({ heading: heading as typeof mover.heading })}
        />
      </Field>
      <List divided>
        {mover.waypoints.map((w, i) => (
          <ListRow
            key={i}
            icon="pin"
            title={`Point ${i + 1}`}
            subtitle={w.map((v) => v.toFixed(1)).join(", ")}
            actions={
              <IconButton
                icon="close"
                size="sm"
                variant="ghost"
                label="Remove point"
                onClick={() => set({ waypoints: mover.waypoints.filter((_, j) => j !== i) })}
              />
            }
          />
        ))}
      </List>
      <Text small muted>
        In the simulation it is a kinematic body: it shoves the robot and is never pushed back;
        lidar sees it.
      </Text>
    </>
  );
}

export function Inspector({ assets }: { assets: MeshAsset[] }) {
  const selected = useEditor((s) => s.selected);
  const item = useEditor((s) => s.project.items.find((i) => i.id === s.selected) ?? null);
  if (!selected || !item) {
    return (
      <div style={section}>
        <Text small muted>
          Select something to edit it. W / E / R: move, rotate, scale · Delete: remove · Ctrl+D:
          duplicate · Ctrl+Z: undo.
        </Text>
      </div>
    );
  }
  const asset = item.kind === "mesh" ? assets.find((a) => a.id === item.params.asset) : undefined;
  const update = (change: Partial<Item>, key = "transform") =>
    updateItem(item.id, (i) => ({ ...i, ...change } as Item), `${key}-${item.id}`);
  return (
    <div style={section} data-testid="inspector">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={item.kind === "room" ? "home" : "cube"} />
        <TextInput
          value={item.name}
          onChange={(name: string) => update({ name }, "name")}
          aria-label="Name"
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Badge>{item.kind === "primitive" ? item.params.shape : item.kind}</Badge>
        {asset && <Badge tone="info">{asset.hulls.length} collision hulls</Badge>}
        {item.mover && <Badge tone="warn">moving</Badge>}
      </div>
      <Vec label="Position" value={item.position} onChange={(position) => update({ position })} />
      <Field label="Rotation (yaw)">
        <NumberInput
          value={deg(toYaw(item.rotation))}
          step={15}
          unit="°"
          onChange={(v: number) => update({ rotation: fromYaw((v * Math.PI) / 180) })}
        />
      </Field>
      {(item.kind === "primitive" || item.kind === "mesh") && (
        <Vec
          label={item.kind === "primitive" ? "Size" : "Scale"}
          value={item.scale}
          step={0.05}
          unit={item.kind === "primitive" ? "m" : "×"}
          onChange={(scale) => update({ scale })}
        />
      )}
      {item.kind === "primitive" && (
        <Swatches
          value={item.params.color}
          onChange={(color) =>
            update({ params: { ...item.params, color } } as Partial<Item>, "color")}
        />
      )}
      {item.kind === "stairs" && <StairsEditor item={item} />}
      {item.kind === "hill" && <HillEditor item={item} />}
      {item.kind === "room" && <RoomEditor item={item} />}
      {item.kind === "hole" && <HoleEditor item={item} />}
      {item.kind === "apriltag" && <AprilTagEditor item={item} />}
      {item.kind !== "hole" && item.kind !== "apriltag" && (
        <>
          <p style={heading}>Motion</p>
          <MoverEditor item={item} />
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button size="sm" icon="copy" onClick={() => duplicateItem(item.id)}>Duplicate</Button>
        <Button size="sm" icon="trash" variant="danger" onClick={() => removeItem(item.id)}>
          Remove
        </Button>
      </div>
    </div>
  );
}

// ── Nav test ──

export function NavPanel() {
  const project = useEditor((s) => s.project);
  const tool = useEditor((s) => s.navTool);
  const nav = project.nav ??
    {
      startSpawn: project.spawns[0]?.name ?? "default",
      floor: project.activeFloor,
      mappingPath: [],
      goals: [],
    };
  const toggle = (which: "path" | "goal") => setNavTool(tool === which ? null : which);
  return (
    <div style={section} data-testid="nav-panel">
      <Text small muted>
        A navigation test for any robot and nav stack: the robot is first driven along the mapping
        path (to build its map), then sent to each goal in turn. Exported as nav_eval.json;
        verify/nav_eval.py runs and scores it.
      </Text>
      <Field label="Start at">
        <Select
          value={nav.startSpawn}
          options={project.spawns.map((s) => s.name)}
          onChange={(startSpawn: string) => updateNav((n) => ({ ...n, startSpawn }))}
        />
      </Field>
      <p style={heading}>Mapping path</p>
      <ButtonGroup>
        <Button
          size="sm"
          icon="line"
          pressed={tool === "path"}
          onClick={() => toggle("path")}
          data-testid="nav-draw-path"
        >
          {tool === "path" ? "Done drawing" : "Draw the path"}
        </Button>
        <Button
          size="sm"
          icon="eraser"
          onClick={() => updateNav((n) => ({ ...n, mappingPath: [] }))}
        >
          Clear
        </Button>
      </ButtonGroup>
      {tool === "path" && (
        <Text small tone="warn">
          Click on the ground, point after point, where the robot should walk.
        </Text>
      )}
      <Text small muted>
        {nav.mappingPath.length} points, {nav.mappingPath.slice(1).reduce(
          (sum, p, i) =>
            sum + Math.hypot(p[0] - nav.mappingPath[i][0], p[1] - nav.mappingPath[i][1]),
          0,
        ).toFixed(1)} m
      </Text>
      <p style={heading}>Goals</p>
      <Button
        size="sm"
        icon="target"
        pressed={tool === "goal"}
        onClick={() => toggle("goal")}
        data-testid="nav-add-goal"
      >
        {tool === "goal" ? "Done placing goals" : "Place goals"}
      </Button>
      {tool === "goal" && <Text small tone="warn">Click on the ground to place each goal.</Text>}
      <List divided>
        {nav.goals.map((goal) => (
          <ListRow
            key={goal.id}
            icon="target"
            title={goal.name}
            subtitle={`${goal.position[0].toFixed(1)}, ${
              goal.position[1].toFixed(1)
            } · within ${goal.tolerance} m · ${goal.timeout} s`}
            actions={
              <IconButton
                icon="close"
                size="sm"
                variant="ghost"
                label={`Remove ${goal.name}`}
                onClick={() =>
                  updateNav((n) => ({ ...n, goals: n.goals.filter((g) => g.id !== goal.id) }))}
              />
            }
          />
        ))}
      </List>
      {nav.goals.length > 0 && (
        <>
          <Range
            label="Goal tolerance"
            value={nav.goals[0].tolerance}
            min={0.1}
            max={2}
            step={0.05}
            unit="m"
            onChange={(tolerance) =>
              updateNav(
                (n) => ({ ...n, goals: n.goals.map((g) => ({ ...g, tolerance })) }),
                "nav-tolerance",
              )}
          />
          <Range
            label="Time per goal"
            value={nav.goals[0].timeout}
            min={10}
            max={600}
            step={10}
            unit="s"
            onChange={(timeout) =>
              updateNav(
                (n) => ({ ...n, goals: n.goals.map((g) => ({ ...g, timeout })) }),
                "nav-timeout",
              )}
          />
        </>
      )}
      <p style={heading}>Spawns</p>
      <List divided>
        {project.spawns.map((spawn, i) => (
          <ListRow
            key={spawn.name}
            icon="robot"
            title={spawn.name}
            subtitle={`${spawn.position[0].toFixed(1)}, ${spawn.position[1].toFixed(1)} · facing ${
              Math.round((spawn.yaw * 180) / Math.PI)
            }°`}
            actions={i === 0 ? <Badge>default</Badge> : undefined}
          />
        ))}
      </List>
    </div>
  );
}
