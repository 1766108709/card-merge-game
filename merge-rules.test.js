"use strict";

const assert = require("node:assert/strict");
const {
  CARD_RANKS,
  SAFE_RANK_SEQUENCES,
  getNextRank,
  resolveRankIds,
  sortRankIds,
} = require("./merge-rules.js");

assert.deepEqual(
  CARD_RANKS.map((rank) => rank.label),
  ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "小王", "大王"],
);

assert.equal(getNextRank("2").id, "3");
assert.equal(getNextRank("K").id, "A");
assert.equal(getNextRank("A").id, "SMALL_JOKER");
assert.equal(getNextRank("SMALL_JOKER").id, "BIG_JOKER");
assert.equal(getNextRank("BIG_JOKER"), null);

assert.deepEqual(
  sortRankIds(["A", "3", "BIG_JOKER", "10", "2", "SMALL_JOKER", "K"]),
  ["2", "3", "10", "K", "A", "SMALL_JOKER", "BIG_JOKER"],
);

assert.deepEqual(resolveRankIds(["2", "2"]).ranks, ["3"]);
assert.deepEqual(resolveRankIds(["K", "K"]).ranks, ["A"]);
assert.deepEqual(resolveRankIds(["A", "A"]).ranks, ["SMALL_JOKER"]);
assert.deepEqual(resolveRankIds(["SMALL_JOKER", "SMALL_JOKER"]).ranks, ["BIG_JOKER"]);
assert.deepEqual(resolveRankIds(["BIG_JOKER", "BIG_JOKER"]).ranks, []);

const longChain = resolveRankIds(["2", "3", "4", "5", "6", "2"]);
assert.deepEqual(longChain.ranks, ["7"]);
assert.deepEqual(
  longChain.events.map((event) => `${event.from}->${event.to}`),
  ["2->3", "3->4", "4->5", "5->6", "6->7"],
);

const terminalChain = resolveRankIds([
  "K",
  "A",
  "SMALL_JOKER",
  "BIG_JOKER",
  "K",
]);
assert.deepEqual(terminalChain.ranks, []);
assert.equal(terminalChain.events.at(-1).eliminated, true);

SAFE_RANK_SEQUENCES.forEach((sequence, levelIndex) => {
  let tray = [];
  let largestTray = 0;
  sequence.forEach((rankId) => {
    for (let copy = 0; copy < 2; copy += 1) {
      tray.push(rankId);
      tray = resolveRankIds(tray).ranks;
      largestTray = Math.max(largestTray, tray.length);
      assert.ok(
        tray.length < 7,
        `第 ${levelIndex + 1} 关的保底路线不应装满收集槽`,
      );
    }
  });
  assert.ok(largestTray > 0);
});

console.log("All card merge rule tests passed.");
