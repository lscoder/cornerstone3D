import type { Point2 } from '../types/Point2';
import { distanceToPointSquared } from './distanceToPointSquared';

// tools/src/utilities/math/line
export function distanceToPoint(
  lineStart: Point2,
  lineEnd: Point2,
  point: Point2
): number {
  if (lineStart.length !== 2 || lineEnd.length !== 2 || point.length !== 2) {
    throw Error(
      'lineStart, lineEnd, and point should have 2 elements of [x, y]'
    );
  }

  return Math.sqrt(distanceToPointSquared(lineStart, lineEnd, point));
}
