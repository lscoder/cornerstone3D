import type { Point2 } from '../types/Point2';
import { dist2 } from './dist2';

// tools/src/utilities/math/line
export function dist(p1: Point2, p2: Point2): number {
  return Math.sqrt(dist2(p1, p2));
}
