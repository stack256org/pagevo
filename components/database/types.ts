export type ViewType = "table" | "board" | "calendar" | "gallery" | "gantt";

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "person"
  | "relation"
  | "rollup"
  | "formula"
  | "created_by"
  | "files";

export type RollupAggregation =
  | "count"
  | "count_values"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "range"
  | "earliest"
  | "latest";

export type DateFormatOption =
  | "full"
  | "short"
  | "mdy"
  | "dmy"
  | "ymd"
  | "relative";
export type TimeFormatOption = "hidden" | "12h" | "24h";
export type ReminderOption =
  | "at_time"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "1d"
  | "2d";

// Value shape for a `date`-type property. `date` is the only field every
// pre-existing reader/writer knows about (board/gallery visibility checks,
// calendar view, sort/filter, rollups) — everything else is additive and
// only understood by the rich date editor and its display formatter.
export interface DateValue {
  date: string | null; // yyyy-MM-dd, start date
  dateFormat?: DateFormatOption;
  endDate?: string | null; // yyyy-MM-dd, only set when range is enabled
  endTime?: string | null;
  includeTime?: boolean;
  reminder?: ReminderOption | null;
  time?: string | null; // HH:mm 24h wall-clock in `timezone`, only set when includeTime
  timeFormat?: TimeFormatOption;
  timezone?: string | null; // IANA zone, e.g. "Asia/Kolkata"; unset = browser default
}

// Value shape for a `files`-type property. `id` is a `file_uploads.id` for
// uploaded files, or a client-generated id for external links (which have no
// backing `file_uploads` row — `mimeType`/`sizeBytes` are unknown for those).
export interface FileItem {
  id: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
  url: string;
}

export interface FilesValue {
  files: FileItem[];
}

export interface DbView {
  boardSettings?: {
    hiddenGroupOptionIds?: string[];
    hiddenStatusGroupKeys?: StatusGroupKey[];
    hideAggregation?: boolean;
    sortDirection?: "manual" | "asc" | "desc";
    hideEmptyGroups?: boolean;
    colorColumns?: boolean;
    statusBy?: "group" | "option";
    pinnedGroupOptionIds?: string[];
    pinnedStatusGroupKeys?: StatusGroupKey[];
  };
  calendarPropertyId: string | null;
  cardDisplayProps: string[];
  databaseId: string;
  entryOpenMode: "side_panel" | "full_page";
  filterLogic: "and" | "or";
  filters: FilterRule[];
  galleryCardSize: "small" | "medium" | "large" | null;
  ganttEndPropertyId: string | null;
  ganttStartPropertyId: string | null;
  groupByPropertyId: string | null;
  hiddenPropertyIds: string[];
  id: string;
  name: string;
  orderIndex: number;
  propertyOrder: string[];
  propertyOverrides: ViewPropertyOverrides;
  sorts: SortRule[];
  type: ViewType;
}

export type StatusGroupKey = "todo" | "in_progress" | "complete";

/** Per-view copy of settings that otherwise live globally on a property's config;
 *  absent falls back to the property's global `config` — see view-property-resolver.ts. */
export interface ViewPropertyOverride {
  displayAs?: "select" | "checkbox";
  /** Table only — ignored by Board/Calendar/Gallery, which show cards, not columns. */
  width?: number;
  wrapContent?: boolean;
}

export type ViewPropertyOverrides = Record<string, ViewPropertyOverride>;

export interface SelectOption {
  color: string;
  group?: StatusGroupKey;
  id: string;
  name: string;
}

export interface DbPropertyConfig {
  /** Rollup only. */
  aggregation?: RollupAggregation;
  displayAs?: "select" | "checkbox";
  /** Formula only — the raw expression text (see lib/formula/). */
  expression?: string;
  format?: string;
  groupedByStatus?: boolean;
  /** Custom property icon, same format as page icons (emoji, or JSON for a lucide icon / uploaded image). */
  icon?: string;
  includeTime?: boolean;
  options?: SelectOption[];
  relatedDatabaseId?: string;
  /** Rollup only — which of THIS database's own Relation properties to
   *  aggregate through. */
  relationPropertyId?: string;
  /** Calendar/Gallery card display, Status-only — everything else is never
   *  shown on those cards regardless of this flag. Off by default: a new
   *  entry's card shows just its title until explicitly enabled here. */
  showOnCard?: boolean;
  /** Rollup only — which property on the related database to aggregate. */
  targetPropertyId?: string;
  /** Person only — self-service vote: members can only add/remove their own id
   *  (enforced server-side), clicking toggles it directly. Admins keep full picker. */
  voteMode?: boolean;
  wrapContent?: boolean;
}

export interface DbProperty {
  config: DbPropertyConfig;
  databaseId: string;
  defaultValue: unknown;
  id: string;
  isBackRelation: boolean;
  isHidden: boolean;
  isSystem: boolean;
  name: string;
  orderIndex: number;
  type: PropertyType;
}

export interface DbEntry {
  /** Open (unresolved) top-level comment count — undefined on entries created
   *  client-side before their first real fetch (createEntry/duplicateEntry). */
  commentCount?: number;
  coverUrl: string | null;
  createdAt: string;
  databaseId: string | null;
  icon: string | null;
  id: string;
  shortId: string;
  title: string | null;
  updatedAt: string;
  workspaceId: string;
}

export interface DbPropertyValue {
  entryId: string;
  id: string;
  propertyId: string;
  value: unknown;
}

export interface FilterRule {
  operator: string;
  propertyId: string;
  value: unknown;
}

export interface SortRule {
  direction: "asc" | "desc";
  propertyId: string;
}

export interface WorkspaceMember {
  id: string;
  isOwner?: boolean;
  role: "admin" | "editor" | "viewer";
  status: string;
  userEmail: string | null;
  userId: string;
  userImage: string | null;
  userName: string | null;
  userTimezone?: string | null;
}

export interface SharedViewProps {
  activeView: DbView | null;
  databaseId: string;
  entries: DbEntry[];
  isEditor: boolean;
  onAddProperty: (
    name: string,
    type: string,
    config?: DbPropertyConfig,
    twoWay?: boolean
  ) => Promise<DbProperty | undefined>;
  onCreateEntry: (
    defaultValues?: Record<string, unknown>
  ) => Promise<DbEntry | undefined>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onDeleteProperty: (propId: string) => Promise<void>;
  onDuplicateEntry?: (entryId: string) => Promise<void>;
  onOpenEntry?: (entry: DbEntry) => void;
  onSelectEntry: (entryId: string, selected: boolean) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => Promise<void>;
  onUpdateProperty: (
    propId: string,
    patch: Record<string, unknown>
  ) => Promise<void>;
  onUpdateTitle: (entryId: string, title: string) => Promise<void>;
  onUpdateValue: (
    entryId: string,
    propId: string,
    value: unknown
  ) => Promise<void>;
  onUpdateView: (patch: Record<string, unknown>) => Promise<void>;
  properties: DbProperty[];
  selectedEntryIds: Set<string>;
  valueMap: Map<string, Map<string, unknown>>;
  workspaceId: string;
  workspaceSlug: string;
}
