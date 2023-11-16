import { dist2 } from './dist2';
import type { Point2 } from '../types/Point2';

// tools/src/utilities/math/line
export function distanceToPointSquared(
  lineStart: Point2,
  lineEnd: Point2,
  point: Point2
): number {
  const d2 = dist2(lineStart, lineEnd);

  if (d2 === 0) {
    return dist2(point, lineStart);
  }

  const t =
    ((point[0] - lineStart[0]) * (lineEnd[0] - lineStart[0]) +
      (point[1] - lineStart[1]) * (lineEnd[1] - lineStart[1])) /
    d2;

  if (t < 0) {
    return dist2(point, lineStart);
  }
  if (t > 1) {
    return dist2(point, lineEnd);
  }

  const pt: Point2 = [
    lineStart[0] + t * (lineEnd[0] - lineStart[0]),
    lineStart[1] + t * (lineEnd[1] - lineStart[1]),
  ];

  return dist2(point, pt);
}
