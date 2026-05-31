# Development Guide

## Adding a new ECS component

1. Create `src/engine/components/MyComponent.ts` extending no base class (plain TS class).
2. Add it to the relevant Query in the system that reads it.
3. Initialize it in the relevant handler (e.g. `furnitureHandlers.ts`).

## Adding a new command

1. Add a new variant to the discriminated union in `src/engine/commands/EngineCommands.ts`.
2. Add a `case 'MY_COMMAND':` in `src/engine/commands/dispatcher.ts` that delegates to a handler.
3. Implement the handler in the appropriate file under `src/engine/commands/handlers/`.
4. The TypeScript `default: assertNever(cmd)` guard will fail to compile if you forget the dispatcher case.

## Adding a new 2D tool

1. Create `src/app/components/editor/tools/MyTool.ts` implementing `ToolBase`.
2. Add one entry to `src/app/components/editor/tools/toolRegistry.ts`:
   ```ts
   { id: 'myTool', Tool: MyTool, icon: 'icon_name', shortcut: 'M', label: 'My Tool' }
   ```
3. That's it — `BottomNavBar`, `usePlanShortcuts`, and `PlanView2D` all read from the registry.

## Adding a new 2D layer

Add a new `<Layer>` component to `src/app/components/editor/PlanView2D/index.tsx`. Implement the layer in its own file under `PlanView2D/`. Follow the existing layer pattern (read snapshot from `useFloorPlanSnapshot`, render Konva shapes).

## File size budget

No source file should exceed 300 LOC. If a file grows beyond this, split it by concern — see the refactor plan for examples.
