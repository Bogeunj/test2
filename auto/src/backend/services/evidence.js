/**
 * Evidence evaluation: determines whether a claim has enough independent sources.
 */

/**
 * @param {import('../store.js').InMemoryStore} store
 * @param {string} claimId
 */
export function evaluateClaimEvidence(store, claimId) {
  const claim = store.getClaim(claimId);
  if (!claim) throw new Error(`Claim not found: ${claimId}`);

  const requiredIndependentSources = claim.severity === "critical" ? 2 : 1;

  const citations = store.listCitationsByClaim(claimId);
  const independenceGroups = new Set();
  for (const citation of citations) {
    const source = store.getSource(citation.sourceId);
    if (!source) continue;
    if (typeof source.independenceGroup === "string" && source.independenceGroup.length > 0) {
      independenceGroups.add(source.independenceGroup);
    } else {
      // If no group provided, fall back to domain (still a form of independence bucket).
      independenceGroups.add(source.domain ?? source.id);
    }
  }

  const foundIndependentSources = independenceGroups.size;
  const missingIndependentSources = Math.max(0, requiredIndependentSources - foundIndependentSources);
  const passes = missingIndependentSources === 0;

  return {
    claimId,
    passes,
    requiredIndependentSources,
    foundIndependentSources,
    missingIndependentSources
  };
}
