/**
 * Internal link recommendation helper.
 */

export const DEFAULT_LINK_BOUNDS = {
  minHub: 1,
  maxHub: 2,
  minCluster: 1,
  maxCluster: 3,
  maxDaily: 3
};

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {import('../store.js').InMemoryStore} store
 * @param {string} targetPostId
 * @param {typeof DEFAULT_LINK_BOUNDS} bounds
 */
export function recommendInternalLinks(store, targetPostId, bounds) {
  const posts = Array.from(store.posts.values()).filter((p) => p.id !== targetPostId);
  const hubs = posts.filter((p) => p.contentKind === "hub" || p.templateType === "monthly");
  const clusters = posts.filter(
    (p) => p.contentKind === "cluster" || p.templateType === "weekly"
  );
  const dailies = posts.filter((p) => p.contentKind === "daily" || p.templateType === "daily");

  const hubCount = clamp(hubs.length, bounds.minHub, bounds.maxHub);
  const clusterCount = clamp(clusters.length, bounds.minCluster, bounds.maxCluster);
  const dailyCount = Math.min(dailies.length, bounds.maxDaily);

  return {
    counts: {
      hub: hubCount,
      cluster: clusterCount,
      daily: dailyCount
    },
    links: {
      hub: hubs.slice(0, hubCount).map((p) => ({ id: p.id, title: p.title })),
      cluster: clusters.slice(0, clusterCount).map((p) => ({ id: p.id, title: p.title })),
      daily: dailies.slice(0, dailyCount).map((p) => ({ id: p.id, title: p.title }))
    }
  };
}
