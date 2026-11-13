import "server-only"

import { cache } from "react"
import { connection } from "next/server"
import { store } from "@/lib/data"

/*
 * Read helpers for Server Components. `connection()` marks the read as request-time
 * (the JSON file or Postgres must never be baked into a prerender);
 * `cache()` dedupes calls within one request.
 */

export const getPoints = cache(async () => {
  await connection()
  return store.points.list()
})

export const getPoint = cache(async (id: string) => {
  await connection()
  return store.points.get(id)
})

/** Lightweight rows for maps that show many points (see MapPoint). */
export const getMapPoints = cache(async () => {
  await connection()
  return store.points.mapList()
})

export const getPointUsage = cache(async () => {
  await connection()
  return store.points.usage()
})

export const getCollections = cache(async () => {
  await connection()
  return store.collections.list()
})

export const getCollection = cache(async (id: string) => {
  await connection()
  return store.collections.get(id)
})

export const getStoriesByCollection = cache(async (collectionId: string) => {
  await connection()
  return store.stories.listByCollection(collectionId)
})

export const getStoryDetail = cache(async (id: string) => {
  await connection()
  return store.stories.getDetail(id)
})
