/**
 * The persistence contract. UI code and server actions only talk to `DataStore`;
 * nothing outside `src/lib/data/<driver>/` knows how data is stored.
 *
 * Today: `json` driver (a file on disk). Later: add `src/lib/data/drizzle/` that
 * implements the same interface against Postgres and switch `DATA_DRIVER=drizzle`.
 */
import type {
  ChapterDraft,
  Collection,
  LngLat,
  MapPoint,
  PointDetail,
  PointSearchResult,
  CollectionInput,
  CollectionSummary,
  Point,
  PointInput,
  PointUsage,
  Story,
  StoryDetail,
  StoryInput,
  StorySummary,
} from "@/lib/domain/schema"

export interface PointRepository {
  list(): Promise<Point[]>
  get(id: string): Promise<Point | null>
  create(input: PointInput): Promise<Point>
  update(id: string, input: Partial<PointInput>): Promise<Point>
  /** Also removes the point from any chapters it is in. */
  delete(id: string): Promise<void>
  /** Stories/chapters that use each point, keyed by point id. */
  usage(): Promise<Record<string, PointUsage[]>>
  /**
   * Lightweight rows for drawing points on a map.
   * Stage 2 (see README): takes a map tile / bbox and returns only the points (or clusters) in it.
   */
  mapList(): Promise<MapPoint[]>
  /** One point plus the stories that use it, for the details panel. */
  detail(id: string): Promise<PointDetail | null>
  /** Text search over title, description, place name and tags. */
  search(opts: PointSearchOptions): Promise<PointSearchResult>
}

export type PointSearchOptions = {
  q: string
  /** Rank `top` by distance from here (usually the map center). */
  near?: LngLat
  /** How many full points to return in `top`. */
  limit?: number
  /** Max ids to return. */
  maxIds?: number
}

export interface CollectionRepository {
  list(): Promise<CollectionSummary[]>
  get(id: string): Promise<Collection | null>
  create(input: CollectionInput): Promise<Collection>
  update(id: string, input: Partial<CollectionInput>): Promise<Collection>
  /** Cascades to the collection's stories and chapters (never to points). */
  delete(id: string): Promise<void>
}

export interface StoryRepository {
  listByCollection(collectionId: string): Promise<StorySummary[]>
  get(id: string): Promise<Story | null>
  getDetail(id: string): Promise<StoryDetail | null>
  create(input: StoryInput): Promise<Story>
  update(id: string, input: Partial<Omit<StoryInput, "collectionId">>): Promise<Story>
  delete(id: string): Promise<void>
  /** Replace the story's chapters (and their point memberships) with `chapters`, in order. */
  saveChapters(storyId: string, chapters: ChapterDraft[]): Promise<StoryDetail>
}

export interface DataStore {
  points: PointRepository
  collections: CollectionRepository
  stories: StoryRepository
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`)
    this.name = "NotFoundError"
  }
}
