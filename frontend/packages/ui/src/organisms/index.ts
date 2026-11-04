export { SmartTable } from './SmartTable';
export type { SmartTableProps } from './SmartTable';
export { DataTable } from './DataTable';
export type { DataTableProps, DataTableRow, DataTableCell, DataTableEmptyState } from './DataTable';
export { KpiGrid } from './KpiGrid';
export type { KpiGridProps, KpiGridItem } from './KpiGrid';
export { default as NavbarIntern } from './Navbar/Navbar';
export type { NavbarProps as NavbarInternProps } from './Navbar/Navbar';
export { SidebarNav } from './SidebarNav';
export type { SidebarNavProps, SidebarNavSection, SidebarNavItem } from './SidebarNav';
export { TableCard } from './TableCard';
export type { TableCardProps } from './TableCard';
export { ProcessOverview } from './ProcessOverview';
export type { ProcessOverviewProps } from './ProcessOverview';
export { LoginForm } from './LoginForm';
export type { LoginFormProps } from './LoginForm';
export { KanbanBoard } from './KanbanBoard';
export type { KanbanBoardProps, KanbanBoardColumn } from './KanbanBoard';
export { KanbanColumn } from './KanbanColumn';
export type { KanbanColumnProps } from './KanbanColumn';
export { MatrixGrid } from './MatrixGrid';
export type { MatrixGridProps, MatrixGridRow, MatrixGridColumn } from './MatrixGrid';

// Plan Commercial organisms
export { DeckMetaForm } from './DeckMetaForm';
export type { DeckMetaFormProps, DeckMeta } from './DeckMetaForm';
export { SlideEditor } from './SlideEditor';
export type { SlideEditorProps, SlideProductRow, PackshotRect } from './SlideEditor';
export { ImageLibrary } from './ImageLibrary';
export type { ImageLibraryProps } from './ImageLibrary';
export { BrandWorkflow, PACKSHOT_STATUS_OPTIONS } from './BrandWorkflow';
export type { BrandWorkflowProps, BrandRow, BulkMode } from './BrandWorkflow';
export { ArchiveBrowser } from './ArchiveBrowser';
export type { ArchiveBrowserProps, ArchiveDeck, ArchiveMonth } from './ArchiveBrowser';
export { GeneratePanel } from './GeneratePanel';
export type {
  GeneratePanelProps, GenerateSummary, GenerateResult, GenerateProgressSnapshot,
} from './GeneratePanel';
export { MissingPackshotsModal } from './MissingPackshotsModal';
export type { MissingPackshotsModalProps } from './MissingPackshotsModal';

// ── PromoCanvasEditor (Konva-based) — PARKED ─────────────────────────────
// Source files in `./PromoCanvasEditor/` are kept for later re-enabling.
// To revive: `pnpm add konva react-konva` in apps/plan-commercial, then
// uncomment the two exports below + the import + canvas section in
// apps/plan-commercial/src/pages/ContentPage.tsx.
//
// export { PromoCanvasEditor, PROMO_DEFAULTS, SLIDE_W_IN, SLIDE_H_IN } from './PromoCanvasEditor';
// export type { PromoCanvasEditorProps, PromoLayout, PromoSlotPos, PromoSlot } from './PromoCanvasEditor';
