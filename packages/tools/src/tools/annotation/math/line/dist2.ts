import type { Point2 } from '../types/Point2';

// tools/src/utilities/math/line
export function dist2(p1: Point2, p2: Point2): number {
  return (p1[0] - p2[0]) * (p1[0] - p2[0]) + (p1[1] - p2[1]) * (p1[1] - p2[1]);
}
