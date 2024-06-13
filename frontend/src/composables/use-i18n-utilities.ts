import { useNuxtApp } from "#imports"

import { useGetLocaleFormattedNumber } from "~/composables/use-get-locale-formatted-number"
import { ALL_MEDIA, AUDIO, IMAGE } from "~/constants/media"
import type { SupportedMediaType, SupportedSearchType } from "~/constants/media"
import type { Collection } from "~/types/search"

type KeyCollection = {
  zero: string
  count: string
  countMore: string
}
type KeyMapping = Record<SupportedMediaType, KeyCollection> & {
  all?: KeyCollection
}
/**
 * Not using dynamically-generated keys to ensure that
 * correct line is shown in the 'po' locale files
 */
const searchResultKeys = {
  [ALL_MEDIA]: {
    zero: "browsePage.allNoResults",
    count: "browsePage.allResultCount",
    countMore: "browsePage.allResultCountMore",
  },
  [IMAGE]: {
    zero: "browsePage.contentLink.image.zero",
    count: "browsePage.contentLink.image.count",
    countMore: "browsePage.contentLink.image.countMore",
  },
  [AUDIO]: {
    zero: "browsePage.contentLink.audio.zero",
    count: "browsePage.contentLink.audio.count",
    countMore: "browsePage.contentLink.audio.countMore",
  },
} satisfies KeyMapping

const collectionKeys = {
  source: {
    [IMAGE]: {
      zero: "collection.resultCountLabel.source.image.zero",
      count: "collection.resultCountLabel.source.image.count",
      countMore: "collection.resultCountLabel.source.image.countMore",
    },
    [AUDIO]: {
      zero: "collection.resultCountLabel.source.audio.zero",
      count: "collection.resultCountLabel.source.audio.count",
      countMore: "collection.resultCountLabel.source.audio.countMore",
    },
  },
  creator: {
    [IMAGE]: {
      zero: "collection.resultCountLabel.creator.image.zero",
      count: "collection.resultCountLabel.creator.image.count",
      countMore: "collection.resultCountLabel.creator.image.countMore",
    },
    [AUDIO]: {
      zero: "collection.resultCountLabel.creator.audio.zero",
      count: "collection.resultCountLabel.creator.audio.count",
      countMore: "collection.resultCountLabel.creator.audio.countMore",
    },
  },
  tag: {
    [IMAGE]: {
      zero: "collection.resultCountLabel.tag.image.zero",
      count: "collection.resultCountLabel.tag.image.count",
      countMore: "collection.resultCountLabel.tag.image.countMore",
    },
    [AUDIO]: {
      zero: "collection.resultCountLabel.tag.audio.zero",
      count: "collection.resultCountLabel.tag.audio.count",
      countMore: "collection.resultCountLabel.tag.audio.countMore",
    },
  },
} satisfies Record<Collection, KeyMapping>

export function getCountKey(resultsCount: number): keyof KeyCollection {
  return resultsCount === 0
    ? "zero"
    : resultsCount >= 10000
      ? "countMore"
      : "count"
}

/**
 * Returns the localized text for the number of search results.
 */
export function useI18nResultsCount() {
  const { t } = useNuxtApp().$i18n
  const getLocaleFormattedNumber = useGetLocaleFormattedNumber()

  const getLoading = () => t("header.loading")

  const getI18nKey = (
    resultsCount: number,
    searchType: SupportedSearchType
  ) => {
    const countKey = getCountKey(resultsCount)
    return searchResultKeys[searchType][countKey]
  }

  /**
   * Returns the localized text for the content link label.
   * E.g. "See 3,567 image results for 'cats'".
   */
  const getI18nContentLinkLabel = (
    resultsCount: number,
    query: string,
    mediaType: SupportedMediaType
  ) => {
    return t(getI18nKey(resultsCount, mediaType), {
      count: resultsCount,
      localeCount: getLocaleFormattedNumber(resultsCount),
      query,
      mediaType,
    })
  }
  const getI18nCollectionResultCountLabel = (
    resultCount: number,
    mediaType: SupportedMediaType,
    collectionType: Collection,
    params: Record<string, string> | undefined = undefined
  ) => {
    const key =
      collectionKeys[collectionType][mediaType][getCountKey(resultCount)]
    return t(key, {
      count: resultCount,
      localeCount: getLocaleFormattedNumber(resultCount),
      ...params,
    })
  }

  /**
   * Returns the localized text for the number of search results, using corresponding
   * pluralization rules and decimal separators.
   * E.g. "No results", "3,567 results", "Over 10,000 results".
   */
  const getI18nCount = (resultsCount: number) => {
    return t(getI18nKey(resultsCount, ALL_MEDIA), {
      count: resultsCount,
      localeCount: getLocaleFormattedNumber(resultsCount),
    })
  }

  return {
    getI18nCount,
    getI18nContentLinkLabel,
    getI18nCollectionResultCountLabel,
    getLoading,
  }
}
