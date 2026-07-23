(function exposeCardMergeRules(root, factory) {
  const rules = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
  if (root) root.CardMergeRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCardMergeRules() {
  "use strict";

  const CARD_RANKS = Object.freeze([
    { id: "2", label: "2", name: "2 牌", value: 2 },
    { id: "3", label: "3", name: "3 牌", value: 3 },
    { id: "4", label: "4", name: "4 牌", value: 4 },
    { id: "5", label: "5", name: "5 牌", value: 5 },
    { id: "6", label: "6", name: "6 牌", value: 6 },
    { id: "7", label: "7", name: "7 牌", value: 7 },
    { id: "8", label: "8", name: "8 牌", value: 8 },
    { id: "9", label: "9", name: "9 牌", value: 9 },
    { id: "10", label: "10", name: "10 牌", value: 10 },
    { id: "J", label: "J", name: "J 牌", value: 11 },
    { id: "Q", label: "Q", name: "Q 牌", value: 12 },
    { id: "K", label: "K", name: "K 牌", value: 13 },
    { id: "A", label: "A", name: "A 牌", value: 14 },
    { id: "SMALL_JOKER", label: "小王", name: "小王", value: 15 },
    { id: "BIG_JOKER", label: "大王", name: "大王", value: 16 },
  ]);

  const SAFE_RANK_SEQUENCES = Object.freeze([
    Object.freeze(["6", "2", "3", "4", "5", "2", "7", "3", "4", "5", "6", "3", "7", "2", "4"]),
    Object.freeze([
      "6", "2", "3", "4", "5", "2",
      "7", "8", "9", "10", "J", "Q",
      "K", "4", "5", "6", "7", "4",
      "8", "9", "10", "J", "Q", "K",
    ]),
    Object.freeze([
      "BIG_JOKER", "2", "10", "J", "Q", "K",
      "A", "J", "SMALL_JOKER", "3", "4", "5",
      "2", "7", "8", "9", "BIG_JOKER", "6",
      "BIG_JOKER", "Q", "K", "A", "J", "SMALL_JOKER",
      "3", "4", "5", "6", "3", "7",
    ]),
  ]);

  const RANK_INDEX = new Map(CARD_RANKS.map((rank, index) => [rank.id, index]));

  function getRank(rankId) {
    return CARD_RANKS.find((rank) => rank.id === rankId) || null;
  }

  function getNextRank(rankId) {
    const rankIndex = CARD_RANKS.findIndex((rank) => rank.id === rankId);
    if (rankIndex < 0 || rankIndex === CARD_RANKS.length - 1) return null;
    return CARD_RANKS[rankIndex + 1];
  }

  function compareRankIds(leftRankId, rightRankId) {
    const leftIndex = RANK_INDEX.get(leftRankId);
    const rightIndex = RANK_INDEX.get(rightRankId);
    if (leftIndex === undefined || rightIndex === undefined) {
      throw new Error("无法排序未知的牌面点数");
    }
    return leftIndex - rightIndex;
  }

  function sortRankIds(rankIds) {
    return [...rankIds].sort(compareRankIds);
  }

  function resolveRankIds(rankIds) {
    const result = [...rankIds];
    const events = [];

    rankIds.forEach((rankId) => {
      if (!getRank(rankId)) throw new Error(`未知牌面点数：${rankId}`);
    });

    while (true) {
      let pair = null;
      for (const rank of CARD_RANKS) {
        const indexes = [];
        result.forEach((rankId, index) => {
          if (rankId === rank.id && indexes.length < 2) indexes.push(index);
        });
        if (indexes.length === 2) {
          pair = { rank, indexes };
          break;
        }
      }

      if (!pair) break;
      const nextRank = getNextRank(pair.rank.id);
      result.splice(pair.indexes[1], 1);
      result.splice(pair.indexes[0], 1);
      if (nextRank) result.push(nextRank.id);
      events.push({
        from: pair.rank.id,
        to: nextRank?.id || null,
        eliminated: !nextRank,
      });
    }

    return { ranks: sortRankIds(result), events };
  }

  return Object.freeze({
    CARD_RANKS,
    SAFE_RANK_SEQUENCES,
    getRank,
    getNextRank,
    compareRankIds,
    sortRankIds,
    resolveRankIds,
  });
});
