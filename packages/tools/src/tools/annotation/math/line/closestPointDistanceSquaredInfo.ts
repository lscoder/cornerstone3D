import { dist2 } from './dist2';
import type { Point2 } from '../types/Point2';

export function getClosestPointDistanceSquaredInfo(
  lineStart: Point2,
  lineEnd: Point2,
  point: Point2
): {
  point: Point2;
  distanceSquared: number;
} {
  let closestPoint: Point2;
  const d2 = dist2(lineStart, lineEnd);

  if (d2 === 0) {
    closestPoint = lineStart;
  }

  if (!closestPoint) {
    const t =
      ((point[0] - lineStart[0]) * (lineEnd[0] - lineStart[0]) +
        (point[1] - lineStart[1]) * (lineEnd[1] - lineStart[1])) /
      d2;

    if (t < 0) {
      closestPoint = lineStart;
    } else if (t > 1) {
      closestPoint = lineEnd;
    } else {
      closestPoint = [
        lineStart[0] + t * (lineEnd[0] - lineStart[0]),
        lineStart[1] + t * (lineEnd[1] - lineStart[1]),
      ];
    }
  }

  return {
    point: [...closestPoint],
    distanceSquared: dist2(point, closestPoint),
  };
}
