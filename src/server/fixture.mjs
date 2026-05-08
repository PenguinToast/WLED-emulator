export const ringCounts = [1, 8, 12, 16, 24, 32, 40];
export const ringNames = ["Center", "Ring 1", "Ring 2", "Ring 3", "Ring 4", "Ring 5", "Ring 6"];

export function fixtureMetadata() {
  return {
    type: "rings",
    rings: ringCounts,
    segments: ringNames,
  };
}

export function createRingSegments() {
  let cursor = 0;
  return ringCounts.map((count, index) => {
    const start = cursor;
    cursor += count;
    return {
      id: index,
      n: ringNames[index],
      start,
      stop: cursor,
      len: count,
      grp: 1,
      spc: 0,
      of: 0,
      set: 0,
      on: true,
      frz: false,
      bri: 255,
      col: [[255, 160, 80], [0, 0, 0], [0, 0, 0]],
      fx: 9,
      sx: 128,
      ix: 160,
      pal: 1,
      sel: true,
      rev: false,
      mi: false,
    };
  });
}

