import { defineNuxtRouteMiddleware, firstParam } from "#imports"

import { useSingleResultStore } from "~/stores/media/single-result"
import { useSearchStore } from "~/stores/search"

import { AUDIO, IMAGE, supportedMediaTypes } from "~/constants/media"

const searchPaths = [
  ...supportedMediaTypes.map((type) => `search-${type}`),
  "search",
]

const isSearchPath = (name: string | symbol | null | undefined) => {
  return name ? searchPaths.includes(String(name).split("__")[0]) : false
}
const isCollectionPath = (path: string) => path.includes("/collection")

export default defineNuxtRouteMiddleware(async (to, from) => {
  const mediaType = to.fullPath.includes("/image/") ? IMAGE : AUDIO
  const singleResultStore = useSingleResultStore()

  const mediaId = firstParam(to.params.id)
  if (!mediaId) {
    return
  }
  singleResultStore.setMediaById(mediaType, mediaId)
  if (from && (isSearchPath(from.name) || isCollectionPath(from.path))) {
    const searchStore = useSearchStore()
    searchStore.setBackToSearchPath(from.fullPath)

    if (isSearchPath(from.name)) {
      const searchTerm = firstParam(to.query.q) ?? ""
      if (searchTerm) {
        searchStore.setSearchTerm(searchTerm)
      }
    }
  }
})
